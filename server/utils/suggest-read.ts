import { getQuery, getRouterParam, readBody } from 'h3'
import type { H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { camelizeRows, pageRequest, queryPage, queryText, tableResult, withReadSession } from './read'

type Query = Record<string, unknown>

// TkSuggest extends BaseEntity, and Java serializes its unmapped base fields as null
// even though the mapper only selects the five tk_suggest columns.
const suggestColumns = 'NULL AS create_by, NULL AS create_time, NULL AS update_by, NULL AS update_time, NULL AS remark, id, suggest_text, suggest_time, ipAdress, noSend'
const exportColumns: Array<[string, string]> = [
  ['意见/建议内容', 'suggestText'],
  ['建议提交时间', 'suggestTime'],
  ['IP地址', 'ipAdress'],
]

export const suggestExportHeaders = exportColumns.map(([label]) => label)

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function suggestFilter(query: Query) {
  const conditions: string[] = []
  const params: unknown[] = []
  equal(conditions, params, 'suggest_text', query.suggestText)
  equal(conditions, params, 'suggest_time', query.suggestTime)
  equal(conditions, params, 'ipAdress', query.ipAdress)
  equal(conditions, params, 'noSend', query.noSend)
  return {
    sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

export function querySuggestRows(pool: Pool, query: Query): Promise<[RowDataPacket[], unknown[]]> {
  const filter = suggestFilter(query)
  return pool.query<RowDataPacket[]>(mysqlQueryOptions(
    `SELECT ${suggestColumns} FROM tk_suggest${filter.sql} ORDER BY suggest_time DESC`,
  ), filter.params) as Promise<[RowDataPacket[], unknown[]]>
}

async function requestQuery(event: H3Event): Promise<Query> {
  const query = { ...(getQuery(event) as Query) }
  const body = await readBody<Record<string, unknown> | string>(event).catch(() => null)
  if (typeof body === 'string' && body) {
    for (const [key, value] of new URLSearchParams(body).entries()) query[key] = value
  } else if (body && typeof body === 'object') {
    Object.assign(query, body)
  }
  return query
}

export async function listSuggest(event: H3Event) {
  return withReadSession(event, 'SuggestList', async (_, pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const filter = suggestFilter(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_suggest${filter.sql}`,
      `SELECT ${suggestColumns} FROM tk_suggest${filter.sql} ORDER BY suggest_time DESC LIMIT ?, ?`,
      filter.params,
      [...filter.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取意见/建议列表失败')
}

export async function getSuggest(event: H3Event) {
  return withReadSession(event, 'SuggestDetail', async (_, pool) => {
    const id = queryText(getRouterParam(event, 'id')).trim()
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${suggestColumns} FROM tk_suggest WHERE id = ? LIMIT 1`,
    ), [id])
    return apiSuccess(rows[0] ? camelizeRows<Record<string, unknown>>(rows)[0] : null)
  }, '获取意见/建议详情失败')
}

export function suggestExportRows(rows: RowDataPacket[]): Array<Record<string, unknown>> {
  return camelizeRows<Record<string, unknown>>(rows).map((row) => Object.fromEntries(
    exportColumns.map(([label, field]) => [label, row[field] ?? '']),
  ))
}

export async function exportSuggest(
  event: H3Event,
  sendExcel: (event: H3Event, rows: Array<Record<string, unknown>>) => unknown,
) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SuggestExport', async (_, pool) => {
    const [rows] = await querySuggestRows(pool, query)
    return sendExcel(event, suggestExportRows(rows))
  }, '导出意见/建议失败')
}
