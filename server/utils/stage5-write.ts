import type { H3Event } from 'h3'
import { getHeader, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { AuthSession } from './auth'
import type { PoolConnection } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import {
  affectedRows,
  insertOperationLog,
  javaAjax,
  queryOne,
  requiredText,
  sqlPlaceholders,
  stringIdList,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Kind =
  | 'suggest-add' | 'suggest-edit' | 'suggest-delete'
  | 'wxuser-add' | 'wxuser-edit' | 'wxuser-delete'
  | 'msgtowx-add' | 'msgtowx-edit' | 'msgtowx-delete'
  | 'exception-add' | 'exception-edit' | 'exception-delete' | 'exception-restore'

function pathText(event: H3Event, name: string): string {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return text(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return text(named)
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return text(segments.at(-1))
}

function requestId(event: H3Event, body: Record<string, any>): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function auditBody(body: Record<string, any>, id: string): Record<string, any> {
  return { ...body, requestId: id }
}

function displayName(session: AuthSession): string {
  return text(session.user.nickName) || session.userName
}

async function suggestWrite(
  event: H3Event,
  session: AuthSession,
  connection: PoolConnection,
  body: Record<string, any>,
  editing: boolean,
  requestKey: string,
) {
  const id = editing ? requiredText(body.id, '建议ID', 64) : text(body.id) || crypto.randomUUID()
  const suggestText = requiredText(body.suggestText, '建议内容', 5000)
  if (editing) await queryOne(connection, 'SELECT id FROM tk_suggest WHERE id = ?', [id]) || writeFail('建议记录不存在')

  let result: any
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`
      UPDATE tk_suggest
      SET suggest_text = ?, suggest_time = ?, ipAdress = ?, noSend = ?
      WHERE id = ?
    `), [suggestText, body.suggestTime ?? null, body.ipAdress ?? null, text(body.noSend) || '0', id])
  } else {
    result = await connection.query(mysqlQueryOptions(`
      INSERT INTO tk_suggest (id, suggest_text, suggest_time, ipAdress, noSend)
      VALUES (?, ?, COALESCE(?, NOW()), ?, ?)
    `), [id, suggestText, body.suggestTime ?? null, body.ipAdress ?? null, text(body.noSend) || '0'])
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '意见/建议', editing ? 2 : 1, auditBody(body, requestKey))
  return javaAjax(count)
}

async function suggestDelete(event: H3Event, session: AuthSession, connection: PoolConnection, requestKey: string) {
  const ids = stringIdList(pathText(event, 'ids'), '建议ID')
  const result: any = await connection.query(
    mysqlQueryOptions(`DELETE FROM tk_suggest WHERE id IN (${sqlPlaceholders(ids)})`),
    ids,
  )
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '意见/建议', 3, { ids, requestId: requestKey })
  return javaAjax(count)
}

async function wxuserWrite(
  event: H3Event,
  session: AuthSession,
  connection: PoolConnection,
  body: Record<string, any>,
  editing: boolean,
  requestKey: string,
) {
  const userid = requiredText(body.userid, '企业微信UserID', 128)
  const name = text(body.name)
  const dept = text(body.dept)
  const position = text(body.position)
  if (!editing) {
    if (await queryOne(connection, 'SELECT userid FROM wxuser WHERE userid = ?', [userid])) writeFail('企业微信成员已存在')
    const result: any = await connection.query(mysqlQueryOptions(`
      INSERT INTO wxuser (userid, name, dept, position, status, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
    `), [userid, name || null, dept || null, position || null])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, '企业微信成员表', 1, auditBody(body, requestKey))
    return javaAjax(count)
  }

  await queryOne(connection, 'SELECT userid FROM wxuser WHERE userid = ?', [userid]) || writeFail('企业微信成员不存在')
  const result: any = await connection.query(mysqlQueryOptions(`
    UPDATE wxuser
    SET name = ?, dept = ?, position = ?, status = 'active', last_seen_at = NOW(), inactive_at = NULL
    WHERE userid = ?
    `), [name || null, dept || null, position || null, userid])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '企业微信成员表', 2, auditBody(body, requestKey))
  return javaAjax(count)
}

async function wxuserDelete(event: H3Event, session: AuthSession, connection: PoolConnection, requestKey: string) {
  const userids = stringIdList(pathText(event, 'userids'), '企业微信UserID')
  const result: any = await connection.query(
    mysqlQueryOptions(`DELETE FROM wxuser WHERE userid IN (${sqlPlaceholders(userids)})`),
    userids,
  )
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '企业微信成员表', 3, { userids, requestId: requestKey })
  return javaAjax(count)
}

async function msgtowxWrite(
  event: H3Event,
  session: AuthSession,
  connection: PoolConnection,
  body: Record<string, any>,
  editing: boolean,
  requestKey: string,
) {
  const type = requiredText(body.type, '消息类型', 64)
  const msg = requiredText(body.msg, '消息内容', 10000)
  const isSend = text(body.isSend) || '0'
  const receiverIds = text(body.receiverIds) || null
  const parentid = text(body.parentid) || null
  const createtime = body.createtime ?? null
  if (!editing) {
    const result: any = await connection.query(mysqlQueryOptions(`
      INSERT INTO msgtowx (type, isSend, receiverIds, createtime, parentid, msg)
      VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?)
    `), [type, isSend, receiverIds, createtime, parentid, msg])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, '发送到企微的消息队列', 1, auditBody(body, requestKey))
    return javaAjax(count)
  }

  const id = Number(text(body.id))
  if (!Number.isSafeInteger(id) || id <= 0) writeFail('消息ID不符合规范')
  await queryOne(connection, 'SELECT id FROM msgtowx WHERE id = ?', [id]) || writeFail('消息记录不存在')
  const result: any = await connection.query(mysqlQueryOptions(`
    UPDATE msgtowx
    SET type = ?, isSend = ?, receiverIds = ?, createtime = COALESCE(?, createtime), parentid = ?, msg = ?
    WHERE id = ?
  `), [type, isSend, receiverIds, createtime, parentid, msg, id])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '发送到企微的消息队列', 2, auditBody(body, requestKey))
  return javaAjax(count)
}

async function msgtowxDelete(event: H3Event, session: AuthSession, connection: PoolConnection, requestKey: string) {
  const ids = stringIdList(pathText(event, 'ids'), '消息ID')
  const numericIds = ids.map((id) => {
    const value = Number(id)
    if (!Number.isSafeInteger(value) || value <= 0) writeFail('消息ID不符合规范')
    return value
  })
  const result: any = await connection.query(
    mysqlQueryOptions(`DELETE FROM msgtowx WHERE id IN (${sqlPlaceholders(numericIds)})`),
    numericIds,
  )
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '发送到企微的消息队列', 3, { ids: numericIds, requestId: requestKey })
  return javaAjax(count)
}

function isAdmin(session: AuthSession): boolean {
  return session.userId === 1 || session.roles.includes('admin')
}

const exceptionFields: Array<[string, string]> = [
  ['planNo', 'plan_no'], ['reportDate', 'report_date'], ['shiftName', 'shift_name'], ['finderName', 'finder_name'],
  ['sendDept', 'send_dept'], ['generateProcessName', 'generate_process_name'], ['processName', 'process_name'],
  ['occurDate', 'occur_date'], ['productName', 'product_name'], ['productSpec', 'product_spec'], ['moNumber', 'mo_number'],
  ['chipCode', 'chip_code'], ['chipNo', 'chip_no'], ['riskBatch', 'risk_batch'], ['batchDefectTotal', 'batch_defect_total'],
  ['batchUnit', 'batch_unit'], ['processingMethod', 'processing_method'], ['machineNo', 'machine_no'], ['sampleQty', 'sample_qty'],
  ['sampleUnit', 'sample_unit'], ['defectQty', 'defect_qty'], ['defectUnit', 'defect_unit'], ['defectItem', 'defect_item'],
  ['defectDesc', 'defect_desc'], ['defectImages', 'defect_images'], ['reportImages', 'report_images'],
  ['defectCategory', 'defect_category'], ['operatorName', 'operator_name'], ['technicianName', 'technician_name'],
  ['qualityName', 'quality_name'], ['causeAnalysis', 'cause_analysis'], ['reasonAnalysis', 'reason_analysis'],
  ['correctiveAction', 'corrective_action'], ['preventiveAction', 'preventive_action'], ['handlerName', 'handler_name'],
  ['qcConfirm', 'qc_confirm'], ['remark', 'remark'],
]

function numberValue(value: unknown, label: string, fallback: number | null = null): number | null {
  if (value == null || text(value) === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) writeFail(`${label}不能小于0`)
  return number
}

function exceptionDefectRate(sampleQty: number | null, defectQty: number | null): number {
  if (sampleQty == null || sampleQty <= 0 || defectQty == null || defectQty < 0) return 0
  return Number((defectQty / sampleQty).toFixed(4))
}

async function nextExceptionReportNo(connection: PoolConnection, reportDate: unknown): Promise<string> {
  const date = text(reportDate) || new Date().toISOString().slice(0, 10)
  const normalized = date.slice(0, 10).replaceAll('-', '')
  if (!/^\d{8}$/.test(normalized)) writeFail('报告日期格式不正确')
  const prefix = `ER${normalized}`
  const row = await queryOne(connection, 'SELECT MAX(report_no) AS max_report_no FROM tk_exception_report WHERE report_no LIKE CONCAT(?, \'%\')', [prefix])
  const current = text(row?.max_report_no)
  const sequence = current.startsWith(prefix) ? Number(current.slice(prefix.length)) + 1 : 1
  if (!Number.isSafeInteger(sequence) || sequence > 999999) writeFail('当天异常单编号已达到上限')
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

function exceptionValue(key: string, value: unknown): unknown {
  if (['batchDefectTotal', 'sampleQty', 'defectQty'].includes(key)) return numberValue(value, key === 'sampleQty' ? '抽检数' : key === 'defectQty' ? '不良数' : '批不良总数')
  if (key === 'chipNo') {
    const chipNo = text(value)
    if (chipNo.length > 255) writeFail(`芯片编号长度不能超过255个字符，当前为${chipNo.length}个字符`)
    return chipNo || null
  }
  return value == null ? null : text(value) || null
}

async function exceptionAdd(event: H3Event, session: AuthSession, connection: PoolConnection, body: Record<string, any>, requestKey: string) {
  const id = text(body.id) || crypto.randomUUID()
  const reportDate = body.reportDate ?? body.occurDate ?? null
  const reportNo = await nextExceptionReportNo(connection, reportDate)
  const values: Array<[string, unknown]> = [['id', id], ['report_no', reportNo]]
  for (const [key, column] of exceptionFields) {
    if (body[key] == null) continue
    values.push([column, exceptionValue(key, body[key])])
  }
  const sampleQty = numberValue(body.sampleQty, '抽检数')
  const defectQty = numberValue(body.defectQty, '不良数')
  const status = text(body.reportImages) ? '2' : text(body.status) || '0'
  values.push(['defect_rate', exceptionDefectRate(sampleQty, defectQty)], ['status', status], ['del_flag', '0'], ['create_by', session.userName], ['create_time', new Date()], ['update_by', session.userName], ['update_time', new Date()])
  const result: any = await connection.query(
    mysqlQueryOptions(`INSERT INTO tk_exception_report (${values.map(([column]) => column).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`),
    values.map(([, value]) => value),
  )
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '异常单', 1, auditBody(body, requestKey))
  return javaAjax(count)
}

async function exceptionEdit(event: H3Event, session: AuthSession, connection: PoolConnection, body: Record<string, any>, requestKey: string) {
  const id = requiredText(body.id, '异常单ID', 64)
  const existing = await queryOne(connection, 'SELECT id, report_no, status, report_images, sample_qty, defect_qty FROM tk_exception_report WHERE id = ?', [id])
  if (!existing) writeFail('异常单不存在')
  const reportNo = text(body.reportNo) || text(existing.report_no)
  if (reportNo) {
    const duplicate = await queryOne(connection, 'SELECT id FROM tk_exception_report WHERE report_no = ? AND id <> ?', [reportNo, id])
    if (duplicate) writeFail('报告编号已存在，请重新输入')
  }
  const sets: string[] = ['report_no = ?']
  const params: unknown[] = [reportNo || null]
  for (const [key, column] of exceptionFields) {
    if (!(key in body)) continue
    sets.push(`${column} = ?`)
    params.push(exceptionValue(key, body[key]))
  }
  const sampleQty = 'sampleQty' in body ? numberValue(body.sampleQty, '抽检数') : numberValue(existing.sample_qty, '抽检数')
  const defectQty = 'defectQty' in body ? numberValue(body.defectQty, '不良数') : numberValue(existing.defect_qty, '不良数')
  sets.push('defect_rate = ?')
  params.push(exceptionDefectRate(sampleQty, defectQty))
  const status = text(body.reportImages) ? '2' : text(body.status) || text(existing.status) || '0'
  sets.push('status = ?', 'update_by = ?', 'update_time = ?')
  params.push(status, session.userName, new Date(), id)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE tk_exception_report SET ${sets.join(', ')} WHERE id = ?`), params)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '异常单', 2, auditBody(body, requestKey))
  return javaAjax(count)
}

async function exceptionFlag(event: H3Event, session: AuthSession, connection: PoolConnection, flag: '0' | '2', requestKey: string) {
  const ids = stringIdList(pathText(event, 'ids'), '异常单ID')
  const result: any = await connection.query(
    mysqlQueryOptions(`UPDATE tk_exception_report SET del_flag = ?, update_by = ?, update_time = NOW() WHERE id IN (${sqlPlaceholders(ids)})`),
    [flag, session.userName, ...ids],
  )
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '异常单', flag === '0' ? 2 : 3, { ids, requestId: requestKey })
  return javaAjax(count)
}

export function createStage5WriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
    const requestKey = requestId(event, body)
    const requestBody = auditBody(body, requestKey)

    return withIdempotentWriteSession(
      event,
      `stage5:${kind}`,
      null,
      requestKey,
      requestBody,
      async (session, connection) => {
        switch (kind) {
          case 'suggest-add': return suggestWrite(event, session, connection, body, false, requestKey)
          case 'suggest-edit': return suggestWrite(event, session, connection, body, true, requestKey)
          case 'suggest-delete': return suggestDelete(event, session, connection, requestKey)
          case 'wxuser-add': return wxuserWrite(event, session, connection, body, false, requestKey)
          case 'wxuser-edit': return wxuserWrite(event, session, connection, body, true, requestKey)
          case 'wxuser-delete': return wxuserDelete(event, session, connection, requestKey)
          case 'msgtowx-add': return msgtowxWrite(event, session, connection, body, false, requestKey)
          case 'msgtowx-edit': return msgtowxWrite(event, session, connection, body, true, requestKey)
          case 'msgtowx-delete': return msgtowxDelete(event, session, connection, requestKey)
          case 'exception-add': return exceptionAdd(event, session, connection, body, requestKey)
          case 'exception-edit': return exceptionEdit(event, session, connection, body, requestKey)
          case 'exception-delete': return exceptionFlag(event, session, connection, '2', requestKey)
          case 'exception-restore': return exceptionFlag(event, session, connection, '0', requestKey)
        }
      },
      '操作失败',
      async (session) => {
        void session
      },
    )
  }
}
