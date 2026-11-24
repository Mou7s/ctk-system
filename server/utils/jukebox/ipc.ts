import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'

let nextRequestId = 1

function parseJsonLine(line: string): Record<string, any> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 通过 Unix Socket 向 mpv 发送无返回依赖的控制命令。
 */
export function sendMpvCommand(ipcPath: string, command: unknown[], timeoutMs = 2000): Promise<boolean> {
  if (!ipcPath || !existsSync(ipcPath)) return Promise.resolve(false)

  return new Promise((resolve) => {
    let settled = false
    const requestId = nextRequestId++
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(ok)
    }

    const socket = createConnection({ path: ipcPath })
    const timer = setTimeout(() => finish(false), Math.max(100, timeoutMs))

    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ command, request_id: requestId })}\n`, (error) => {
        if (error) {
          finish(false)
          return
        }
        finish(true)
      })
    })

    socket.once('error', () => finish(false))
  })
}

/**
 * 通过 Unix Socket 查询单个 mpv 运行时属性（如 time-pos、duration、pause）。
 */
export function getMpvProperty<T = unknown>(ipcPath: string, name: string, timeoutMs = 500): Promise<T | null> {
  if (!ipcPath || !existsSync(ipcPath)) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    let buffer = ''
    const requestId = nextRequestId++
    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(value)
    }

    const socket = createConnection({ path: ipcPath })
    const timer = setTimeout(() => finish(null), Math.max(100, timeoutMs))

    socket.once('connect', () => {
      const payload = `${JSON.stringify({ command: ['get_property', name], request_id: requestId })}\n`
      socket.write(payload, (error) => {
        if (error) finish(null)
      })
    })

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        const parsed = parseJsonLine(line)
        if (parsed && (parsed.request_id === requestId || ('error' in parsed && !('event' in parsed)))) {
          finish(parsed.data === undefined ? null : (parsed.data as T))
          return
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })

    socket.once('end', () => finish(null))
    socket.once('error', () => finish(null))
  })
}
