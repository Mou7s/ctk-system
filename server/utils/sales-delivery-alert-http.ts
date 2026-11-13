import { getQuery, setResponseHeader, type H3Event } from 'h3'
import { withReadPermissionSession } from './read'
import { bodyOf, withWriteSession, writeFail } from './write'
import { mysqlQueryOptions } from './mysql'
import { hasPermission } from './auth'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { filterDeliveryRows } from './sales-delivery-alert-model'
import { loadDeliveryAlerts, scopeDeliveryRows, readAlertMembers, readDeliveryAlertSettings } from './sales-delivery-alert-read'
import { renderDeliveryAlertExcel } from './sales-delivery-alert-export'

const PREFIX = 'tk_custom:deliveryAlert:'

export function deliveryAlertRead(event: H3Event, action: 'list' | 'preview' | 'export' | 'settings' | 'logs') {
  const permission = PREFIX + (action === 'settings' ? 'configure' : action === 'logs' || action === 'preview' ? 'all' : 'list')
  return withReadPermissionSession(event, `deliveryAlert/${action}`, permission, async (session, pool) => {
    if (session.userId !== 1 && (action === 'settings' || !session.roles?.includes('sales_manager'))) {
      return apiError('销售交期预警暂时仅对当前管理员和销售经理开放；设置仅管理员可用', 403)
    }
    if (action === 'settings') {
      const [settings, members] = await Promise.all([readDeliveryAlertSettings(), readAlertMembers()])
      return apiSuccess({ ...settings, members })
    }
    if (action === 'logs') {
      const [runs] = await pool.query<any[]>(mysqlQueryOptions("SELECT DATE_FORMAT(run_date,'%Y-%m-%d') run_date,status,summary,started_at,finished_at FROM tk_delivery_alert_run ORDER BY run_date DESC LIMIT 30"))
      const [deliveries] = await pool.query<any[]>(mysqlQueryOptions("SELECT DATE_FORMAT(run_date,'%Y-%m-%d') run_date,recipient_name,is_total,row_count,status,error_message,finished_at FROM tk_delivery_alert_delivery WHERE run_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ORDER BY run_date DESC,recipient_name"))
      return apiSuccess({ runs, deliveries })
    }
    const snapshot = await loadDeliveryAlerts()
    if (action === 'preview') return apiSuccess({ fetchedAt: snapshot.fetchedAt, invalidTotal: snapshot.invalidTotal,
      recipients: snapshot.plans.map(p => ({ userid: p.userid, name: p.name, total: p.total, count: p.rows.length,
        overdue: p.rows.filter(r => r.urgency === '逾期').length, issues: p.rows.filter(r => r.issues.length).length })) })
    const query = getQuery(event)
    let rows = scopeDeliveryRows(snapshot.rows, snapshot.members, session)
    let title = hasPermission(session, PREFIX + 'all') ? '销售交期预警总表' : '我的销售交期预警'
    if (query.recipient) {
      if (!hasPermission(session, PREFIX + 'all')) return apiError('没有权限查看其他接收人的报表', 403)
      const plan = snapshot.plans.find(p => p.userid === String(query.recipient))
      if (!plan) return apiError('接收人不存在', 400)
      rows = plan.rows
      title = plan.total ? '销售交期预警总表' : `${plan.name}的销售交期预警`
    }
    rows = filterDeliveryRows(rows, query)
    if (action === 'export') {
      setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title + '.xlsx')}`)
      return renderDeliveryAlertExcel(rows, title, snapshot.fetchedAt)
    }
    const page = Math.max(1, Number(query.pageNum) || 1)
    const size = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    return apiSuccessFields({ rows: rows.slice((page - 1) * size, page * size), total: rows.length, fetchedAt: snapshot.fetchedAt,
      summary: { overdue: rows.filter(r => r.urgency === '逾期').length, dueToday: rows.filter(r => r.urgency === '今天到期').length,
        overdueReady: rows.filter(r => r.urgency === '逾期' && r.productionGroup === '已入库待发货').length,
        overdueUnfinished: rows.filter(r => r.urgency === '逾期' && r.productionGroup === '生产未完成').length,
        overdueUnknown: rows.filter(r => r.urgency === '逾期' && r.productionGroup === '待核实').length,
        noDate: rows.filter(r => !r.dueDate).length, partial: rows.filter(r => r.shippedQty > 0).length },
      canViewAll: hasPermission(session, PREFIX + 'all'), canConfigure: session.userId === 1 && hasPermission(session, PREFIX + 'configure') })
  }, '销售交期预警查询失败，请检查金蝶和通讯录连接')
}

export function saveDeliveryAlertSettings(event: H3Event) {
  return withWriteSession(event, 'deliveryAlert/settings', PREFIX + 'configure', async (session, connection) => {
    if (session.userId !== 1) writeFail('销售交期预警暂时仅对当前管理员账号开放', 403)
    const body = await bodyOf(event)
    if (typeof body.enabled !== 'boolean' || !Array.isArray(body.totalReceivers)) writeFail('设置格式不正确', 400)
    const members = await readAlertMembers()
    const ids = [...new Set(body.totalReceivers.map((id: unknown) => String(id).trim()))] as string[]
    if (ids.some(id => !members.some(m => m.userid === id))) writeFail('总表接收人必须是有效企微成员', 400)
    if (body.enabled && !ids.length) writeFail('开启前必须选择总表接收人', 400)
    for (const [key, value, name] of [
      ['tk.deliveryAlert.enabled', body.enabled ? '1' : '0', '销售交期每日提醒开关'],
      ['tk.deliveryAlert.totalReceivers', ids.join(','), '销售交期总表接收人'],
    ]) {
      await connection.query(mysqlQueryOptions('UPDATE sys_config SET config_value=?,update_by=?,update_time=NOW() WHERE config_key=?'), [value, session.userName, key])
      await connection.query(mysqlQueryOptions('INSERT INTO sys_config (config_name,config_key,config_value,config_type,create_by,create_time) SELECT ?,?,?,\'Y\',?,NOW() WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key=?)'), [name, key, value, session.userName, key])
    }
    return apiSuccess({ enabled: body.enabled, totalReceivers: ids, time: '08:00' })
  }, '保存销售交期提醒设置失败')
}
