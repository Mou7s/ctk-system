import type { H3Event } from 'h3'
import { getHeader, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import {
  affectedRows,
  insertOperationLog,
  javaAjax,
  queryOne,
  sqlPlaceholders,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Body = Record<string, any>
type Mode = 'add' | 'edit' | 'delete-by-id' | 'delete-by-ids'

const talentFields: Array<[string, string]> = [
  ['name', '`name`'], ['birthDate', 'birthDate'], ['eduId', 'eduId'], ['isMarriedId', 'isMarriedId'],
  ['position', '`position`'], ['schoolName', 'schoolName'], ['phoneNumber', 'phoneNumber'], ['attachments', 'attachments'],
  ['recordStatus', 'recordStatus'], ['isDel', 'isDel'], ['creator', 'creator'], ['createTime', 'createTime'],
  ['remark', '`remark`'], ['gender', 'gender'], ['nativePlace', 'nativePlace'], ['interviewTime', 'interviewTime'],
  ['modifier', 'modifier'], ['updateTime', 'updateTime'],
]

function pathText(event: H3Event, name: string): string {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return text(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return text(named)
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return text(segments.at(-1))
}

function requestId(event: H3Event, body: unknown): string {
  const item = body && typeof body === 'object' && !Array.isArray(body) ? body as Body : {}
  return text(getHeader(event, 'idempotency-key')) || text(item.requestId) || crypto.randomUUID()
}

function requiredTalent(body: Body) {
  const required: Array<[string, string]> = [
    ['name', '名称'], ['nativePlace', '籍贯'], ['position', '岗位'], ['phoneNumber', '电话'], ['eduId', '学历'],
  ]
  for (const [key, label] of required) if (!text(body[key])) writeFail(`${label}不能为空`)
  if (body.gender == null || text(body.gender) === '') writeFail('性别不能为空')
  if (body.birthDate == null || text(body.birthDate) === '') writeFail('出生日期不能为空')
}

function valueFor(key: string, body: Body): unknown {
  const value = body[key]
  if (key === 'gender' || key === 'recordStatus' || key === 'isDel') {
    if (value == null || text(value) === '') return null
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) writeFail(`${key}必须是整数`)
    return parsed
  }
  return value == null || text(value) === '' ? null : text(value)
}

async function writeTalent(event: H3Event, session: AuthSession, connection: PoolConnection, body: Body, editing: boolean, requestKey: string) {
  requiredTalent(body)
  const id = editing ? Number(body.id) : null
  if (editing && (!Number.isSafeInteger(id) || id <= 0)) writeFail('人才ID不符合规范')
  if (editing) await queryOne(connection, 'SELECT id FROM talent_lib WHERE id = ? AND isDel = 0', [id]) || writeFail('人才记录不存在')
  const display = text(session.user.nickName) || session.userName
  const now = new Date()
  if (!editing) {
    const values: unknown[] = []
    const columns: string[] = []
    for (const [key, column] of talentFields) {
      if (key === 'modifier' || key === 'updateTime') continue
      if (key === 'creator') { columns.push(column); values.push(display); continue }
      if (key === 'createTime') { columns.push(column); values.push(now); continue }
      if (key === 'isDel') { columns.push(column); values.push(0); continue }
      if (key in body) { columns.push(column); values.push(valueFor(key, body)) }
    }
    const result: any = await connection.query(mysqlQueryOptions(`INSERT INTO talent_lib (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`), values)
    const generatedId = Number(result[0]?.insertId || body.id || 0)
    await insertOperationLog(event, connection, session, '人才库', 1, { ...body, requestId: requestKey })
    return apiSuccess({ ...body, id: generatedId, creator: display, createTime: now, isDel: 0 })
  }

  const fields = talentFields.filter(([key]) => !['creator', 'createTime', 'isDel'].includes(key) && key in body)
  if (!fields.length) writeFail('没有可修改的人才字段')
  const values = fields.map(([key]) => valueFor(key, body))
  values.push(display, now, id)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE talent_lib SET ${fields.map(([, column]) => `${column} = ?`).join(', ')}, modifier = ?, updateTime = ? WHERE id = ? AND isDel = 0`), values)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '人才库', 2, { ...body, requestId: requestKey })
  return javaAjax(count)
}

async function deleteTalent(event: H3Event, session: AuthSession, connection: PoolConnection, body: unknown, requestKey: string) {
  const rawIds = Array.isArray(body) ? body : [pathText(event, 'id')]
  const ids = rawIds.map((value) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) writeFail('人才ID不符合规范')
    return id
  })
  if (!ids.length) writeFail('人才ID不能为空')
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE talent_lib SET isDel = 1, modifier = ?, updateTime = NOW() WHERE id IN (${sqlPlaceholders(ids)}) AND isDel = 0`), [session.userName, ...ids])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '人才库', 3, { ids, requestId: requestKey })
  return javaAjax(count)
}

export function createTalentWriteHandler(mode: Mode) {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
    const requestKey = requestId(event, rawBody)
    return withIdempotentWriteSession(
      event,
      `talent:${mode}`,
      null,
      requestKey,
      { ...(Array.isArray(rawBody) ? { ids: rawBody } : body), requestId: requestKey },
      async (session, connection) => mode === 'delete-by-id' || mode === 'delete-by-ids'
        ? deleteTalent(event, session, connection, rawBody, requestKey)
        : writeTalent(event, session, connection, body, mode === 'edit', requestKey),
      '人才写入失败',
    )
  }
}
