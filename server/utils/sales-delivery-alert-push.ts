import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { errorMessage } from './response'
import { loadDeliveryAlerts, readDeliveryAlertSettings } from './sales-delivery-alert-read'
import { shanghaiClock } from './sales-delivery-alert-model'
import { renderDeliveryAlertExcel } from './sales-delivery-alert-export'
import { readWecomConfig, uploadWarningExcelMedia, sendFileToUser } from './nitro-jobs/kucun-warning-send'

/** 持久化日期唯一锁；已发送、失败或状态不明均不自动重发，防止跨进程/重启重复通知。 */
export async function runDailyDeliveryAlert(now = new Date()) {
  const clock = shanghaiClock(now)
  if (clock.hour < 8) return { skipped: true }
  const settings = await readDeliveryAlertSettings()
  if (!settings.enabled) return { skipped: true }
  const pool = getMysqlPool()
  const [claim] = await pool.query<any>(mysqlQueryOptions(
    "INSERT IGNORE INTO tk_delivery_alert_run (run_date,status,started_at) VALUES (?, 'running', NOW())",
  ), [clock.day])
  if (!claim.affectedRows) return { skipped: true }
  let sent = 0
  let failed = 0
  try {
    const snapshot = await loadDeliveryAlerts(now)
    if (!snapshot.settings.enabled) throw new Error('提醒开关已关闭，本次停止发送')
    if (!snapshot.settings.totalReceivers.length || snapshot.invalidTotal.length) {
      throw new Error('总表接收人未设置或已不在有效通讯录，请在预警页面核对')
    }
    const config = await readWecomConfig()
    for (const plan of snapshot.plans) {
      await pool.query(mysqlQueryOptions(
        "INSERT INTO tk_delivery_alert_delivery (run_date,userid,recipient_name,is_total,row_count,status) VALUES (?,?,?,?,?,'preparing')",
      ), [clock.day, plan.userid, plan.name, plan.total ? 1 : 0, plan.rows.length])
      try {
        const title = plan.total ? '销售交期预警总表' : `${plan.name}的销售交期预警`
        const buffer = renderDeliveryAlertExcel(plan.rows, title, snapshot.fetchedAt)
        const mediaId = await uploadWarningExcelMedia(config, buffer, `${title}_${clock.day}.xlsx`)
        // 先记录再发，进程中断后保留不明状态，不自动重复发送。
        await pool.query(mysqlQueryOptions("UPDATE tk_delivery_alert_delivery SET status='sending' WHERE run_date=? AND userid=?"), [clock.day, plan.userid])
        await sendFileToUser(config, plan.userid, mediaId)
        await pool.query(mysqlQueryOptions("UPDATE tk_delivery_alert_delivery SET status='sent',finished_at=NOW() WHERE run_date=? AND userid=?"), [clock.day, plan.userid])
        sent++
      } catch (error) {
        failed++
        await pool.query(mysqlQueryOptions(
          "UPDATE tk_delivery_alert_delivery SET status=IF(status='sending','uncertain','failed'),error_message=?,finished_at=NOW() WHERE run_date=? AND userid=?",
        ), [errorMessage(error, '发送失败').slice(0, 500), clock.day, plan.userid])
      }
    }
    const summary = `未交明细 ${snapshot.rows.length} 条；成功 ${sent} 人，失败或待核对 ${failed} 人`
    await pool.query(mysqlQueryOptions('UPDATE tk_delivery_alert_run SET status=?,summary=?,finished_at=NOW() WHERE run_date=?'),
      [failed ? 'partial' : 'sent', summary, clock.day])
    return { skipped: false, sent, failed, summary }
  } catch (error) {
    const summary = errorMessage(error, '销售交期提醒失败').slice(0, 500)
    await pool.query(mysqlQueryOptions("UPDATE tk_delivery_alert_run SET status='failed',summary=?,finished_at=NOW() WHERE run_date=?"), [summary, clock.day])
    return { skipped: false, sent, failed, summary }
  }
}
