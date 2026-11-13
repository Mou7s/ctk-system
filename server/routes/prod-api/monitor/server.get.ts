import os from 'node:os'
import { statfsSync } from 'node:fs'
import { getAuthSession } from '../../../utils/auth'
import { apiError, apiSuccess, errorMessage } from '../../../utils/response'

type CpuSnapshot = {
  user: number
  nice: number
  sys: number
  idle: number
  wait: number
  irq: number
}

function cpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus()
  return cpus.reduce<CpuSnapshot>((total, cpu) => ({
    user: total.user + cpu.times.user,
    nice: total.nice + cpu.times.nice,
    sys: total.sys + cpu.times.sys,
    idle: total.idle + cpu.times.idle,
    wait: total.wait,
    irq: total.irq + cpu.times.irq,
  }), { user: 0, nice: 0, sys: 0, idle: 0, wait: 0, irq: 0 })
}

function cpuPercentages(before: CpuSnapshot, after: CpuSnapshot) {
  const user = after.user - before.user
  const nice = after.nice - before.nice
  const sys = after.sys - before.sys
  const idle = after.idle - before.idle
  const wait = after.wait - before.wait
  const irq = after.irq - before.irq
  const total = user + nice + sys + idle + wait + irq
  const percent = (value: number) => total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0
  return {
    cpuNum: os.cpus().length,
    total: 100,
    sys: percent(sys + irq),
    used: percent(user + nice),
    wait: percent(wait),
    free: percent(idle),
  }
}

async function sampleCpu() {
  const before = cpuSnapshot()
  await new Promise((resolve) => setTimeout(resolve, 100))
  return cpuPercentages(before, cpuSnapshot())
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function localIp(): string {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

function formatBytes(value: number): string {
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024
  if (value >= gb) return `${(value / gb).toFixed(1)} GB`
  if (value >= mb) return `${(value / mb).toFixed(value / mb > 100 ? 0 : 1)} MB`
  if (value >= kb) return `${(value / kb).toFixed(value / kb > 100 ? 0 : 1)} KB`
  return `${Math.round(value)} B`
}

function diskInfo() {
  try {
    const path = process.cwd()
    const stats = statfsSync(path)
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    const used = Math.max(0, total - free)
    return [{
      dirName: path,
      sysTypeName: 'filesystem',
      typeName: 'Node.js runtime',
      total: formatBytes(total),
      free: formatBytes(free),
      used: formatBytes(used),
      usage: total > 0 ? round((used / total) * 100, 2) : 0,
    }]
  } catch {
    // Node does not expose statfs on every supported Windows runtime. Keep the
    // Java-compatible field instead of failing the complete monitor response.
    return []
  }
}

function duration(seconds: number): string {
  let remaining = Math.max(0, Math.floor(seconds))
  const days = Math.floor(remaining / 86400)
  remaining %= 86400
  const hours = Math.floor(remaining / 3600)
  remaining %= 3600
  const minutes = Math.floor(remaining / 60)
  const secs = remaining % 60
  return `${days}天${hours}小时${minutes}分钟${secs}秒`
}

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const [cpu, memory] = await Promise.all([
      sampleCpu(),
      Promise.resolve({ total: os.totalmem(), free: os.freemem() }),
    ])
    const usedMemory = Math.max(0, memory.total - memory.free)
    const heap = process.memoryUsage()
    const heapLimit = Number(heap.heapTotal) > 0 ? heap.heapTotal : heap.rss
    const jvmTotal = Number(heap.heapTotal)
    const jvmFree = Math.max(0, jvmTotal - Number(heap.heapUsed))

    return apiSuccess({
      cpu,
      mem: {
        total: round(memory.total / 1024 ** 3),
        used: round(usedMemory / 1024 ** 3),
        free: round(memory.free / 1024 ** 3),
        usage: memory.total > 0 ? round((usedMemory / memory.total) * 100, 2) : 0,
      },
      jvm: {
        total: round(jvmTotal / 1024 ** 2),
        max: round(Math.max(jvmTotal, heapLimit) / 1024 ** 2),
        free: round(jvmFree / 1024 ** 2),
        used: round((jvmTotal - jvmFree) / 1024 ** 2),
        usage: jvmTotal > 0 ? round(((jvmTotal - jvmFree) / jvmTotal) * 100, 2) : 0,
        name: 'Node.js',
        version: process.version,
        home: process.execPath,
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        runTime: duration(process.uptime()),
        inputArgs: process.execArgv.join(', '),
      },
      sys: {
        computerName: os.hostname(),
        computerIp: localIp(),
        osName: os.type(),
        osArch: os.arch(),
        userDir: process.cwd(),
      },
      sysFiles: diskInfo(),
    })
  } catch (error) {
    console.error('[NitroMonitor] server info failed:', errorMessage(error, 'unknown error'))
    return apiError('获取服务信息失败', 500)
  }
})
