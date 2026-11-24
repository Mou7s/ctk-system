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
type Kind = 'pd-add' | 'pd-edit' | 'pd-delete' | 'pd-ck-add' | 'pd-ck-edit' | 'pd-ck-delete'

const definitions = {
  pd: {
    table: 'pd',
    title: '盘点',
    idKey: 'id',
    fields: [
      ['pdDate', 'pdDate'], ['process', 'process'], ['flowNo', 'flowNo'], ['productId', 'productId'],
      ['productName', 'productName'], ['specification', 'specification'], ['lot', 'lot'], ['number', 'number'],
      ['pdNumber', 'pd_number'], ['remark', 'remark'], ['processStatus', 'process_status'],
    ],
  },
  'pd-ck': {
    table: 'pd_cangku',
    title: '盘点_仓库',
    idKey: 'id',
    fields: [
      ['mertiralid', 'mertiralid'], ['mertiralname', 'mertiralname'], ['fengzhuang', 'fengzhuang'],
      ['yinzi', 'yinzi'], ['kuwei', 'kuwei'], ['number', 'number'], ['pddate', 'pddate'],
      ['remark', 'remark'], ['creator', 'creator'],
    ],
  },
} as const

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

function numericValue(value: unknown, label: string): number | null {
  if (value == null || text(value) === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) writeFail(`${label}必须是有效数字`)
  return number
}

function valueFor(key: string, value: unknown): unknown {
  if (key === 'number' || key === 'pdNumber') return numericValue(value, key === 'pdNumber' ? '盘点数量' : '库存数量')
  return value == null || text(value) === '' ? null : text(value)
}

function workshopToday(): string {
  // 车间盘点日按东八区日期计，不依赖服务器时区
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

async function writeRecord(event: H3Event, session: AuthSession, connection: PoolConnection, body: Body, definition: typeof definitions.pd, editing: boolean, requestKey: string) {
  // 普通新增返回默认「操作成功」→ 前端展示"新增成功"；覆盖/修改时如实回报，绝不静默
  let successMessage = editing ? '修改成功' : undefined
  if (!editing && definition.table === 'pd') {
    // 兜底：缺日期的写入按当日落库，避免 NULL 日期记录隐身（历史事故：8/30 全车间 6700+ 条无日期）
    if (!text(body.pdDate)) body.pdDate = workshopToday()
    // 当日查重：同 流程单号+工序+盘点日 已有记录时转为更新（重扫=纠错，最后一次扫描为准）。
    // 扫码节奏为人眼速度、单会话串行，不加行锁；跨日重盘属正常业务，不在此拦截。
    const flowNo = text(body.flowNo)
    const process = text(body.process)
    if (flowNo && process) {
      const existing = await queryOne(
        connection,
        `SELECT id FROM pd WHERE flowNo = ? AND process = ? AND pdDate = ? ORDER BY id LIMIT 1`,
        [flowNo, process, text(body.pdDate)],
      )
      if (existing) {
        editing = true
        body.id = text(existing.id)
        // 覆盖不是静默行为：msg 如实回报，前端 toast 直接展示给盘点员
        successMessage = '该单今日已盘点，已覆盖更新上一次记录'
      }
    }
  }
  const id = editing ? text(body.id) : text(body.id) || crypto.randomUUID().replaceAll('-', '')
  if (!id || id.length > 128) writeFail('盘点记录ID不符合规范')
  if (editing) await queryOne(connection, `SELECT id FROM ${definition.table} WHERE id = ?`, [id]) || writeFail('盘点记录不存在')
  const fields = definition.fields.filter(([key]) => key in body)
  if (!fields.length) writeFail('没有可写入的盘点字段')
  const values = fields.map(([key]) => valueFor(key, body[key]))
  let result: any
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`UPDATE ${definition.table} SET ${fields.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`), [...values, id])
  } else {
    result = await connection.query(mysqlQueryOptions(`INSERT INTO ${definition.table} (id, ${fields.map(([, column]) => column).join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`), [id, ...values])
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, definition.title, editing ? 2 : 1, { ...body, requestId: requestKey })
  return javaAjax(count, successMessage)
}

async function deleteRecords(event: H3Event, session: AuthSession, connection: PoolConnection, definition: typeof definitions.pd, requestKey: string) {
  const ids = stringIdList(pathText(event, 'ids'), '盘点记录ID')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM ${definition.table} WHERE id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, definition.title, 3, { ids, requestId: requestKey })
  return javaAjax(count)
}

export function createPdWriteHandler(kind: Kind) {
  const prefix = kind.startsWith('pd-ck-') ? 'pd-ck' : 'pd'
  const definition = definitions[prefix]
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `stage5:${kind}`,
      null,
      requestKey,
      { ...body, requestId: requestKey },
      async (session, connection) => kind.endsWith('delete')
        ? deleteRecords(event, session, connection, definition, requestKey)
        : writeRecord(event, session, connection, body, definition, kind.endsWith('edit'), requestKey),
      '盘点写入失败',
    )
  }
}
