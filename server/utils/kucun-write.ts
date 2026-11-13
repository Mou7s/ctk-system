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

type KucunBody = Record<string, any>

const fields: Array<[string, string]> = [
  ['kdBillno', 'kd_billno'],
  ['kdWlbm', 'kd_wlbm'],
  ['kdWumc', 'kd_wumc'],
  ['kdGgxh', 'kd_ggxh'],
  ['kdCangkuId', 'kd_cangku_id'],
  ['kdCangkuName', 'kd_cangku_name'],
  ['kdKuweiId', 'kd_kuwei_id'],
  ['kdKuweiName', 'kd_kuwei_name'],
  ['kdChukuNumber', 'kd_chuku_number'],
  ['kdChukuTime', 'kd_chuku_time'],
  ['syncTime', 'sync_time'],
  ['status', 'status'],
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

function requestId(event: H3Event, body: KucunBody): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function auditBody(body: KucunBody, requestKey: string) {
  return { ...body, requestId: requestKey }
}

function decimalOrNull(value: unknown, label: string): number | null {
  if (value == null || text(value) === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) writeFail(`${label}不能小于0`)
  return number
}

function fieldValue(body: KucunBody, key: string): unknown {
  if (key === 'kdChukuNumber') return decimalOrNull(body[key], '出库数量')
  if (key === 'status') return text(body[key]) || null
  return body[key] == null || text(body[key]) === '' ? null : text(body[key])
}

async function writeKucun(
  event: H3Event,
  session: AuthSession,
  connection: PoolConnection,
  body: KucunBody,
  editing: boolean,
  requestKey: string,
) {
  const id = editing ? text(body.id) : text(body.id) || crypto.randomUUID().replaceAll('-', '')
  if (!id || id.length > 128) writeFail('库存记录ID不符合规范')
  if (editing) await queryOne(connection, 'SELECT id FROM kucun WHERE id = ?', [id]) || writeFail('库存记录不存在')

  const present = fields.filter(([key]) => key in body)
  if (!present.length) writeFail('没有可写入的库存字段')
  const values = present.map(([key]) => fieldValue(body, key))

  let result: any
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`UPDATE kucun SET ${present.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`), [...values, id])
  } else {
    result = await connection.query(mysqlQueryOptions(`INSERT INTO kucun (id, ${present.map(([, column]) => column).join(', ')}) VALUES (?, ${present.map(() => '?').join(', ')})`), [id, ...values])
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'D栋库存', editing ? 2 : 1, auditBody(body, requestKey))
  return javaAjax(count)
}

async function deleteKucun(event: H3Event, session: AuthSession, connection: PoolConnection, requestKey: string) {
  const ids = stringIdList(pathText(event, 'ids'), '库存记录ID')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM kucun WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, 'D栋库存', 3, { ids, requestId: requestKey })
  return javaAjax(count)
}

export function createKucunWriteHandler(kind: 'add' | 'edit' | 'delete') {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as KucunBody : {}
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `kucun:${kind}`,
      null,
      requestKey,
      auditBody(body, requestKey),
      async (session, connection) => kind === 'delete'
        ? deleteKucun(event, session, connection, requestKey)
        : writeKucun(event, session, connection, body, kind === 'edit', requestKey),
      '库存写入失败',
    )
  }
}
