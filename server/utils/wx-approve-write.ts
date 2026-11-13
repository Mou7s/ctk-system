import type { H3Event } from 'h3'
import { getHeader, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import {
  affectedRows,
  insertOperationLog,
  javaAjax,
  queryOne,
  sqlPlaceholders,
  stringIdList,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Body = Record<string, any>
type Kind = 'add' | 'edit' | 'delete'

const fields: Array<[string, string]> = [
  ['spName', 'sp_name'], ['spStatus', 'sp_status'], ['templateId', 'template_id'], ['applyTime', 'apply_time'],
  ['applyerUserid', 'applyer_userid'], ['applyerPartyid', 'applyer_partyid'], ['applyDataContents', 'apply_data_contents'],
  ['outtime', 'outtime'], ['backtime', 'backtime'], ['auditerid', 'auditerid'],
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

function requestId(event: H3Event, body: Body): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

async function writeApprove(event: H3Event, session: AuthSession, connection: PoolConnection, body: Body, editing: boolean, requestKey: string) {
  const spNo = text(body.spNo)
  if (!spNo || spNo.length > 128) writeFail('审批编号不能为空')
  if (editing) await queryOne(connection, 'SELECT sp_no FROM wx_approve WHERE sp_no = ?', [spNo]) || writeFail('审批记录不存在')
  const present = fields.filter(([key]) => key in body)
  if (!present.length && !editing) writeFail('没有可写入的审批字段')
  if (editing) {
    if (!present.length) writeFail('没有可修改的审批字段')
    const values = present.map(([key]) => body[key] == null || text(body[key]) === '' ? null : text(body[key]))
    const result: any = await connection.query(mysqlQueryOptions(`UPDATE wx_approve SET ${present.map(([, column]) => `${column} = ?`).join(', ')} WHERE sp_no = ?`), [...values, spNo])
    const count = affectedRows(result[0])
    await insertOperationLog(event, connection, session, '微信审批', 2, { ...body, requestId: requestKey })
    return javaAjax(count)
  }
  const columns = ['sp_no', ...present.map(([, column]) => column)]
  const values = [spNo, ...present.map(([key]) => body[key] == null || text(body[key]) === '' ? null : text(body[key]))]
  const result: any = await connection.query(mysqlQueryOptions(`INSERT INTO wx_approve (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`), values)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '微信审批', 1, { ...body, requestId: requestKey })
  return javaAjax(count)
}

async function deleteApprove(event: H3Event, session: AuthSession, connection: PoolConnection, requestKey: string) {
  const spNos = stringIdList(pathText(event, 'spNos'), '审批编号')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM wx_approve WHERE sp_no IN (${sqlPlaceholders(spNos)})`), spNos)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '微信审批', 3, { spNos, requestId: requestKey })
  return javaAjax(count)
}

export function createWxApproveWriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `wx-approve:${kind}`,
      null,
      requestKey,
      { ...body, requestId: requestKey },
      async (session, connection) => kind === 'delete'
        ? deleteApprove(event, session, connection, requestKey)
        : writeApprove(event, session, connection, body, kind === 'edit', requestKey),
      '微信审批写入失败',
    )
  }
}
