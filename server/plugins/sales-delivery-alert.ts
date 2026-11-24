import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { runDailyDeliveryAlert } from '../utils/sales-delivery-alert-push'
import { errorMessage } from '../utils/response'

export default defineNitroPlugin((nitroApp) => {
  if (skipHeavySchedulerInDev('SalesDeliveryAlert')) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await runDailyDeliveryAlert() }
    catch (error) { console.error('[SalesDeliveryAlert]', errorMessage(error, '调度失败')) }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 60_000)
  void tick()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
