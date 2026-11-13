import type { H3Event } from 'h3'
import { getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import {
  affectedRows,
  assertExists,
  bodyOf,
  decimal,
  idList,
  insertOperationLog,
  javaAjax,
  queryOne,
  requiredText,
  sqlPlaceholders,
  text,
  withWriteSession,
  writeFail,
} from './write'

type Kind =
  | 'dummy-monthly-add' | 'dummy-monthly-batch' | 'dummy-monthly-edit' | 'dummy-monthly-delete' | 'dummy-weight-edit'
  | 'process-target-add' | 'process-target-edit' | 'process-target-delete'
  | 'process-staff-save'
  | 'lucky-activity-add' | 'lucky-activity-edit' | 'lucky-activity-delete'
  | 'lucky-prize-add' | 'lucky-prize-edit' | 'lucky-prize-delete' | 'lucky-prize-reset'

function pathText(event: H3Event, name: string) {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return text(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return text(named)
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return text(segments.at(-1))
}

function uuid() {
  return crypto.randomUUID().replace(/-/g, '')
}

function validMonth(value: unknown): string {
  const month = requiredText(value, '月份')
  if (!/^\d{4}-\d{2}$/.test(month)) writeFail('月份格式必须为yyyy-MM')
  return month
}

async function enabledWeight(connection: PoolConnection, packageName: string, pieceType: string, material: string) {
  const row = await queryOne(connection, `
    SELECT id, unit_weight FROM tk_dummy_piece_weight
    WHERE package_name = ? AND piece_type = ? AND material = ? AND status = '0' LIMIT 1
  `, [packageName, pieceType, material])
  if (!row) writeFail('该封装组合没有启用的重量资料，不能录入')
  if (Number(row.unit_weight) <= 0) writeFail('单重必须大于0')
  return row
}

async function saveMonthly(event: H3Event, session: AuthSession, connection: PoolConnection, body: Record<string, any>) {
  const recordMonth = validMonth(body.recordMonth)
  const packageName = requiredText(body.packageName, '封装')
  const pieceType = requiredText(body.pieceType, '胶体类型')
  const material = requiredText(body.material, '材质')
  const weightValue = decimal(body.weightValue, '重量', { required: true })
  const pieceCount = decimal(body.pieceCount, '条数')
  const existing = await queryOne(connection, `
    SELECT id, package_name, piece_type, material FROM tk_dummy_piece_monthly
    WHERE record_month = ? AND package_name = ? AND piece_type = ? AND material = ? LIMIT 1
  `, [recordMonth, packageName, pieceType, material])
  if (existing) {
    const result: any = await connection.query(mysqlQueryOptions(`
      UPDATE tk_dummy_piece_monthly
      SET weight_value = ?, piece_count = ?, update_user_id = ?, update_user_name = ?, update_time = NOW(), remark = ?
      WHERE id = ?
    `), [weightValue, pieceCount, session.userId, session.user.nickName || session.userName, body.remark ?? null, existing.id])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, '假片重量月度录入', 2, body)
    return javaAjax(count)
  }
  await enabledWeight(connection, packageName, pieceType, material)
  const result: any = await connection.query(mysqlQueryOptions(`
    INSERT INTO tk_dummy_piece_monthly
      (record_month, package_name, piece_type, material, weight_value, piece_count,
       create_user_id, create_user_name, create_time, update_user_id, update_user_name, update_time, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), ?)
  `), [recordMonth, packageName, pieceType, material, weightValue, pieceCount, session.userId, session.user.nickName || session.userName, session.userId, session.user.nickName || session.userName, body.remark ?? null])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '假片重量月度录入', 1, body)
  return javaAjax(count)
}

async function dummyMonthly(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  if (editing) {
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id <= 0) writeFail('月度记录ID不能为空')
    const old = await queryOne(connection, 'SELECT id, package_name, piece_type, material FROM tk_dummy_piece_monthly WHERE id = ?', [id])
    if (!old) writeFail('月度记录不存在')
    const recordMonth = validMonth(body.recordMonth)
    const packageName = requiredText(body.packageName, '封装')
    const pieceType = requiredText(body.pieceType, '胶体类型')
    const material = requiredText(body.material, '材质')
    const weightValue = decimal(body.weightValue, '重量', { required: true })
    const pieceCount = decimal(body.pieceCount, '条数')
    const duplicate = await queryOne(connection, `SELECT id FROM tk_dummy_piece_monthly WHERE record_month = ? AND package_name = ? AND piece_type = ? AND material = ? AND id <> ? LIMIT 1`, [recordMonth, packageName, pieceType, material, id])
    if (duplicate) writeFail('同月份、封装、胶体类型、材质的记录已存在')
    if (packageName !== String(old.package_name) || pieceType !== String(old.piece_type) || material !== String(old.material)) await enabledWeight(connection, packageName, pieceType, material)
    const result: any = await connection.query(mysqlQueryOptions(`
      UPDATE tk_dummy_piece_monthly SET record_month = ?, package_name = ?, piece_type = ?, material = ?, weight_value = ?, piece_count = ?,
        update_user_id = ?, update_user_name = ?, update_time = NOW(), remark = ? WHERE id = ?
    `), [recordMonth, packageName, pieceType, material, weightValue, pieceCount, session.userId, session.user.nickName || session.userName, body.remark ?? null, id])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, '假片重量月度录入', 2, body)
    return javaAjax(count)
  }
  return saveMonthly(event, session, connection, body)
}

async function dummyBatch(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await readBody(event)
  if (!Array.isArray(body) || !body.length) return javaAjax(0)
  let rows = 0
  for (const item of body) {
    if (!item || (item.weightValue == null && item.pieceCount == null)) continue
    const result = await saveMonthly(event, session, connection, item)
    if (result.code !== 200) return result
    rows += 1
  }
  return javaAjax(rows)
}

async function dummyMonthlyDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(pathText(event, 'ids'), '月度记录ID')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_dummy_piece_monthly WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '假片重量月度录入', 3, { ids })
  return javaAjax(count)
}

async function dummyWeightEdit(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) writeFail('单重资料ID不能为空')
  const unitWeight = decimal(body.unitWeight, '单重', { required: true, positive: true })
  await queryOne(connection, 'SELECT id FROM tk_dummy_piece_weight WHERE id = ?', [id]) || writeFail('单重资料不存在')
  const result: any = await connection.query(mysqlQueryOptions('UPDATE tk_dummy_piece_weight SET unit_weight = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE id = ?'), [unitWeight, text(body.status) || '0', body.remark ?? null, session.userName, id])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '假片单重资料', 2, body)
  return javaAjax(count)
}

async function processTarget(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const packageName = requiredText(body.packageName, '封装')
  const processName = requiredText(body.processName, '工序')
  const targetCapacity = decimal(body.targetCapacity, '目标产能', { required: true })
  const sortNo = Number(body.sortNo ?? 0)
  if (!Number.isSafeInteger(sortNo) || sortNo < 0) writeFail('排序号不符合规范')
  const id = editing ? requiredText(body.id, '目标ID') : uuid()
  if (editing) await queryOne(connection, 'SELECT id FROM tk_process_output_target WHERE id = ?', [id]) || writeFail('目标记录不存在')
  const duplicate = await queryOne(connection, 'SELECT id FROM tk_process_output_target WHERE package_name = ? AND process_name = ? AND id <> ? LIMIT 1', [packageName, processName, id])
  if (duplicate) writeFail('同一封装、工序的目标已存在')
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions(`UPDATE tk_process_output_target SET package_name = ?, process_name = ?, target_capacity = ?, sort_no = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE id = ?`), [packageName, processName, targetCapacity, sortNo, text(body.status) || '0', body.remark ?? null, session.userName, id])
  else result = await connection.query(mysqlQueryOptions(`INSERT INTO tk_process_output_target (id, package_name, process_name, target_capacity, sort_no, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`), [id, packageName, processName, targetCapacity, sortNo, text(body.status) || '0', body.remark ?? null, session.userName])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '工序产量目标产能', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function processTargetDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const id = requiredText(pathText(event, 'id'), '目标ID')
  const result: any = await connection.query(mysqlQueryOptions('DELETE FROM tk_process_output_target WHERE id = ?'), [id])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '工序产量目标产能', 3, { id })
  return javaAjax(count)
}

async function processStaff(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const reportDate = requiredText(body.reportDate, '统计日期')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) writeFail('统计日期格式不正确')
  const processName = requiredText(body.processName, '工序')
  const staffCount = decimal(body.staffCount, '人员数量', { required: true })
  const id = text(body.id) || uuid()
  const duplicate = await queryOne(connection, 'SELECT id FROM tk_process_output_staff WHERE report_date = ? AND process_name = ? AND id <> ? LIMIT 1', [reportDate, processName, id])
  if (duplicate) writeFail('同一天同一工序的人员数量已维护')
  const exists = await queryOne(connection, 'SELECT id FROM tk_process_output_staff WHERE id = ?', [id])
  let result: any
  if (exists) result = await connection.query(mysqlQueryOptions('UPDATE tk_process_output_staff SET report_date = ?, process_name = ?, staff_count = ?, remark = ?, update_by = ?, update_time = NOW() WHERE id = ?'), [reportDate, processName, staffCount, body.remark ?? null, session.userName, id])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO tk_process_output_staff (id, report_date, process_name, staff_count, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, NOW())'), [id, reportDate, processName, staffCount, body.remark ?? null, session.userName])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '工序产量人员数量', exists ? 2 : 1, body)
  return javaAjax(count)
}

async function luckyActivity(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const id = editing ? positiveId(body.id, '活动ID') : null
  if (editing) await assertExists(connection, 'SELECT id FROM tk_lucky_activity WHERE id = ?', [id], '活动不存在')
  const values = [requiredText(body.title, '活动标题'), body.description ?? null, body.startTime ?? null, body.endTime ?? null, body.drawLimit == null ? null : Number(body.drawLimit), text(body.status) || '0', body.remark ?? null]
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions('UPDATE tk_lucky_activity SET title = ?, description = ?, start_time = ?, end_time = ?, draw_limit = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE id = ?'), [...values, session.userName, id])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO tk_lucky_activity (title, description, start_time, end_time, draw_limit, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'), [...values, session.userName])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '抽奖活动', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function luckyActivityDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(pathText(event, 'ids'), '活动ID')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_lucky_activity WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '抽奖活动', 3, { ids })
  return javaAjax(count)
}

function prizeNameFor(body: Record<string, any>): { name: string; level: string; fallback: string } {
  const prizeType = text(body.prizeType)
  let name = text(body.prizeName)
  let level = text(body.prizeLevel)
  let fallback = text(body.isFallback) || '0'
  if (prizeType === '2') {
    fallback = '1'
    level ||= '参与奖'
    name ||= '谢谢参与'
  }
  if (prizeType === '1' && body.cashAmount != null && Number(body.cashAmount) > 0) name = `现金红包 ${Number(body.cashAmount).toString()}元`
  return { name: requiredText(name, '奖品名称'), level, fallback }
}

async function luckyPrize(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const id = editing ? positiveId(body.id, '奖品ID') : null
  const activityId = positiveId(body.activityId, '活动ID')
  await assertExists(connection, 'SELECT id FROM tk_lucky_activity WHERE id = ?', [activityId], '活动不存在')
  if (editing) await assertExists(connection, 'SELECT id FROM tk_lucky_prize WHERE id = ?', [id], '奖品不存在')
  const prize = prizeNameFor(body)
  const totalQty = decimal(body.totalQty, '奖品总数', { required: true })
  const remainQty = body.remainQty == null ? totalQty : decimal(body.remainQty, '奖品剩余数量', { required: true })
  const values = [activityId, prize.name, prize.level || null, totalQty, remainQty, decimal(body.probability, '中奖概率'), body.prizeIcon ?? null, text(body.status) || '0', text(body.prizeType) || '0', prize.fallback, decimal(body.cashAmount, '现金金额'), session.userName]
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions('UPDATE tk_lucky_prize SET activity_id = ?, prize_name = ?, prize_level = ?, total_qty = ?, remain_qty = ?, probability = ?, prize_icon = ?, status = ?, prize_type = ?, is_fallback = ?, cash_amount = ?, update_by = ?, update_time = NOW() WHERE id = ?'), [...values, id])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO tk_lucky_prize (activity_id, prize_name, prize_level, total_qty, remain_qty, probability, prize_icon, status, prize_type, is_fallback, cash_amount, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'), values)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '奖品配置', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function luckyPrizeDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(pathText(event, 'ids'), '奖品ID')
  const [rows] = await connection.query<any[]>(mysqlQueryOptions(`SELECT id, activity_id FROM tk_lucky_prize WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  for (const activityId of [...new Set(rows.map((row) => Number(row.activity_id)).filter(Boolean))]) {
    const fallback = await queryOne(connection, `SELECT id FROM tk_lucky_prize WHERE activity_id = ? AND is_fallback = '1' AND status = '0' AND id NOT IN (${sqlPlaceholders(ids)}) LIMIT 1`, [activityId, ...ids])
    if (!fallback) writeFail('无法删除：该活动至少需要保留一个启用的兜底参与奖。')
  }
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_lucky_prize WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '奖品配置', 3, { ids })
  return javaAjax(count)
}

async function luckyPrizeReset(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const activityId = positiveId(pathText(event, 'activityId'), '活动ID')
  const result: any = await connection.query(mysqlQueryOptions('UPDATE tk_lucky_prize SET remain_qty = total_qty, update_by = ?, update_time = NOW() WHERE activity_id = ?'), [session.userName, activityId])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '重置奖品池数量', 2, { activityId })
  return apiSuccess(undefined, `成功重置 ${count} 个奖品的剩余库存数量`)
}

const CUSTOM_WRITE_PERMISSIONS: Record<string, string> = {
  'dummy-monthly-add': 'tk_custom:dummyPiece:add',
  'dummy-monthly-batch': 'tk_custom:dummyPiece:add',
  'dummy-monthly-edit': 'tk_custom:dummyPiece:edit',
  'dummy-monthly-delete': 'tk_custom:dummyPiece:remove',
  'dummy-weight-edit': 'tk_custom:dummyPiece:weight',
}

export function createCustomWriteHandler(kind: Kind) {
  return (event: H3Event) => withWriteSession(event, `Custom:${kind}`, CUSTOM_WRITE_PERMISSIONS[kind] ?? null, async (session, connection) => {
    switch (kind) {
      case 'dummy-monthly-add': return dummyMonthly(event, session, connection, false)
      case 'dummy-monthly-batch': return dummyBatch(event, session, connection)
      case 'dummy-monthly-edit': return dummyMonthly(event, session, connection, true)
      case 'dummy-monthly-delete': return dummyMonthlyDelete(event, session, connection)
      case 'dummy-weight-edit': return dummyWeightEdit(event, session, connection)
      case 'process-target-add': return processTarget(event, session, connection, false)
      case 'process-target-edit': return processTarget(event, session, connection, true)
      case 'process-target-delete': return processTargetDelete(event, session, connection)
      case 'process-staff-save': return processStaff(event, session, connection)
      case 'lucky-activity-add': return luckyActivity(event, session, connection, false)
      case 'lucky-activity-edit': return luckyActivity(event, session, connection, true)
      case 'lucky-activity-delete': return luckyActivityDelete(event, session, connection)
      case 'lucky-prize-add': return luckyPrize(event, session, connection, false)
      case 'lucky-prize-edit': return luckyPrize(event, session, connection, true)
      case 'lucky-prize-delete': return luckyPrizeDelete(event, session, connection)
      case 'lucky-prize-reset': return luckyPrizeReset(event, session, connection)
      default: return apiSuccess(undefined, '操作成功')
    }
  })
}
