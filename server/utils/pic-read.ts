import { getQuery, getRouterParam, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { pageRequest, queryPage, queryText, tableResult, withReadSession } from './read'

type Query = Record<string, unknown>

const picSelect = `id, flowno, materialno, materialname, specification, remark, imgPaths, mechineName, createdate, modifydate, xpdm, xpph, khdm, handler, creator, updater, result, testNumber, testCharge`

function queryValue(query: Query, key: string) {
  const direct = query[key]
  if (direct !== undefined) return direct

  const bracketed = query[`params[${key}]`]
  if (bracketed !== undefined) return bracketed

  const nested = query.params
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return (nested as Record<string, unknown>)[key]
  }

  return undefined
}

function formatDateTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 19).replace('T', ' ') : value
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return String(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
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

// 前端日期控件只传 YYYY-MM-DD 时补全为当天起止，避免 BETWEEN 漏掉当天 00:00 之后的数据
function dateTimeBound(value: unknown, endOfDay: boolean): string | null {
  const text = queryText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return endOfDay ? `${text} 23:59:59` : `${text} 00:00:00`
  return text
}

function picFilter(query: Query) {
  const conditions: string[] = []
  const params: unknown[] = []
  like(conditions, params, 'flowno', queryValue(query, 'flowno'))
  equal(conditions, params, 'materialno', queryValue(query, 'materialno'))
  like(conditions, params, 'materialname', queryValue(query, 'materialname'))
  like(conditions, params, 'specification', queryValue(query, 'specification'))
  equal(conditions, params, 'imgPaths', queryValue(query, 'imgPaths'))
  like(conditions, params, 'mechineName', queryValue(query, 'mechineName'))

  const beginCreatedate = dateTimeBound(queryValue(query, 'beginCreatedate'), false)
  const endCreatedate = dateTimeBound(queryValue(query, 'endCreatedate'), true)
  if (beginCreatedate && endCreatedate) {
    conditions.push('createdate BETWEEN ? AND ?')
    params.push(beginCreatedate, endCreatedate)
  }

  const beginModifydate = dateTimeBound(queryValue(query, 'beginModifydate'), false)
  const endModifydate = dateTimeBound(queryValue(query, 'endModifydate'), true)
  if (beginModifydate && endModifydate) {
    conditions.push('modifydate BETWEEN ? AND ?')
    params.push(beginModifydate, endModifydate)
  }

  like(conditions, params, 'xpdm', queryValue(query, 'xpdm'))
  like(conditions, params, 'xpph', queryValue(query, 'xpph'))
  like(conditions, params, 'khdm', queryValue(query, 'khdm'))
  like(conditions, params, 'handler', queryValue(query, 'handler'))
  like(conditions, params, 'creator', queryValue(query, 'creator'))
  like(conditions, params, 'updater', queryValue(query, 'updater'))
  equal(conditions, params, 'result', queryValue(query, 'result'))
  equal(conditions, params, 'testNumber', queryValue(query, 'testNumber'))
  like(conditions, params, 'testCharge', queryValue(query, 'testCharge'))

  return {
    sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

function mapPicRow(row: RowDataPacket, includeImageSource = true): Record<string, unknown> {
  const imgPaths = row.imgPaths == null ? '' : String(row.imgPaths)
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: row.remark ?? null,
    id: row.id,
    flowno: row.flowno,
    materialno: row.materialno,
    materialname: row.materialname,
    specification: row.specification,
    imgPaths,
    imgSrcPaths: includeImageSource ? imgPaths.replaceAll('/dkPic_zip/', '/dkPic/') : null,
    mechineName: row.mechineName,
    createdate: formatDateTime(row.createdate),
    modifydate: formatDateTime(row.modifydate),
    xpdm: row.xpdm,
    xpph: row.xpph,
    khdm: row.khdm,
    handler: row.handler,
    creator: row.creator,
    updater: row.updater,
    result: row.result,
    testNumber: row.testNumber,
    testCharge: row.testCharge,
  }
}

export async function listPic(event: H3Event) {
  return withReadSession(event, 'PicList', async (_, pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const current = picFilter(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM dk_pic${current.sql}`,
      `SELECT ${picSelect} FROM dk_pic${current.sql} ORDER BY createdate DESC LIMIT ?, ?`,
      current.params,
      [...current.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows.map((row) => mapPicRow(row)), result.total)
  }, '获取弹坑图片列表失败')
}

export async function getPic(event: H3Event) {
  return withReadSession(event, 'PicDetail', async (_, pool) => {
    const id = queryText(getRouterParam(event, 'id')).trim()
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${picSelect} FROM dk_pic WHERE id = ? LIMIT 1`,
    ), [id])
    return apiSuccess(rows[0] ? mapPicRow(rows[0], false) : null)
  }, '获取弹坑图片详情失败')
}

export async function getPicHandlerList(event: H3Event) {
  return withReadSession(event, 'PicHandlerList', async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      "SELECT handler FROM dk_pic WHERE handler IS NOT NULL AND handler <> '' GROUP BY handler ORDER BY MAX(createdate) DESC LIMIT 10",
    ))
    return rows.map((row) => row.handler)
  }, '获取弹坑图片操作员列表失败')
}

export async function getPicMechineList(event: H3Event) {
  return withReadSession(event, 'PicMechineList', async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      "SELECT DISTINCT mechineName FROM dk_pic WHERE mechineName IS NOT NULL AND mechineName <> '' ORDER BY mechineName ASC LIMIT 100",
    ))
    return rows.map((row) => row.mechineName)
  }, '获取弹坑图片机台列表失败')
}
