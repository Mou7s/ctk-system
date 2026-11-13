import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { runQuotationMorningReminders } from '../utils/quotation-reminder'
import { errorMessage } from '../utils/response'

export default defineNitroPlugin(nitroApp => {
  if (skipHeavySchedulerInDev('QuotationReminder')) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await runQuotationMorningReminders()
      if (!result.skipped && (result.sent || result.failed)) console.info('[QuotationReminder]', JSON.stringify(result))
    } catch (error) { console.error('[QuotationReminder]', errorMessage(error, '待审提醒调度失败')) }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 30_000)
  void tick()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
