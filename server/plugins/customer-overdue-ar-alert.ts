import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { runWeeklyOverdueAlert } from '../utils/customer-overdue-ar-alert'
import { errorMessage } from '../utils/response'

export default defineNitroPlugin(nitroApp => {
  if (skipHeavySchedulerInDev('CustomerOverdueArAlert')) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await runWeeklyOverdueAlert() }
    catch (error) { console.error('[CustomerOverdueArAlert]', errorMessage(error, '调度失败')) }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 60_000)
  void tick()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
