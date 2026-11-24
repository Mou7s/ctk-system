import type { H3Event } from 'h3'
import { getQuery, setResponseHeader } from 'h3'
import { withReadPermissionSession } from './read'
import { withWriteSession, bodyOf, writeFail } from './write'
import { apiError, apiSuccess } from './response'
import { mysqlQueryOptions } from './mysql'
import { readWecomConfig } from './nitro-jobs/kucun-warning-send'
import { OVERDUE_ALERT_ENABLED_KEY, OVERDUE_ALERT_TOTAL_KEY, readOverdueAlertSettings, previewOverdueAlert, renderOverdueAlertExcel } from './customer-overdue-ar-alert'
import { readAlertMembers } from './sales-delivery-alert-read'

const PERMISSION = 'tk_custom:customerOverdueAr:list'
export function overdueAlertRead(event: H3Event, action: 'settings' | 'preview' | 'logs' | 'export') {
  return withReadPermissionSession(event, `overdueAlert/${action}`, PERMISSION, async (session, pool) => {
    if (session.userId !== 1) return apiError('提醒管理仅管理员可用', 403)
    if (action === 'settings') return apiSuccess({ ...await readOverdueAlertSettings(), members: await readAlertMembers(), schedule: '每周五08:00（北京时间）' })
    if (action === 'logs') {
      const [runs] = await pool.query(mysqlQueryOptions('SELECT run_date,status,summary,started_at,finished_at FROM tk_overdue_ar_alert_run ORDER BY run_date DESC LIMIT 12'))
      const [deliveries] = await pool.query(mysqlQueryOptions('SELECT run_date,recipient_name,is_total,row_count,status,error_message FROM tk_overdue_ar_alert_delivery ORDER BY run_date DESC,recipient_name LIMIT 500'))
      return apiSuccess({ runs, deliveries })
    }
    const snapshot = await previewOverdueAlert()
    if (action === 'export') {
      const plan = snapshot.plans.find(p => p.userid === String(getQuery(event).recipient || ''))
      if (!plan) return apiError('接收人不存在或没有逾期客户', 400)
      setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('客户逾期应收.xlsx')}`)
      return renderOverdueAlertExcel(plan.rows, plan.total ? `${plan.name}（总表）` : plan.name, snapshot.asOfDate)
    }
    return apiSuccess({ asOfDate: snapshot.asOfDate, customerCount: snapshot.customerCount,
      recipients: snapshot.plans.map(p => ({ userid: p.userid, name: p.name, total: Boolean(p.total), count: new Set(p.rows.map(r=>r.custCode)).size })), unmatched: snapshot.unmatched, skipped: snapshot.skipped, invalidTotal: snapshot.invalidTotal })
  }, '逾期应收提醒查询失败')
}

export function overdueAlertSave(event: H3Event) {
  return withWriteSession(event, 'overdueAlert/settings', PERMISSION, async (session, connection) => {
    if (session.userId !== 1) writeFail('提醒管理仅管理员可用', 403)
    const body = await bodyOf(event)
    if (typeof body.enabled !== 'boolean') writeFail('提醒开关格式不正确', 400)
    if (typeof body.totalReceiver !== 'string') writeFail('请选择总表接收人', 400)
    const members = await readAlertMembers()
    const totalIds = [...new Set(body.totalReceiver.split(',').map(id => id.trim()).filter(Boolean))]
    const totalReceiver = totalIds.join(',')
    if (totalIds.some(id => !members.some(m => m.userid === id))) writeFail('总表接收人必须是有效企微账号', 400)
    if (body.enabled) {
      if (!totalReceiver) writeFail('启用前请选择总表接收人', 400)
      const snapshot = await previewOverdueAlert()
      if (snapshot.unmatched.length) writeFail('存在未唯一匹配的负责人，请先核对收件预览', 400)
      await readWecomConfig()
      // 确认状态表已导入，避免开关显示成功但周五无法发送。
      await connection.query(mysqlQueryOptions('SELECT run_date FROM tk_overdue_ar_alert_run LIMIT 0'))
      await connection.query(mysqlQueryOptions('SELECT run_date FROM tk_overdue_ar_alert_delivery LIMIT 0'))
    }
    const value = body.enabled ? '1' : '0'
    await connection.query(mysqlQueryOptions('UPDATE sys_config SET config_value=?,update_by=?,update_time=NOW() WHERE config_key=?'), [value, session.userName, OVERDUE_ALERT_ENABLED_KEY])
    await connection.query(mysqlQueryOptions("INSERT INTO sys_config (config_name,config_key,config_value,config_type,create_by,create_time) SELECT ?,?,?,'Y',?,NOW() WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key=?)"), ['客户逾期应收每周五08:00提醒', OVERDUE_ALERT_ENABLED_KEY, value, session.userName, OVERDUE_ALERT_ENABLED_KEY])
    await connection.query(mysqlQueryOptions('UPDATE sys_config SET config_value=?,update_by=?,update_time=NOW() WHERE config_key=?'), [totalReceiver, session.userName, OVERDUE_ALERT_TOTAL_KEY])
    await connection.query(mysqlQueryOptions("INSERT INTO sys_config (config_name,config_key,config_value,config_type,create_by,create_time) SELECT ?,?,?,'Y',?,NOW() WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key=?)"), ['逾期应收总表接收人', OVERDUE_ALERT_TOTAL_KEY, totalReceiver, session.userName, OVERDUE_ALERT_TOTAL_KEY])
    return apiSuccess({ enabled: body.enabled, totalReceiver })
  }, '保存逾期应收提醒失败')
}
