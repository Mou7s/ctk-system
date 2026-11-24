import { skipHeavySchedulerInDev } from '../utils/nitro-jobs/dev-guard'
import { runMonthlyQuotationReport } from '../utils/domestic-quotation-monthly'

export default defineNitroPlugin(nitroApp => {
  if (skipHeavySchedulerInDev('DomesticQuotationMonthly')) return
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await runMonthlyQuotationReport()
      if (!result.skipped && !result.sent) console.error('[DomesticQuotationMonthly]', result.message)
    } catch { console.error('[DomesticQuotationMonthly] 月结报价调度失败，请核查数据库迁移与发送记录') }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 60000)
  void tick()
  nitroApp.hooks.hook('close', () => clearInterval(timer))
})
