import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'

interface WmsLocationRow extends RowDataPacket {
  location_code: string | null
  warehouse_code: string | null
  warehouse_name: string | null
  zone_code: string | null
  zone_name: string | null
  row_no: number | null
  location_type: string | null
  status: string | null
  pick_sequence: number | null
  kingdee_stock_number: string | null
  kingdee_stock_location_number: string | null
  remark: string | null
  update_by: string | null
  update_time: Date | string | null
  sku_count: number | string | null
  occupied_qty: number | string | null
}

interface WmsSummaryRow extends RowDataPacket {
  locationCount: number | string | null
  enabledCount: number | string | null
  disabledCount: number | string | null
  occupiedCount: number | string | null
  emptyCount: number | string | null
}

const LOCATION_OVERVIEW_COLUMNS = `
  l.location_code,
  l.warehouse_code,
  w.warehouse_name,
  l.zone_code,
  z.zone_name,
  l.row_no,
  l.location_type,
  l.status,
  l.pick_sequence,
  l.kingdee_stock_number,
  l.kingdee_stock_location_number,
  l.remark,
  l.update_by,
  l.update_time,
  COUNT(DISTINCT CASE WHEN k.kd_chuku_number > 0 THEN k.kd_wlbm END) AS sku_count,
  IFNULL(SUM(CASE WHEN k.kd_chuku_number > 0 THEN k.kd_chuku_number ELSE 0 END), 0) AS occupied_qty
`

const LOCATION_OVERVIEW_FROM = `
  FROM wms_location l
  JOIN wms_warehouse w ON w.warehouse_code = l.warehouse_code
  JOIN wms_zone z ON z.warehouse_code = l.warehouse_code AND z.zone_code = l.zone_code
  LEFT JOIN kucun k ON k.status = 'C' AND k.kd_chuku_number > 0
    AND (k.kd_cangku_name LIKE '%25包%' OR k.kd_cangku_name LIKE '%塑封%')
    AND (
      k.kd_cangku_name LIKE CONCAT('%/', l.location_code, '%')
      OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', l.row_no, '-%')
      OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', LPAD(l.row_no, 2, '0'), '-%')
      OR k.kd_kuwei_name = l.location_code
      OR k.kd_kuwei_name = l.kingdee_stock_location_number
    )
`

const LOCATION_GROUP_BY = `
  GROUP BY
    l.location_code,
    l.warehouse_code,
    w.warehouse_name,
    l.zone_code,
    z.zone_name,
    l.row_no,
    l.location_type,
    l.status,
    l.pick_sequence,
    l.kingdee_stock_number,
    l.kingdee_stock_location_number,
    l.remark,
    l.update_by,
    l.update_time
`

const LOCATION_OVERVIEW_SQL = `
  SELECT ${LOCATION_OVERVIEW_COLUMNS}
  ${LOCATION_OVERVIEW_FROM}
  ${LOCATION_GROUP_BY}
  ORDER BY l.pick_sequence
`

const LOCATION_BY_CODE_SQL = `
  SELECT ${LOCATION_OVERVIEW_COLUMNS}
  ${LOCATION_OVERVIEW_FROM}
  WHERE l.location_code = ?
  ${LOCATION_GROUP_BY}
`

const SUMMARY_SQL = `
  SELECT
    COUNT(1) AS locationCount,
    SUM(CASE WHEN status = '0' THEN 1 ELSE 0 END) AS enabledCount,
    SUM(CASE WHEN status = '1' THEN 1 ELSE 0 END) AS disabledCount,
    SUM(CASE WHEN status = '0' AND occupied_qty > 0 THEN 1 ELSE 0 END) AS occupiedCount,
    SUM(CASE WHEN status = '0' AND occupied_qty = 0 THEN 1 ELSE 0 END) AS emptyCount
  FROM (
    SELECT
      l.location_code,
      l.status,
      IFNULL(SUM(CASE WHEN k.kd_chuku_number > 0 THEN k.kd_chuku_number ELSE 0 END), 0) AS occupied_qty
    FROM wms_location l
    LEFT JOIN kucun k ON k.status = 'C' AND k.kd_chuku_number > 0
      AND (k.kd_cangku_name LIKE '%25包%' OR k.kd_cangku_name LIKE '%塑封%')
      AND (
        k.kd_cangku_name LIKE CONCAT('%/', l.location_code, '%')
        OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', l.row_no, '-%')
        OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', LPAD(l.row_no, 2, '0'), '-%')
        OR k.kd_kuwei_name = l.location_code
        OR k.kd_kuwei_name = l.kingdee_stock_location_number
      )
    GROUP BY l.location_code, l.status
  ) location_summary
`

function numericValue(value: number | string | null): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumericValue(value: number | string | null): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDateTime(value: Date | string | null): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

export function normalizeLocationCode(value: unknown): string {
  let code = String(value ?? '').trim().toUpperCase()
  if (code.startsWith('LOC:')) code = code.slice(4).trim()
  return code
}

export function mapWmsLocation(row: WmsLocationRow) {
  return {
    locationCode: row.location_code,
    warehouseCode: row.warehouse_code,
    warehouseName: row.warehouse_name,
    zoneCode: row.zone_code,
    zoneName: row.zone_name,
    rowNo: row.row_no,
    locationType: row.location_type,
    status: row.status,
    pickSequence: row.pick_sequence,
    kingdeeStockNumber: row.kingdee_stock_number,
    kingdeeStockLocationNumber: row.kingdee_stock_location_number,
    skuCount: numericValue(row.sku_count),
    occupiedQty: numericValue(row.occupied_qty),
    createBy: null,
    createTime: null,
    remark: row.remark,
    updateBy: row.update_by,
    updateTime: formatDateTime(row.update_time),
  }
}

function mapSummary(row: WmsSummaryRow | undefined) {
  if (!row) return null
  return {
    locationCount: nullableNumericValue(row.locationCount),
    enabledCount: nullableNumericValue(row.enabledCount),
    disabledCount: nullableNumericValue(row.disabledCount),
    occupiedCount: nullableNumericValue(row.occupiedCount),
    emptyCount: nullableNumericValue(row.emptyCount),
  }
}

export async function queryWmsOverview(pool: Pool) {
  const [summaryRows] = await pool.query<WmsSummaryRow[]>(mysqlQueryOptions(SUMMARY_SQL))
  const [locationRows] = await pool.query<WmsLocationRow[]>(mysqlQueryOptions(LOCATION_OVERVIEW_SQL))
  return {
    summary: mapSummary(summaryRows[0]),
    locations: locationRows.map(mapWmsLocation),
  }
}

export async function queryWmsLocation(pool: Pool, locationCode: unknown) {
  const normalizedCode = normalizeLocationCode(locationCode)
  if (!normalizedCode) return null

  const [rows] = await pool.query<WmsLocationRow[]>(mysqlQueryOptions(LOCATION_BY_CODE_SQL), [normalizedCode])
  return rows[0] ? mapWmsLocation(rows[0]) : null
}
