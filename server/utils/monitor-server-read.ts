import os from 'node:os'
import { statfsSync } from 'node:fs'

export interface CpuLoadAvg {
  supported: boolean
  one: number
  five: number
  fifteen: number
  ratio1m: number
}

export interface MonitorCpuInfo {
  cpuNum: number
  model: string
  speedMHz: number
  total: number
  used: number
  sys: number
  wait: number
  free: number
  totalUsage: number
  loadAvg: CpuLoadAvg
}

export interface MonitorMemInfo {
  total: number
  used: number
  free: number
  usage: number
  totalBytes: number
  usedBytes: number
  freeBytes: number
}

export interface MonitorRuntimeMemory {
  rssMB: number
  heapUsedMB: number
  heapTotalMB: number
  externalMB: number
  arrayBuffersMB: number
  rssBytes: number
  systemUsage: number
}

export interface MonitorRuntimeInfo {
  name: 'Bun' | 'Node.js'
  version: string
  engine: 'JavaScriptCore' | 'V8'
  nodeCompatVersion: string
  execPath: string
  pid: number
  startTime: string
  uptimeSeconds: number
  runTime: string
  inputArgs: string
  memory: MonitorRuntimeMemory
}

export interface MonitorSysInfo {
  computerName: string
  computerIp: string
  osName: string
  osRelease: string
  platform: string
  osArch: string
  userDir: string
  uptimeSeconds: number
  runTime: string
}

export interface MonitorSysFileInfo {
  dirName: string
  sysTypeName: string
  typeName: string
  total: string
  free: string
  used: string
  usage: number
}

export interface MonitorJvmCompatInfo {
  name: string
  version: string
  home: string
  startTime: string
  runTime: string
  inputArgs: string
  total: number
  max: number
  used: number
  free: number
  usage: number
}

export interface MonitorServerResponse {
  collectedAt: string
  cpu: MonitorCpuInfo
  mem: MonitorMemInfo
  runtime: MonitorRuntimeInfo
  sys: MonitorSysInfo
  sysFiles: MonitorSysFileInfo[]
  jvm: MonitorJvmCompatInfo
}

export interface MonitorServerCollectorDeps {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  cpus?: () => os.CpuInfo[]
  loadavg?: () => number[]
  totalmem?: () => number
  freemem?: () => number
  hostname?: () => string
  networkInterfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
  osType?: () => string
  osRelease?: () => string
  platform?: () => NodeJS.Platform
  osArch?: () => string
  osUptime?: () => number
  cwd?: () => string
  pid?: number
  execPath?: string
  execArgv?: readonly string[]
  processUptime?: () => number
  memoryUsage?: () => NodeJS.MemoryUsage
  versions?: Record<string, string | undefined>
  processVersion?: string
  statfs?: (path: string) => { blocks: number | bigint; bsize: number | bigint; bavail: number | bigint }
}

type CpuSnapshot = {
  user: number
  nice: number
  sys: number
  idle: number
  wait: number
  irq: number
}

const CPU_CACHE_MIN_INTERVAL_MS = 500
const CPU_CACHE_MAX_INTERVAL_MS = 30_000
const CPU_SAMPLE_DELAY_MS = 100
const SENSITIVE_ARG_PATTERN = /(password|passwd|secret|token|key|auth|credential)/i
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)([^/\s@]+)(@)/gi

let cachedCpuSample: { snapshot: CpuSnapshot; timestamp: number } | null = null

export function resetCpuSampleCache(): void {
  cachedCpuSample = null
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function stripLeadingV(version: string | undefined): string {
  return String(version || '').trim().replace(/^v/i, '')
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

export function formatDuration(seconds: number): string {
  let remaining = Math.max(0, Math.floor(seconds))
  const days = Math.floor(remaining / 86400)
  remaining %= 86400
  const hours = Math.floor(remaining / 3600)
  remaining %= 3600
  const minutes = Math.floor(remaining / 60)
  const secs = remaining % 60
  return `${days}天${hours}小时${minutes}分钟${secs}秒`
}

export function sanitizeExecArgv(argv: readonly string[]): string {
  if (!Array.isArray(argv) || argv.length === 0) return ''
  const sanitized: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const raw = String(argv[i] ?? '')
    const eqIndex = raw.indexOf('=')

    if (eqIndex > 0) {
      const key = raw.slice(0, eqIndex)
      const val = raw.slice(eqIndex + 1)
      if (SENSITIVE_ARG_PATTERN.test(key)) {
        sanitized.push(`${key}=***`)
      } else {
        sanitized.push(`${key}=${val.replace(URL_CREDENTIAL_PATTERN, '$1***$3')}`)
      }
      continue
    }

    if (raw.startsWith('-') && SENSITIVE_ARG_PATTERN.test(raw)) {
      sanitized.push(raw)
      const next = argv[i + 1]
      if (next !== undefined && !String(next).startsWith('-')) {
        sanitized.push('***')
        i += 1
      }
      continue
    }

    sanitized.push(raw.replace(URL_CREDENTIAL_PATTERN, '$1***$3'))
  }

  return sanitized.join(' ')
}

function cpuSnapshot(cpus: os.CpuInfo[]): CpuSnapshot {
  return cpus.reduce<CpuSnapshot>((total, cpu) => ({
    user: total.user + cpu.times.user,
    nice: total.nice + cpu.times.nice,
    sys: total.sys + cpu.times.sys,
    idle: total.idle + cpu.times.idle,
    wait: total.wait,
    irq: total.irq + cpu.times.irq,
  }), { user: 0, nice: 0, sys: 0, idle: 0, wait: 0, irq: 0 })
}

function buildLoadAvg(loadavg: number[], cpuNum: number, platform: NodeJS.Platform): CpuLoadAvg {
  const supported = platform !== 'win32'
  const one = supported ? round(Number(loadavg[0] || 0), 2) : 0
  const five = supported ? round(Number(loadavg[1] || 0), 2) : 0
  const fifteen = supported ? round(Number(loadavg[2] || 0), 2) : 0
  const ratio1m = supported && cpuNum > 0 ? round(one / cpuNum, 2) : 0
  return { supported, one, five, fifteen, ratio1m }
}

function cpuMetricsFromSnapshots(
  before: CpuSnapshot,
  after: CpuSnapshot,
  cpus: os.CpuInfo[],
  loadavg: number[],
  platform: NodeJS.Platform,
): MonitorCpuInfo {
  const user = Math.max(0, after.user - before.user)
  const nice = Math.max(0, after.nice - before.nice)
  const sys = Math.max(0, after.sys - before.sys)
  const idle = Math.max(0, after.idle - before.idle)
  const wait = Math.max(0, after.wait - before.wait)
  const irq = Math.max(0, after.irq - before.irq)
  const total = user + nice + sys + idle + wait + irq
  const percent = (value: number) => (total > 0 ? round((value / total) * 100, 2) : 0)

  const used = percent(user + nice)
  const sysPercent = percent(sys + irq)
  const waitPercent = percent(wait)
  const free = percent(idle)
  const totalUsage = Math.min(100, round(used + sysPercent, 2))
  const firstCpu = cpus[0]

  return {
    cpuNum: cpus.length,
    model: String(firstCpu?.model || '').trim(),
    speedMHz: Number(firstCpu?.speed || 0),
    total: 100,
    used,
    sys: sysPercent,
    wait: waitPercent,
    free,
    totalUsage,
    loadAvg: buildLoadAvg(loadavg, cpus.length, platform),
  }
}

async function sampleCpu(deps: {
  now: () => number
  sleep: (ms: number) => Promise<void>
  cpus: () => os.CpuInfo[]
  loadavg: () => number[]
  platform: () => NodeJS.Platform
}): Promise<MonitorCpuInfo> {
  const currentTime = deps.now()
  const currentCpus = deps.cpus()
  const currentSnap = cpuSnapshot(currentCpus)

  if (cachedCpuSample) {
    const elapsed = currentTime - cachedCpuSample.timestamp
    if (elapsed >= CPU_CACHE_MIN_INTERVAL_MS && elapsed <= CPU_CACHE_MAX_INTERVAL_MS) {
      const prevSnap = cachedCpuSample.snapshot
      cachedCpuSample = { snapshot: currentSnap, timestamp: currentTime }
      return cpuMetricsFromSnapshots(prevSnap, currentSnap, currentCpus, deps.loadavg(), deps.platform())
    }
  }

  await deps.sleep(CPU_SAMPLE_DELAY_MS)
  const afterCpus = deps.cpus()
  const afterSnap = cpuSnapshot(afterCpus)
  cachedCpuSample = { snapshot: afterSnap, timestamp: deps.now() }
  return cpuMetricsFromSnapshots(currentSnap, afterSnap, afterCpus, deps.loadavg(), deps.platform())
}

function localIp(networkInterfaces: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>): string {
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address
    }
  }
  return '127.0.0.1'
}

function diskInfo(
  cwd: string,
  statfs: (path: string) => { blocks: number | bigint; bsize: number | bigint; bavail: number | bigint },
): MonitorSysFileInfo[] {
  try {
    const stats = statfs(cwd)
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    const used = Math.max(0, total - free)
    return [{
      dirName: cwd,
      sysTypeName: 'filesystem',
      typeName: '应用工作目录',
      total: formatBytes(total),
      free: formatBytes(free),
      used: formatBytes(used),
      usage: total > 0 ? round((used / total) * 100, 2) : 0,
    }]
  } catch {
    return []
  }
}

function resolveRuntimeIdentity(
  versions: Record<string, string | undefined>,
  processVersion: string,
  allowGlobalBunFallback: boolean,
): Pick<MonitorRuntimeInfo, 'name' | 'version' | 'engine' | 'nodeCompatVersion'> {
  const globalBunVersion = allowGlobalBunFallback
    ? (globalThis as { Bun?: { version?: string } }).Bun?.version
    : undefined
  const bunVersion = stripLeadingV(versions.bun || globalBunVersion)
  const nodeVersion = stripLeadingV(versions.node || processVersion)

  if (bunVersion) {
    return {
      name: 'Bun',
      version: bunVersion,
      engine: 'JavaScriptCore',
      nodeCompatVersion: nodeVersion,
    }
  }

  return {
    name: 'Node.js',
    version: nodeVersion,
    engine: 'V8',
    nodeCompatVersion: nodeVersion,
  }
}

export async function collectMonitorServerInfo(
  overrides: MonitorServerCollectorDeps = {},
): Promise<MonitorServerResponse> {
  const now = overrides.now ?? (() => Date.now())
  const sleep = overrides.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const cpus = overrides.cpus ?? (() => os.cpus())
  const loadavg = overrides.loadavg ?? (() => os.loadavg())
  const totalmem = overrides.totalmem ?? (() => os.totalmem())
  const freemem = overrides.freemem ?? (() => os.freemem())
  const hostname = overrides.hostname ?? (() => os.hostname())
  const networkInterfaces = overrides.networkInterfaces ?? (() => os.networkInterfaces())
  const osType = overrides.osType ?? (() => os.type())
  const osRelease = overrides.osRelease ?? (() => os.release())
  const platform = overrides.platform ?? (() => os.platform())
  const osArch = overrides.osArch ?? (() => os.arch())
  const osUptime = overrides.osUptime ?? (() => os.uptime())
  const cwd = overrides.cwd ?? (() => process.cwd())
  const pid = overrides.pid ?? process.pid
  const execPath = overrides.execPath ?? process.execPath
  const execArgv = overrides.execArgv ?? process.execArgv
  const processUptime = overrides.processUptime ?? (() => process.uptime())
  const memoryUsage = overrides.memoryUsage ?? (() => process.memoryUsage())
  const versions = overrides.versions ?? (process.versions as Record<string, string | undefined>)
  const processVersion = overrides.processVersion ?? process.version
  const statfs = overrides.statfs ?? ((path: string) => statfsSync(path))

  const cpu = await sampleCpu({ now, sleep, cpus, loadavg, platform })

  const collectedAtMs = now()
  const totalBytes = Math.max(0, Number(totalmem()))
  const freeBytes = Math.max(0, Number(freemem()))
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const systemTotalMB = round(totalBytes / 1024 ** 2, 2)

  const mem: MonitorMemInfo = {
    total: round(totalBytes / 1024 ** 3, 2),
    used: round(usedBytes / 1024 ** 3, 2),
    free: round(freeBytes / 1024 ** 3, 2),
    usage: totalBytes > 0 ? round((usedBytes / totalBytes) * 100, 2) : 0,
    totalBytes,
    usedBytes,
    freeBytes,
  }

  const procMem = memoryUsage()
  const rssBytes = Math.max(0, Number(procMem.rss || 0))
  const rssMB = round(rssBytes / 1024 ** 2, 2)
  const heapUsedMB = round(Math.max(0, Number(procMem.heapUsed || 0)) / 1024 ** 2, 2)
  const heapTotalMB = round(Math.max(0, Number(procMem.heapTotal || 0)) / 1024 ** 2, 2)
  const externalMB = round(Math.max(0, Number(procMem.external || 0)) / 1024 ** 2, 2)
  const arrayBuffersMB = round(Math.max(0, Number(procMem.arrayBuffers || 0)) / 1024 ** 2, 2)
  const systemUsage = totalBytes > 0 ? round((rssBytes / totalBytes) * 100, 2) : 0

  const procUptimeSeconds = Math.max(0, Math.floor(Number(processUptime() || 0)))
  const procStartTime = new Date(collectedAtMs - procUptimeSeconds * 1000).toISOString()
  const procRunTime = formatDuration(procUptimeSeconds)
  const inputArgs = sanitizeExecArgv(execArgv)
  const runtimeIdentity = resolveRuntimeIdentity(versions, processVersion, overrides.versions === undefined)

  const runtime: MonitorRuntimeInfo = {
    ...runtimeIdentity,
    execPath,
    pid,
    startTime: procStartTime,
    uptimeSeconds: procUptimeSeconds,
    runTime: procRunTime,
    inputArgs,
    memory: {
      rssMB,
      heapUsedMB,
      heapTotalMB,
      externalMB,
      arrayBuffersMB,
      rssBytes,
      systemUsage,
    },
  }

  const hostUptimeSeconds = Math.max(0, Math.floor(Number(osUptime() || 0)))
  const workDir = cwd()

  const sys: MonitorSysInfo = {
    computerName: hostname(),
    computerIp: localIp(networkInterfaces),
    osName: osType(),
    osRelease: osRelease(),
    platform: platform(),
    osArch: osArch(),
    userDir: workDir,
    uptimeSeconds: hostUptimeSeconds,
    runTime: formatDuration(hostUptimeSeconds),
  }

  const jvm: MonitorJvmCompatInfo = {
    name: runtime.name,
    version: runtime.version,
    home: runtime.execPath,
    startTime: runtime.startTime,
    runTime: runtime.runTime,
    inputArgs: runtime.inputArgs,
    total: systemTotalMB,
    max: systemTotalMB,
    used: rssMB,
    free: round(Math.max(0, systemTotalMB - rssMB), 2),
    usage: systemUsage,
  }

  return {
    collectedAt: new Date(collectedAtMs).toISOString(),
    cpu,
    mem,
    runtime,
    sys,
    sysFiles: diskInfo(workDir, statfs),
    jvm,
  }
}
