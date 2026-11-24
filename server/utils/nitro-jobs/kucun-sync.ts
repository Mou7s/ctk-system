import { executeBillQuery } from '../k3'
import { getMysqlPool, mysqlQueryOptions } from '../mysql'

/**
 * 内部客户示例库存同步（本地 kucun 表 <- 金蝶销售出库/销售退货）。
 *
 * - 通过环境变量 NUXT_KUCUN_SYNC_CUSTOMER 指定需同步的内部客户编码，同步其 SAL_OUTSTOCK（正数）
 *   与 SAL_RETURNSTOCK（数量取负）。
 * - 行主键 = 金蝶分录内码 FEntity_FEntryId。
 * - 全量：清表后全插；差异：按本地 MAX(sync_time) 拉 (FModifyDate/FApproveDate 更大者) 幂等 upsert。
 */

function kucunSyncCustomer(): string {
  const code = String(process.env.NUXT_KUCUN_SYNC_CUSTOMER || '').trim()
  if (!code) throw new Error('未配置库存同步客户编码（NUXT_KUCUN_SYNC_CUSTOMER）')
  return code
}
const PAGE_SIZE = 1000
const MAX_ROWS = 20000
const WRITE_CHUNK = 500

const OUT_KEYS = [
  'FDocumentStatus',
  'FEntity_FEntryId',
  'FBillNo',
  'FMaterialID.FNumber',
  'FMaterialName',
  'FMateriaModel',
  'FRealQty',
  'FApproveDate',
  'FStockID.FNumber',
  'FStockID.FName',
  'FStockLocID',
  'FEntrynote',
] as const

const RET_KEYS = [
  'FDocumentStatus',
  'FEntity_FEntryId',
  'FBillNo',
  'FMaterialID.FNumber',
  'FMaterialName',
  'FMaterialModel',
  'FRealQty',
  'FApproveDate',
  'FStockID.FNumber',
  'FStockID.FName',
  'FStockLocID',
  'FNote',
] as const

const KUCUN_COLUMNS = [
  'id',
  'kd_billno',
  'kd_wlbm',
  'kd_wumc',
  'kd_ggxh',
  'kd_cangku_id',
  'kd_cangku_name',
  'kd_kuwei_id',
  'kd_kuwei_name',
  'kd_chuku_number',
  'kd_chuku_time',
  'sync_time',
  'status',
] as const

export type KucunRow = Record<(typeof KUCUN_COLUMNS)[number], unknown>

function text(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s ? s : null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatKucunDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function parseSyncTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatKucunDateTime(value)
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 19)
  return null
}

async function queryAllPaged(formId: string, fieldKeys: string[], filterString: string): Promise<unknown[][]> {
  const rows: unknown[][] = []
  let startRow = 0
  for (;;) {
    const batch = await executeBillQuery({
      formId,
      fieldKeys,
      filterString,
      startRow,
      limit: PAGE_SIZE,
    })
    if (!Array.isArray(batch)) throw new Error(`金蝶 ${formId} 查询返回异常`)
    for (const row of batch) {
      if (!Array.isArray(row)) throw new Error(`金蝶 ${formId} 查询字段异常`)
      rows.push(row)
      if (rows.length > MAX_ROWS) throw new Error(`金蝶 ${formId} 返回超 ${MAX_ROWS} 行，已中止（防无界写入）`)
    }
    if (batch.length < PAGE_SIZE) break
    startRow += batch.length
  }
  return rows
}

/** 取仓位弹性域 FID 列表，用于拼 FStockLocID.FF<fid>.FName 取库位名（还原旧 getStockLocList(false)）。 */
async function fetchFlexIds(): Promise<string[]> {
  const rows = await queryAllPaged('BD_FLEXVALUES', ['FID'], '')
  const ids: string[] = []
  for (const row of rows) {
    const fid = text(row[0])
    if (fid && !ids.includes(fid)) ids.push(fid)
  }
  return ids
}

function asRecord(keys: readonly string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  keys.forEach((key, index) => {
    out[key] = row[index]
  })
  return out
}

/**
 * 拉取金蝶源数据并归一化为 kucun 行（不含 sync_time，由调用方统一填写入时间）。
 * since 为空 = 全量；否则只拉 FModifyDate/since 或 FApproveDate/since 之后变更的单据。
 */
export async function fetchKucunSourceRows(since: string | null): Promise<Omit<KucunRow, 'sync_time'>[]> {
  const customer = kucunSyncCustomer().replaceAll("'", "''")
  const flexIds = await fetchFlexIds()
  const flexKeys = flexIds.map((fid) => `FStockLocID.FF${fid}.FName`)
  const outKeys = [...OUT_KEYS, ...flexKeys]
  const retKeys = [...RET_KEYS, ...flexKeys]

  const dateClause = since ? ` and (FModifyDate > '${since}' or FApproveDate > '${since}')` : ''
  const outFilter = `FCustomerID.FNumber = '${customer}'${dateClause}`
  const retFilter = `FRetcustId.FNumber = '${customer}'${dateClause}`

  const [outRows, retRows] = await Promise.all([
    queryAllPaged('SAL_OUTSTOCK', outKeys, outFilter),
    queryAllPaged('SAL_RETURNSTOCK', retKeys, retFilter),
  ])

  const normalize = (keys: readonly string[], row: unknown[], negate: boolean) => {
    const r = asRecord(keys, row)
    const id = text(r['FEntity_FEntryId'])
    if (!id) return null
    let qty: number | null = null
    const rawQty = Number(r['FRealQty'])
    if (Number.isFinite(rawQty)) qty = negate ? -rawQty : rawQty
    let kuweiName: string | null = null
    for (const key of flexKeys) {
      const name = text(r[key])
      if (name) {
        kuweiName = name
        break
      }
    }
    return {
      id,
      kd_billno: text(r['FBillNo']),
      kd_wlbm: text(r['FMaterialID.FNumber']),
      kd_wumc: text(r['FMaterialName']),
      kd_ggxh: text(r['FMateriaModel'] ?? r['FMaterialModel']),
      kd_cangku_id: text(r['FStockID.FNumber']),
      kd_cangku_name: text(r['FEntrynote'] ?? r['FNote']),
      kd_kuwei_id: text(r['FStockLocID']),
      kd_kuwei_name: kuweiName,
      kd_chuku_number: qty,
      kd_chuku_time: text(r['FApproveDate']),
      status: text(r['FDocumentStatus']),
    }
  }

  const merged: Omit<KucunRow, 'sync_time'>[] = []
  for (const row of outRows) {
    const item = normalize(outKeys, row, false)
    if (item) merged.push(item)
  }
  for (const row of retRows) {
    const item = normalize(retKeys, row, true)
    if (item) merged.push(item)
  }
  // 同一分录在两边都出现时退货行覆盖（与旧逻辑 arrayList1.add 顺序一致：退货在后）
  const deduped = new Map<string, Omit<KucunRow, 'sync_time'>>()
  for (const item of merged) deduped.set(String(item.id), item)
  return [...deduped.values()]
}

function toValues(row: KucunRow): unknown[] {
  return KUCUN_COLUMNS.map((column) => row[column] ?? null)
}

async function countLocal(): Promise<number> {
  const pool = getMysqlPool()
  const [rows] = await pool.query<any[]>(mysqlQueryOptions('SELECT COUNT(*) AS total FROM kucun'), [])
  return Number(rows[0]?.total || 0)
}

export async function getKucunMaxSyncTime(): Promise<string | null> {
  const pool = getMysqlPool()
  const [rows] = await pool.query<any[]>(mysqlQueryOptions('SELECT MAX(sync_time) AS syncTime FROM kucun'), [])
  return parseSyncTime(rows[0]?.syncTime)
}

async function chunked<T>(items: T[], size: number): Promise<T[][]> {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 全量同步：dryRun 只查金蝶计数；apply 清表后全插（事务）。 */
export async function runKucunFullSync(dryRun: boolean) {
  const customer = kucunSyncCustomer()
  const now = formatKucunDateTime(new Date())
  const source = await fetchKucunSourceRows(null)
  if (dryRun) {
    const local = await countLocal()
    return {
      ok: true,
      dryRun: true,
      summary: `dry-run：金蝶 ${source.length} 行（出库+退货，客户${customer}），本地 ${local} 行，未写库`,
      count: source.length,
    }
  }
  const rows: KucunRow[] = source.map((item) => ({ ...item, sync_time: now }))
  const pool = getMysqlPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query(mysqlQueryOptions('DELETE FROM kucun'), [])
    for (const part of await chunked(rows, WRITE_CHUNK)) {
      if (!part.length) break
      await connection.query(
        mysqlQueryOptions(`INSERT INTO kucun (${KUCUN_COLUMNS.join(', ')}) VALUES ?`),
        [part.map(toValues)],
      )
    }
    await connection.commit()
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      /* ignore */
    }
    throw error
  } finally {
    connection.release()
  }
  return {
    ok: true,
    dryRun: false,
    summary: `全量同步完成：写入 ${rows.length} 行，sync_time=${now}`,
    count: rows.length,
  }
}

/** 差异同步：dryRun 只查变更计数；apply 按分录 id 幂等 upsert。 */
export async function runKucunDiffSync(dryRun: boolean) {
  const since = (await getKucunMaxSyncTime()) || '2025-06-01 00:00:00'
  const now = formatKucunDateTime(new Date())
  const source = await fetchKucunSourceRows(since)
  const pool = getMysqlPool()
  if (dryRun) {
    let existed = 0
    for (const part of await chunked(source, WRITE_CHUNK)) {
      if (!part.length) break
      const ids = part.map((item) => String(item.id))
      const [rows] = await pool.query<any[]>(
        mysqlQueryOptions(`SELECT id FROM kucun WHERE id IN (${ids.map(() => '?').join(',')})`),
        ids,
      )
      existed += rows.length
    }
    return {
      ok: true,
      dryRun: true,
      summary: `dry-run：自 ${since} 起金蝶变更 ${source.length} 行（新增约 ${source.length - existed}，已存在 ${existed}），未写库`,
      count: source.length,
    }
  }
  const rows: KucunRow[] = source.map((item) => ({ ...item, sync_time: now }))
  const updateClause = KUCUN_COLUMNS.filter((column) => column !== 'id')
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ')
  for (const part of await chunked(rows, WRITE_CHUNK)) {
    if (!part.length) break
    await pool.query(
      mysqlQueryOptions(`INSERT INTO kucun (${KUCUN_COLUMNS.join(', ')}) VALUES ? ON DUPLICATE KEY UPDATE ${updateClause}`),
      [part.map(toValues)],
    )
  }
  return {
    ok: true,
    dryRun: false,
    summary: `差异同步完成：自 ${since} 起 upsert ${rows.length} 行，sync_time=${now}`,
    count: rows.length,
  }
}
