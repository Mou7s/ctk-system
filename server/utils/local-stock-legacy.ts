import { finishedInventoryOnly, finishedInventoryMaterials, inventoryMaterialPredicate } from './inventory-visibility'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getQuery, readBody } from 'h3'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { pageRequest, queryPage, queryText, withReadSession } from './read'
import { withIdempotentWriteSession, bodyOf, decimal, requiredText, text, writeFail } from './write'
import type { AuthSession } from './auth'

type Query = Record<string, unknown>
const STOCK_COLUMNS = 'id, material_code, material_name, package_name, marking, location_code, qty, update_by, update_time, create_time'
const TXN_COLUMNS = 'id, projection_key, txn_type, material_code, material_name, package_name, marking, location_code, qty, balance_qty, operator, remark, create_time'

function filter(query: Query, prefix = '', materials?: readonly string[]) {
  const conditions: string[] = ['qty <> 0']
  const params: unknown[] = []
  const column = (name: string) => prefix ? `${prefix}.${name}` : name
  const scope = inventoryMaterialPredicate(materials, column('material_code'))
  if (scope.sql) { conditions.push(scope.sql); params.push(...scope.params) }
  const equal = (key: string, field: string) => {
    const value = queryText(query[key])
    if (value) { conditions.push(`${column(field)} = ?`); params.push(value) }
  }
  const like = (key: string, field: string) => {
    const value = queryText(query[key])
    if (value) { conditions.push(`${column(field)} LIKE CONCAT('%', ?, '%')`); params.push(value) }
  }
  equal('materialCode', 'material_code')
  like('locationCode', 'location_code')
  like('packageName', 'package_name')
  const keyword = queryText(query.keyword)
  if (keyword) {
    conditions.push(`(${['material_code', 'material_name', 'package_name', 'marking', 'location_code'].map((field) => `${column(field)} LIKE CONCAT('%', ?, '%')`).join(' OR ')})`)
    params.push(keyword, keyword, keyword, keyword, keyword)
  }
  return { sql: ` WHERE ${conditions.join(' AND ')}`, params }
}

export async function listLocalStock(event: H3Event) {
  return withReadSession(event, 'LocalStockList', async (session, pool: Pool) => {
    const materials = finishedInventoryOnly(session) ? await finishedInventoryMaterials() : undefined
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const scoped = filter(query, '', materials)
    const result = await queryPage(pool, `SELECT COUNT(*) AS total FROM tk_local_stock${scoped.sql}`, `SELECT ${STOCK_COLUMNS} FROM tk_local_stock${scoped.sql} ORDER BY update_time DESC, material_code, location_code LIMIT ?, ?`, scoped.params, [...scoped.params, page.offset, page.pageSize])
    return apiSuccessFields({ rows: result.rows, total: result.total }, '查询成功')
  }, '获取本地库存列表失败')
}

export async function summaryLocalStock(event: H3Event) {
  return withReadSession(event, 'LocalStockSummary', async (session, pool: Pool) => {
    const scope = inventoryMaterialPredicate(finishedInventoryOnly(session) ? await finishedInventoryMaterials() : undefined, 'material_code')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT COUNT(*) AS sku_count, IFNULL(SUM(qty), 0) AS total_qty, COUNT(DISTINCT location_code) AS location_count FROM tk_local_stock WHERE qty <> 0' + (scope.sql ? ' AND ' + scope.sql : '')), scope.params)
    const row = rows[0]
    return apiSuccess(row ? {
      skuCount: Number(row.sku_count || 0),
      totalQty: Number(row.total_qty || 0),
      locationCount: Number(row.location_count || 0),
    } : { skuCount: 0, totalQty: 0, locationCount: 0 })
  }, '获取本地库存汇总失败')
}

export async function listLocalStockTxn(event: H3Event) {
  return withReadSession(event, 'LocalStockTxnList', async (session, pool: Pool) => {
    const materials = finishedInventoryOnly(session) ? await finishedInventoryMaterials() : undefined
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    const scope = inventoryMaterialPredicate(materials, 'material_code')
    if (scope.sql) { conditions.push(scope.sql); params.push(...scope.params) }
    for (const [key, field] of [['txnType', 'txn_type'], ['materialCode', 'material_code']] as const) {
      const value = queryText(query[key])
      if (value) { conditions.push(`${field} = ?`); params.push(value) }
    }
    for (const [key, field] of [['locationCode', 'location_code'], ['keyword', 'material_code']] as const) {
      const value = queryText(query[key])
      if (value) { conditions.push(`${field} LIKE CONCAT('%', ?, '%')`); params.push(value) }
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const result = await queryPage(pool, `SELECT COUNT(*) AS total FROM tk_local_stock_txn${where}`, `SELECT ${TXN_COLUMNS} FROM tk_local_stock_txn${where} ORDER BY create_time DESC LIMIT ?, ?`, params, [...params, page.offset, page.pageSize])
    return apiSuccessFields({ rows: result.rows, total: result.total }, '查询成功')
  }, '获取本地库存流水失败')
}

async function assertAdmin(session: AuthSession) {
  if (session.userId !== 1 && !session.roles.includes('admin')) writeFail('仅管理员可执行旧版本地库存纠偏', 403)
}

async function inbound(event: H3Event, session: AuthSession, connection: PoolConnection) {
  await assertAdmin(session)
  const body = await bodyOf(event)
  const materialCode = requiredText(body.materialCode, '物料编码')
  const locationCode = requiredText(body.locationCode, '库位')
  const qty = decimal(body.qty, '入库数量', { required: true, positive: true }) as number
  const projectionKey = text(body.projectionKey) || null
  if (projectionKey) {
    const existing = await queryOne(connection, 'SELECT id FROM tk_local_stock_txn WHERE projection_key = ? LIMIT 1', [projectionKey])
    if (existing) {
      const current = await queryOne(connection, `SELECT ${STOCK_COLUMNS} FROM tk_local_stock WHERE material_code = ? AND location_code = ? LIMIT 1`, [materialCode, locationCode])
      return apiSuccess(current)
    }
  }
  const current = await queryOne(connection, `SELECT ${STOCK_COLUMNS} FROM tk_local_stock WHERE material_code = ? AND location_code = ? LIMIT 1`, [materialCode, locationCode])
  const balance = Number(current?.qty || 0) + qty
  const userName = session.userName
  if (current) {
    await connection.query(mysqlQueryOptions('UPDATE tk_local_stock SET qty = ?, material_name = COALESCE(?, material_name), package_name = COALESCE(?, package_name), marking = COALESCE(?, marking), update_by = ?, update_time = NOW() WHERE id = ?'), [balance, body.materialName || null, body.packageName || null, body.marking || null, userName, current.id])
  } else {
    await connection.query(mysqlQueryOptions('INSERT INTO tk_local_stock (id, material_code, material_name, package_name, marking, location_code, qty, update_by, update_time, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'), [randomUUID(), materialCode, body.materialName || null, body.packageName || null, body.marking || null, locationCode, qty, userName])
  }
  await connection.query(mysqlQueryOptions(`INSERT INTO tk_local_stock_txn (${TXN_COLUMNS.replace(/^id, /, '')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`), [projectionKey, 'IN', materialCode, body.materialName || current?.material_name || null, body.packageName || current?.package_name || null, body.marking || current?.marking || null, locationCode, qty, balance, userName, body.remark || null])
  const latest = await queryOne(connection, `SELECT ${STOCK_COLUMNS} FROM tk_local_stock WHERE material_code = ? AND location_code = ? LIMIT 1`, [materialCode, locationCode])
  return apiSuccess(latest)
}

async function queryOne(connection: PoolConnection, sql: string, params: unknown[] = []) {
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(sql), params)
  return rows[0] || null
}

export async function inboundLocalStock(event: H3Event) {
  const raw = await readBody(event)
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const requestId = text((body as Query).requestId) || randomUUID()
  return withIdempotentWriteSession(event, 'local-stock:inbound', null, requestId, body, (session, connection) => inbound(event, session, connection), '本地库存入库失败')
}
