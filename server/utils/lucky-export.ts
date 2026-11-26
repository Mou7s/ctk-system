import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { loadXlsx } from './lazy-deps'
import { mysqlQueryOptions, getMysqlPool } from './mysql'
import { queryText, withReadSession } from './read'

type Query = Record<string, unknown>

function mergeQuery(query: Query, key: string, value: unknown) {
  const paramsMatch = /^params\[(.+)\]$/.exec(key)
  query[paramsMatch?.[1] || key] = value
}

async function requestQuery(event: H3Event): Promise<Query> {
  const query: Query = { ...(getQuery(event) as Query) }
  const body = await readBody(event)
  if (typeof body === 'string') {
    for (const [key, value] of new URLSearchParams(body).entries()) mergeQuery(query, key, value)
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) mergeQuery(query, key, value)
  }
  return query
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(text)
  }
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function cellValue(value: unknown) {
  return value == null ? '' : value
}

function dateTimeValue(value: unknown) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  const text = String(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text) ? text.slice(0, 19) : text
}

function translated(value: unknown) {
  const labels: Record<string, string> = {
    '0': '未中奖',
    '1': '已中奖未兑换',
    '2': '已核销兑换',
  }
  const raw = value == null ? '' : String(value)
  return labels[raw] || cellValue(value)
}

async function sendExcel(event: H3Event, rows: RowDataPacket[]) {
  const XLSX = await loadXlsx()
  const headers = ['活动ID', '手机号', '姓名', '公司名', '职务', '微信OpenID', '奖品ID', '奖品名称', '中奖状态', '兑奖码', '抽奖时间', '兑奖时间']
  const data = rows.map((row) => [
    cellValue(row.activity_id), cellValue(row.user_phone), cellValue(row.user_name), cellValue(row.user_company),
    cellValue(row.user_job), cellValue(row.openid), cellValue(row.prize_id), cellValue(row.prize_name),
    translated(row.win_status), cellValue(row.redeem_code), dateTimeValue(row.draw_time), dateTimeValue(row.redeem_time),
  ])
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '中奖核销记录')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('中奖核销记录.xlsx')}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

export async function exportLuckyRecords(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'LuckyRecordExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    if (query.activityId !== undefined && query.activityId !== null && queryText(query.activityId) !== '') {
      conditions.push('activity_id = ?')
      params.push(queryText(query.activityId))
    }
    like(conditions, params, 'user_phone', query.userPhone)
    like(conditions, params, 'user_name', query.userName)
    like(conditions, params, 'prize_name', query.prizeName)
    equal(conditions, params, 'win_status', query.winStatus)
    equal(conditions, params, 'redeem_code', query.redeemCode)
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT activity_id, user_phone, user_name, user_company, user_job, openid,
             prize_id, prize_name, win_status, redeem_code, draw_time, redeem_time
      FROM tk_lucky_record${where(conditions)}
      ORDER BY id DESC`), params)
    return sendExcel(event, rows)
  }, '导出中奖核销记录失败')
}
