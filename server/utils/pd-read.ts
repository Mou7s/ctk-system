import { getQuery, getRouterParam, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { pageRequest, queryPage, queryText, tableResult, withReadSession } from './read'

type Query = Record<string, unknown>
export type PdReadKind = 'pd' | 'pd-ck'

function decimalValue(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapPdRow(row: RowDataPacket): Record<string, unknown> {
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: row.remark ?? null,
    id: row.id,
    pdDate: row.pdDate,
    process: row.process,
    flowNo: row.flowNo,
    productId: row.productId,
    productName: row.productName,
    specification: row.specification,
    lot: row.lot,
    number: decimalValue(row.number),
    pdNumber: decimalValue(row.pd_number),
    processStatus: row.process_status,
    isUpdatePdData: null,
  }
}

function mapPdCkRow(row: RowDataPacket): Record<string, unknown> {
  return {
    createBy: null,
    createTime: null,
    updateBy: null,
    updateTime: null,
    remark: row.remark ?? null,
    id: row.id,
    mertiralid: row.mertiralid,
    mertiralname: row.mertiralname,
    fengzhuang: row.fengzhuang,
    yinzi: row.yinzi,
    kuwei: row.kuwei,
    number: decimalValue(row.number),
    pddate: row.pddate,
    creator: row.creator,
  }
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

function filter(kind: PdReadKind, query: Query) {
  const conditions: string[] = []
  const params: unknown[] = []
  if (kind === 'pd') {
    equal(conditions, params, 'pdDate', query.pdDate)
    equal(conditions, params, 'process', query.process)
    like(conditions, params, 'flowNo', query.flowNo)
    like(conditions, params, 'productId', query.productId)
    like(conditions, params, 'productName', query.productName)
    like(conditions, params, 'specification', query.specification)
    like(conditions, params, 'lot', query.lot)
  } else {
    equal(conditions, params, 'mertiralid', query.mertiralid)
    like(conditions, params, 'mertiralname', query.mertiralname)
    like(conditions, params, 'fengzhuang', query.fengzhuang)
    like(conditions, params, 'yinzi', query.yinzi)
    like(conditions, params, 'kuwei', query.kuwei)
    equal(conditions, params, 'number', query.number)
    equal(conditions, params, 'creator', query.creator)
    like(conditions, params, 'pddate', query.pddate)
  }
  return {
    sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

const pdSelect = 'id, pdDate, process, flowNo, productId, productName, specification, lot, number, pd_number, remark, process_status'
const pdCkSelect = 'id, mertiralid, mertiralname, fengzhuang, yinzi, kuwei, number, pddate, remark, creator'

export async function listPd(event: H3Event, kind: PdReadKind) {
  return withReadSession(event, kind === 'pd' ? 'PdList' : 'PdCangkuList', async (_, pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const current = filter(kind, query)
    const table = kind === 'pd' ? 'pd' : 'pd_cangku'
    const select = kind === 'pd' ? pdSelect : pdCkSelect
    const order = kind === 'pd' ? 'pdDate DESC' : 'pddate DESC'
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM ${table}${current.sql}`,
      `SELECT ${select} FROM ${table}${current.sql} ORDER BY ${order} LIMIT ?, ?`,
      current.params,
      [...current.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows.map(kind === 'pd' ? mapPdRow : mapPdCkRow), result.total)
  }, kind === 'pd' ? '获取盘点列表失败' : '获取盘点_仓库列表失败')
}

export async function getPd(event: H3Event, kind: PdReadKind) {
  return withReadSession(event, kind === 'pd' ? 'PdDetail' : 'PdCangkuDetail', async (_, pool) => {
    const id = queryText(getRouterParam(event, 'id')).trim()
    const table = kind === 'pd' ? 'pd' : 'pd_cangku'
    const select = kind === 'pd' ? pdSelect : pdCkSelect
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${select} FROM ${table} WHERE id = ? LIMIT 1`,
    ), [id])
    return apiSuccess(rows[0] ? (kind === 'pd' ? mapPdRow(rows[0]) : mapPdCkRow(rows[0])) : null)
  }, kind === 'pd' ? '获取盘点详情失败' : '获取盘点_仓库详情失败')
}

export async function queryPdExportRows(pool: Pool, kind: PdReadKind, query: Query) {
  const current = filter(kind, query)
  const table = kind === 'pd' ? 'pd' : 'pd_cangku'
  const select = kind === 'pd' ? pdSelect : pdCkSelect
  const order = kind === 'pd' ? 'pdDate DESC' : 'pddate DESC'
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    `SELECT ${select} FROM ${table}${current.sql} ORDER BY ${order}`,
  ), current.params)
  return rows
}

export function pdExportRows(kind: PdReadKind, rows: RowDataPacket[]): Array<Record<string, unknown>> {
  if (kind === 'pd') {
    return rows.map((row) => ({
      盘点时间: row.pdDate ?? '',
      盘点工序: row.process ?? '',
      流程单号: row.flowNo ?? '',
      产品编码: row.productId ?? '',
      产品名称: row.productName ?? '',
      规格型号: row.specification ?? '',
      批号: row.lot ?? '',
      库存数量: decimalValue(row.number) ?? '',
      盘点数量: decimalValue(row.pd_number) ?? '',
      工序状态: String(row.process_status ?? '') === '1' ? '已完成' : '进行中',
    }))
  }
  return rows.map((row) => ({
    物料编码: row.mertiralid ?? '',
    物料名称: row.mertiralname ?? '',
    封装: row.fengzhuang ?? '',
    印字: row.yinzi ?? '',
    库位: row.kuwei ?? '',
    数量: decimalValue(row.number) ?? '',
    盘点日期: row.pddate ?? '',
    盘点人: row.creator ?? '',
    备注: row.remark ?? '',
  }))
}
