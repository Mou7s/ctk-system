import { runMoCloseOnce } from '../utils/production-order-close'
import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'

type State = { running: boolean, timer?: ReturnType<typeof setTimeout>, interval?: ReturnType<typeof setInterval> }
const g = globalThis as typeof globalThis & { __ctkMoClose102?: State }

export default defineNitroPlugin((nitro) => {
  if (skipHeavySchedulerInDev('MoClose102')) return
  // 默认关闭：env NUXT_MO_CLOSE_ENABLED=1 或 sys_config kingdee.moAutoClose=1 才跑，且只dry-run
  const envOn = ['1', 'true', 'yes', 'on'].includes(String(process.env.NUXT_MO_CLOSE_ENABLED || '').toLowerCase())
  const intervalMs = Number(process.env.NUXT_MO_CLOSE_INTERVAL_MS || 24 * 60 * 60 * 1000)
  const initialDelayMs = Number(process.env.NUXT_MO_CLOSE_INITIAL_DELAY_MS || 60_000)

  if (g.__ctkMoClose102) return
  const state: State = { running: false }
  g.__ctkMoClose102 = state

  const shouldRun = async () => {
    if (envOn) return true
    try {
      const { getMysqlPool, mysqlQueryOptions } = await import('../utils/mysql')
      const [rows] = await getMysqlPool().query<any[]>(mysqlQueryOptions(
        `SELECT config_value FROM sys_config WHERE config_key='kingdee.moAutoClose' LIMIT 1`
      ))
      return String(rows[0]?.config_value || '').trim() === '1'
    } catch { return false }
  }

  const run = async () => {
    if (state.running) return
    if (!(await shouldRun())) return
    state.running = true
    try {
      const r = await runMoCloseOnce({ dryRun: true })
      console.info(`[MoClose102] checked=${r.checked}`)
    } catch (e) {
      console.error('[MoClose102] failed:', e)
    } finally { state.running = false }
  }

  state.timer = setTimeout(() => {
    void run()
    state.interval = setInterval(() => { void run() }, Math.max(60_000, intervalMs))
  }, Math.max(1000, initialDelayMs))

  nitro.hooks.hook('close', () => {
    if (state.timer) clearTimeout(state.timer)
    if (state.interval) clearInterval(state.interval)
    if (g.__ctkMoClose102 === state) delete g.__ctkMoClose102
  })

  console.info(`[MoClose102] plugin loaded (default OFF) interval=${intervalMs}ms`)
})
