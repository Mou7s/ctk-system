import { getQuery, setHeader, type H3Event } from 'h3'
import { hasPermission } from './auth'
import { apiError, apiSuccess } from './response'
import { withReadSession } from './read'
import { mysqlQueryOptions } from './mysql'
import { monthlyQuotationPeriod, queryMonthlyQuotations, readMonthlyQuotationSettings, renderMonthlyQuotationExcel, resolveMonthlyQuotationReceiver } from './domestic-quotation-monthly'

export function domesticMonthlyQuotationRead(event: H3Event, action: 'export' | 'status') {
  return withReadSession(event, 'DomesticQuotationMonthly', async (session, pool) => {
    if (!hasPermission(session, 'tk_custom:domesticQuotation:analysis')) return apiError('没有内贸全量汇总权限', 403)
    const month = getQuery(event).month
    if (month !== undefined && (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/u.test(month))) return apiError('汇总月份格式应为 YYYY-MM', 400)
    const period = monthlyQuotationPeriod(new Date(), month as string | undefined)
    if (action === 'export') {
      const rows = await queryMonthlyQuotations(period, pool)
      setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`内贸月结报价汇总_${period.from}_${period.to}.xlsx`)}`)
      return renderMonthlyQuotationExcel(rows, period)
    }
    const settings = await readMonthlyQuotationSettings(pool)
    const receiver = settings.receiver ? await resolveMonthlyQuotationReceiver(settings.receiver, pool) : null
    let lastRun = null
    // Before migration, missing config means disabled; do not query the not-yet-created run table.
    if (settings.enabled) {
      const [rows] = await pool.query<any[]>(mysqlQueryOptions('SELECT report_month,period_from,period_to,status,recipient_name,row_count,quotation_count,error_message,finished_at FROM tk_quotation_monthly_run ORDER BY report_month DESC LIMIT 1'))
      lastRun = rows[0] || null
    }
    return apiSuccess({ period, enabled: settings.enabled, recipientName: receiver?.name || '', schedule: '每月20日08:00（北京时间）', lastRun })
  }, '获取内贸月结报价汇总失败')
}
