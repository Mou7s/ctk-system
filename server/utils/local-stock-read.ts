import { finishedInventoryOnly, finishedInventoryMaterials } from './inventory-visibility'
import type { H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { getQuery } from 'h3'
import { queryText, withReadSession } from './read'
import { queryK3Inventory } from './stock-document'
import { STAGING_TARGET_STOCK } from './local-stock-staging-config'

type Query = Record<string, unknown>

const PACKAGE_RULES: Array<[string, string]> = [
  ['SOT23', 'A1-A9'],
  ['TO252', 'A10-A12'],
  ['DFN', 'A13'],
  ['SOD523', 'A14-A15'],
  ['SOD323', 'B1-B6'],
  ['SOD123', 'B7-B11'],
  ['插件', 'B12'],
  ['SOT89', 'B13'],
  ['SMB', 'B13-B14'],
  ['SMA', 'B15'],
]

function normalizeSpecification(value: unknown): string {
  const source = queryText(value).trim().toUpperCase()
  return [...source].filter((char) => /[A-Z0-9\u4E00-\u9FFF]/u.test(char)).join('')
}

function zoneOf(value: unknown): string {
  const normalized = normalizeSpecification(value)
  return PACKAGE_RULES.find(([key]) => normalized.includes(key))?.[1] || ''
}

function parseShelf(value: string): { letter: string; number: number } | null {
  const match = /^([A-Z]+)(\d+)$/u.exec(value.trim().toUpperCase())
  if (!match) return null
  return { letter: match[1], number: Number(match[2]) }
}

function expandZone(value: unknown): string[] {
  const text = queryText(value).trim().toUpperCase().replaceAll(' ', '')
  if (!text) return []
  if (!text.includes('-')) return [text]
  const separator = text.indexOf('-')
  const startText = text.slice(0, separator)
  const endText = text.slice(separator + 1)
  const start = parseShelf(startText)
  const end = parseShelf(endText)
  if (!start || !end || start.letter !== end.letter) return [...new Set([startText, endText])]
  const from = Math.min(start.number, end.number)
  const to = Math.max(start.number, end.number)
  return Array.from({ length: to - from + 1 }, (_, index) => `${start.letter}${from + index}`)
}

function shelvesOf(value: unknown): string[] {
  return expandZone(zoneOf(value) || queryText(value).trim().toUpperCase())
}

function normalizeRowCode(value: string): string {
  const match = /^([A-Z]+)(\d+)$/u.exec(value.trim().toUpperCase())
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

async function selectEnabledLocations(pool: Pool, locationCodes: string[]): Promise<Set<string>> {
  if (!locationCodes.length) return new Set()
  const placeholders = locationCodes.map(() => '?').join(', ')
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT l.location_code
    FROM wms_location l
    JOIN wms_warehouse w ON w.warehouse_code = l.warehouse_code AND w.status = '0'
    JOIN wms_zone z ON z.warehouse_code = l.warehouse_code AND z.zone_code = l.zone_code AND z.status = '0'
    WHERE l.location_code IN (${placeholders}) AND l.status = '0'
  `), locationCodes)
  return new Set(rows.map((row) => String(row.location_code || '').trim()))
}

function locationKey(value: unknown): string {
  const source = queryText(value).trim().toUpperCase().replaceAll(' ', '')
  const direct = normalizeRowCode(source)
  if (direct) return direct
  const match = /^([AB])-?0?(\d{1,2})$/u.exec(source)
    || /^([AB])区0?(\d{1,2})排$/u.exec(source)
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : ''
}

type K3InventoryRow = Record<string, unknown>

function inventoryRows(result: unknown): K3InventoryRow[] {
  const rows = result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).rows)
    ? (result as Record<string, unknown>).rows
    : []
  return rows.filter((row): row is K3InventoryRow => Boolean(row && typeof row === 'object'))
}

function summarizeK3Locations(rows: K3InventoryRow[]): Map<string, { occupiedQty: number; skuCount: number }> {
  const summary = new Map<string, { occupiedQty: number; skuCount: number; materials: Set<string> }>()
  for (const row of rows) {
    const location = locationKey(row.stockLocationNumber || row.stockLocationName)
    if (!location) continue
    const current = summary.get(location) || { occupiedQty: 0, skuCount: 0, materials: new Set<string>() }
    current.occupiedQty += numberValue(row.availableQty)
    const material = queryText(row.materialNumber).trim().toUpperCase()
    if (material) current.materials.add(material)
    current.skuCount = current.materials.size
    summary.set(location, current)
  }
  return new Map([...summary.entries()].map(([location, value]) => [location, {
    occupiedQty: value.occupiedQty,
    skuCount: value.skuCount,
  }]))
}

export async function suggestLocalStockLocation(event: H3Event) {
  return withReadSession(event, 'LocalStockSuggest', async (session, pool) => {
    const materials = finishedInventoryOnly(session) ? await finishedInventoryMaterials() : undefined
    const query = getQuery(event) as Query
    const materialCode = queryText(query.materialCode).trim()
    const packageName = queryText(query.packageName).trim()
    const zone = zoneOf(packageName)
    const candidates = shelvesOf(packageName)
    const result: Record<string, unknown> = { zone, candidates }

    if (materialCode) {
      const materialInventory = inventoryRows(await queryK3Inventory({
        material: materialCode,
        stock: STAGING_TARGET_STOCK,
        availableOnly: 'true',
        pageNum: 1,
        pageSize: 100,
      }, materials))
      const materialSummary = summarizeK3Locations(materialInventory)
      const enabled = await selectEnabledLocations(pool, [...materialSummary.keys()])
      const existing = [...materialSummary.entries()]
        .filter(([location]) => enabled.has(location))
        .sort(([, left], [, right]) => right.occupiedQty - left.occupiedQty)[0]
      if (existing) {
        const [locationCode, summary] = existing
        result.locationCode = locationCode
        result.reason = 'SAME_MATERIAL_KINGDEE'
        result.reasonText = `金蝶库存显示同物料已在 ${locationCode}，建议继续上架`
        result.existingQty = summary.occupiedQty
        return apiSuccess(result)
      }
    }

    if (!candidates.length) {
      result.locationCode = ''
      result.reason = 'NO_RULE'
      result.reasonText = '未匹配封装分区规则，请手动扫库位'
      return apiSuccess(result)
    }

    const rowCodes = candidates.map(normalizeRowCode).filter(Boolean)
    if (!rowCodes.length) {
      result.locationCode = ''
      result.reason = 'NO_RULE'
      result.reasonText = '未匹配封装分区规则，请手动扫库位'
      return apiSuccess(result)
    }

    const enabled = await selectEnabledLocations(pool, rowCodes)
    const enabledRowCodes = rowCodes.filter((rowCode) => enabled.has(rowCode))
    const occupancy = summarizeK3Locations(inventoryRows(await queryK3Inventory({
      stock: STAGING_TARGET_STOCK,
      location: enabledRowCodes,
      availableOnly: 'true',
      pageNum: 1,
      pageSize: 100,
    }, materials)))
    const available = enabledRowCodes
      .map((locationCode) => {
        const summary = occupancy.get(locationCode)
        return {
          location_code: locationCode,
          occupied_qty: summary?.occupiedQty || 0,
          sku_count: summary?.skuCount || 0,
        }
      })
      .sort((left, right) => left.occupied_qty - right.occupied_qty
        || left.sku_count - right.sku_count
        || rowCodes.indexOf(left.location_code) - rowCodes.indexOf(right.location_code))
    if (!available.length) {
      result.locationCode = ''
      result.reason = 'NO_AVAILABLE_LOCATION'
      result.reasonText = `封装区 ${zone} 暂无可用正式库位`
      return apiSuccess(result)
    }

    const locationCode = String(available[0].location_code || '').trim()
    const occupiedQty = numberValue(available[0].occupied_qty)
    result.candidates = available.slice(0, 8)
      .map((row) => String(row.location_code || '').trim())
      .filter(Boolean)
    result.locationCode = locationCode
    result.existingQty = occupiedQty
    if (occupiedQty <= 0) {
      result.reason = 'EMPTY_SHELF'
      result.reasonText = `封装区 ${zone} 内推荐空库位 ${locationCode}`
    } else {
      result.reason = 'LEAST_OCCUPIED'
      result.reasonText = `封装区 ${zone} 内推荐占用最少的 ${locationCode}`
    }
    return apiSuccess(result)
  }, '获取推荐库位失败')
}
