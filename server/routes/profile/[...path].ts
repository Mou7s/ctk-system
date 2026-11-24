import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { getRouterParam, sendStream, setHeader } from 'h3'
import { getNitroServerConfig } from '../../utils/runtime'
import { apiError } from '../../utils/response'

export default defineEventHandler(async (event) => {
  const raw = String(getRouterParam(event, 'path') || '').replaceAll('\\', '/')
  if (!raw || raw.includes('\0') || raw.split('/').some((part) => part === '..')) return apiError('资源路径不符合规范', 400)
  const root = resolve(getNitroServerConfig().profilePath)
  const file = resolve(root, raw)
  const rel = relative(root, file)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) return apiError('资源路径不符合规范', 400)

  if (!existsSync(file)) {
    return apiError('资源不存在', 404)
  }

  try {
    const stat = statSync(file)
    if (!stat.isFile()) return apiError('资源不存在', 404)
    const extension = extname(file).toLowerCase()
    const types: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
    }
    setHeader(event, 'content-type', types[extension] || 'application/octet-stream')
    setHeader(event, 'content-length', stat.size)
    setHeader(event, 'cache-control', 'private, max-age=60')
    return sendStream(event, createReadStream(file))
  } catch {
    return apiError('资源不存在', 404)
  }
})
