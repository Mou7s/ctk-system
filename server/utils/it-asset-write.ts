import { getRouterParam, readMultipartFormData, type H3Event } from 'h3'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess, errorMessage } from './response'
import { formatItAssetNoFromSeq, normalizeItAssetDept } from './it-asset-read'
import { parseItAssetImportBuffer, type ItAssetImportParseError } from './it-asset-excel'
import {
  affectedRows,
  bodyOf,
  idList,
  insertOperationLog,
  text,
  withIdempotentWriteSession,
  withWriteSession,
  writeFail,
} from './write'

const DEVICE_TYPE_SET = new Set([
  'desktop',
  'laptop',
  'all_in_one',
  'workstation',
  'monitor',
  'server',
  'other',
])

const STATUS_SET = new Set(['in_use', 'idle', 'repair', 'scrapped'])
const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function displayName(session: AuthSession): string {
  return text(session.user.nickName) || session.userName
}

function nullableLimitedText(value: unknown, max: number): string | null {
  const t = text(value)
  if (!t) return null
  return t.slice(0, max)
}

function dateText(value: unknown, label = '日期'): string | null {
  const t = text(value)
  if (!t) return null
  const match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s.*)?$/)
  if (!match) writeFail(`${label}格式必须为 YYYY-MM-DD`, 400)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    writeFail(`${label}不是有效日期`, 400)
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function requestId(event: H3Event, body: Record<string, unknown> = {}): string {
  const headerKey = (event as any).headers ? String((event as any).headers['idempotency-key'] || '') : ''
  return headerKey || text(body.requestId) || crypto.randomUUID()
}

function normalizeDeviceType(value: unknown): string {
  const v = text(value) || 'desktop'
  if (!DEVICE_TYPE_SET.has(v)) writeFail('设备类型不合法', 400)
  return v
}

function normalizeStatus(value: unknown): string {
  const v = text(value) || 'in_use'
  if (!STATUS_SET.has(v)) writeFail('资产状态不合法', 400)
  return v
}

async function generateNextAssetNo(connection: PoolConnection): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>(
    mysqlQueryOptions(
      `SELECT asset_no FROM tk_it_asset
       WHERE asset_no REGEXP '^TK-PC-[0-9]+$'
       ORDER BY CAST(SUBSTRING(asset_no, 7) AS UNSIGNED) DESC
       LIMIT 1 FOR UPDATE`,
    ),
  )
  const lastNo = String(rows[0]?.asset_no || '')
  const matched = lastNo.match(/^TK-PC-(\d+)$/)
  let seq = matched ? Number(matched[1]) + 1 : 1
  while (seq < 999999) {
    const candidate = formatItAssetNoFromSeq(seq)
    const [conflict] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE asset_no = ? LIMIT 1`),
      [candidate],
    )
    if (!conflict[0]) return candidate
    seq += 1
  }
  writeFail('自动生成资产编号失败', 500)
}

async function resolveWxUserMatch(
  connection: PoolConnection,
  userUseridRaw: unknown,
  userNameRaw: unknown,
  useDeptRaw: unknown,
) {
  let userUserid = nullableLimitedText(userUseridRaw, 64)
  let userName = nullableLimitedText(userNameRaw, 64)
  let useDept = nullableLimitedText(useDeptRaw, 100)

  if (userUserid) {
    const [rows] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT userid, name, dept FROM wxuser WHERE userid = ? LIMIT 1`),
      [userUserid],
    )
    if (rows[0]) {
      if (!userName) userName = nullableLimitedText(rows[0].name, 64)
      if (!useDept) useDept = nullableLimitedText(rows[0].dept, 100)
    }
  } else if (userName) {
    const [rows] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT userid, name, dept FROM wxuser WHERE status = 'active' AND name = ? LIMIT 2`),
      [userName],
    )
    if (rows.length === 1) {
      userUserid = nullableLimitedText(rows[0].userid, 64)
      if (!useDept) useDept = nullableLimitedText(rows[0].dept, 100)
    }
  }

  useDept = nullableLimitedText(normalizeItAssetDept(useDept), 100)

  return { userUserid, userName, useDept }
}

export async function addItAsset(event: H3Event) {
  const body = await bodyOf(event)
  return withIdempotentWriteSession(
    event,
    'ItAssetAdd',
    'tk_custom:itAsset:add',
    requestId(event, body),
    body,
    async (session, connection, claim) => {
      const assetName = nullableLimitedText(body.assetName, 120)
      if (!assetName) writeFail('资产名称不能为空', 400)

      let assetNo = nullableLimitedText(body.assetNo, 64)
      if (assetNo) {
        const [dup] = await connection.query<RowDataPacket[]>(
          mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE asset_no = ? LIMIT 1`),
          [assetNo],
        )
        if (dup[0]) writeFail(`资产编号 ${assetNo} 已存在`, 400)
      } else {
        assetNo = await generateNextAssetNo(connection)
      }

      const deviceType = normalizeDeviceType(body.deviceType)
      const status = normalizeStatus(body.status)
      const purchaseDate = dateText(body.purchaseDate, '购置日期')
      const warrantyDate = dateText(body.warrantyDate, '保修到期日')
      const wxMatch = await resolveWxUserMatch(connection, body.userUserid, body.userName, body.useDept)
      const operator = displayName(session)

      const [result]: any = await connection.query(
        mysqlQueryOptions(`
          INSERT INTO tk_it_asset (
            asset_no, asset_name, device_type, brand, model, serial_no,
            use_dept, user_userid, user_name, location, purchase_date, status,
            cpu_spec, memory_spec, disk_spec, os_version, ip_address, mac_address,
            warranty_date, remark, created_by_id, created_by_name, updated_by_id, updated_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),
        [
          assetNo,
          assetName,
          deviceType,
          nullableLimitedText(body.brand, 64),
          nullableLimitedText(body.model, 120),
          nullableLimitedText(body.serialNo, 100),
          wxMatch.useDept,
          wxMatch.userUserid,
          wxMatch.userName,
          nullableLimitedText(body.location, 120),
          purchaseDate,
          status,
          nullableLimitedText(body.cpuSpec, 100),
          nullableLimitedText(body.memorySpec, 64),
          nullableLimitedText(body.diskSpec, 64),
          nullableLimitedText(body.osVersion, 80),
          nullableLimitedText(body.ipAddress, 64),
          nullableLimitedText(body.macAddress, 64),
          warrantyDate,
          nullableLimitedText(body.remark, 500),
          session.userId,
          operator,
          session.userId,
          operator,
        ],
      )

      const insertId = Number(result?.insertId || 0)
      await insertOperationLog(event, connection, session, 'IT资产管理', 1, {
        id: insertId,
        assetNo,
        assetName,
        requestId: claim.requestId,
      })
      return apiSuccess({ id: insertId, assetNo }, '新增IT资产成功')
    },
    '新增IT资产失败',
  )
}

export async function updateItAsset(event: H3Event) {
  const body = await bodyOf(event)
  return withIdempotentWriteSession(
    event,
    'ItAssetEdit',
    'tk_custom:itAsset:edit',
    requestId(event, body),
    body,
    async (session, connection, claim) => {
      const id = Number(text(body.id))
      if (!Number.isSafeInteger(id) || id <= 0) writeFail('资产ID不合法', 400)

      const [existingRows] = await connection.query<RowDataPacket[]>(
        mysqlQueryOptions(`SELECT id, asset_no FROM tk_it_asset WHERE id = ? LIMIT 1`),
        [id],
      )
      if (!existingRows[0]) writeFail('记录不存在或已被删除', 404)

      const assetName = nullableLimitedText(body.assetName, 120)
      if (!assetName) writeFail('资产名称不能为空', 400)

      const assetNo = nullableLimitedText(body.assetNo, 64)
      if (!assetNo) writeFail('资产编号不能为空', 400)

      if (assetNo !== String(existingRows[0].asset_no)) {
        const [dup] = await connection.query<RowDataPacket[]>(
          mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE asset_no = ? AND id <> ? LIMIT 1`),
          [assetNo, id],
        )
        if (dup[0]) writeFail(`资产编号 ${assetNo} 已存在`, 400)
      }

      const deviceType = normalizeDeviceType(body.deviceType)
      const status = normalizeStatus(body.status)
      const purchaseDate = dateText(body.purchaseDate, '购置日期')
      const warrantyDate = dateText(body.warrantyDate, '保修到期日')
      const wxMatch = await resolveWxUserMatch(connection, body.userUserid, body.userName, body.useDept)
      const operator = displayName(session)

      const [result] = await connection.query(
        mysqlQueryOptions(`
          UPDATE tk_it_asset SET
            asset_no = ?,
            asset_name = ?,
            device_type = ?,
            brand = ?,
            model = ?,
            serial_no = ?,
            use_dept = ?,
            user_userid = ?,
            user_name = ?,
            location = ?,
            purchase_date = ?,
            status = ?,
            cpu_spec = ?,
            memory_spec = ?,
            disk_spec = ?,
            os_version = ?,
            ip_address = ?,
            mac_address = ?,
            warranty_date = ?,
            remark = ?,
            updated_by_id = ?,
            updated_by_name = ?
          WHERE id = ?
        `),
        [
          assetNo,
          assetName,
          deviceType,
          nullableLimitedText(body.brand, 64),
          nullableLimitedText(body.model, 120),
          nullableLimitedText(body.serialNo, 100),
          wxMatch.useDept,
          wxMatch.userUserid,
          wxMatch.userName,
          nullableLimitedText(body.location, 120),
          purchaseDate,
          status,
          nullableLimitedText(body.cpuSpec, 100),
          nullableLimitedText(body.memorySpec, 64),
          nullableLimitedText(body.diskSpec, 64),
          nullableLimitedText(body.osVersion, 80),
          nullableLimitedText(body.ipAddress, 64),
          nullableLimitedText(body.macAddress, 64),
          warrantyDate,
          nullableLimitedText(body.remark, 500),
          session.userId,
          operator,
          id,
        ],
      )

      if (affectedRows(result) === 0) writeFail('更新IT资产失败', 500)
      await insertOperationLog(event, connection, session, 'IT资产管理', 2, {
        id,
        assetNo,
        assetName,
        requestId: claim.requestId,
      })
      return apiSuccess({ id, assetNo }, '更新IT资产成功')
    },
    '更新IT资产失败',
  )
}

export async function deleteItAssets(event: H3Event) {
  return withWriteSession(
    event,
    'ItAssetDelete',
    'tk_custom:itAsset:remove',
    async (session, connection) => {
      const ids = idList(getRouterParam(event, 'ids'), '资产ID')
      const placeholders = ids.map(() => '?').join(', ')
      const [rows] = await connection.query<RowDataPacket[]>(
        mysqlQueryOptions(`SELECT id, asset_no FROM tk_it_asset WHERE id IN (${placeholders})`),
        ids,
      )
      if (!rows.length) writeFail('未找到要删除的资产记录', 404)

      const [result] = await connection.query(
        mysqlQueryOptions(`DELETE FROM tk_it_asset WHERE id IN (${placeholders})`),
        ids,
      )
      const count = affectedRows(result)
      await insertOperationLog(event, connection, session, 'IT资产管理', 3, {
        ids,
        deletedCount: count,
      })
      return apiSuccess({ deletedCount: count }, `已删除 ${count} 条资产记录`)
    },
    '删除IT资产失败',
  )
}

export async function markItAssetsPrinted(event: H3Event) {
  const body = await bodyOf(event)
  return withWriteSession(
    event,
    'ItAssetPrintLog',
    null,
    async (session, connection) => {
      if (!hasPermission(session, 'tk_custom:itAsset:print') && !hasPermission(session, 'tk_custom:itAsset:list')) {
        writeFail('没有权限访问该接口', 403)
      }
      const ids = idList(body.ids, '资产ID')
      const placeholders = ids.map(() => '?').join(', ')
      const [result] = await connection.query(
        mysqlQueryOptions(`
          UPDATE tk_it_asset
          SET print_count = print_count + 1,
              last_printed_at = NOW()
          WHERE id IN (${placeholders})
        `),
        ids,
      )
      const updatedCount = affectedRows(result)
      await insertOperationLog(event, connection, session, 'IT资产标签打印', 0, {
        ids,
        updatedCount,
      })
      return apiSuccess({ updatedCount }, '已记录打印次数')
    },
    '记录打印次数失败',
  )
}

export async function importItAssets(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, 'tk_custom:itAsset:import')) {
    return apiError('没有权限访问该接口', 403)
  }

  let fileData: Buffer
  let mode: 'skip' | 'update' = 'skip'
  try {
    const parts = await readMultipartFormData(event)
    if (!parts || parts.length === 0) return apiError('请先选择要导入的 Excel 文件', 400)
    const filePart = parts.find((p) => p.name === 'file' && p.data?.length)
    if (!filePart) return apiError('未接收到上传的 Excel 文件', 400)
    const filename = String(filePart.filename || '').toLowerCase()
    if (filename && !filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return apiError('仅支持 .xlsx 或 .xls 格式的 Excel 文件', 400)
    }
    if (filePart.data.length > MAX_IMPORT_BYTES) {
      return apiError('导入文件不能超过 10MB', 400)
    }
    fileData = Buffer.from(filePart.data)
    const modePart = parts.find((p) => p.name === 'mode')
    const rawMode = modePart ? Buffer.from(modePart.data).toString('utf8').trim() : 'skip'
    mode = rawMode === 'update' ? 'update' : 'skip'
  } catch (error) {
    return apiError(errorMessage(error, '读取上传文件失败'), 400)
  }

  let parsed: ReturnType<typeof parseItAssetImportBuffer>
  try {
    parsed = parseItAssetImportBuffer(fileData)
  } catch (error) {
    return apiError(errorMessage(error, '解析 Excel 文件失败'), 400)
  }

  if (parsed.rows.length === 0 && parsed.errors.length === 0) {
    return apiError('Excel 文件中没有可导入的数据行', 400)
  }

  let connection: PoolConnection | undefined
  try {
    connection = await getMysqlPool().getConnection()
    await connection.beginTransaction()

    const [wxRows] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT userid, name, dept FROM wxuser WHERE status = 'active'`),
    )
    const wxByName = new Map<string, Array<{ userid: string; dept: string }>>()
    for (const r of wxRows) {
      const nameKey = String(r.name || '').trim()
      if (!nameKey) continue
      const arr = wxByName.get(nameKey) || []
      arr.push({ userid: String(r.userid || ''), dept: String(r.dept || '') })
      wxByName.set(nameKey, arr)
    }

    const [existingNoRows] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT id, asset_no FROM tk_it_asset FOR UPDATE`),
    )
    const existingByNo = new Map<string, number>()
    let maxSeq = 0
    for (const r of existingNoRows) {
      const no = String(r.asset_no || '')
      existingByNo.set(no, Number(r.id))
      const m = no.match(/^TK-PC-(\d+)$/)
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]))
    }

    const allocateSeqNo = () => {
      do {
        maxSeq += 1
      } while (existingByNo.has(formatItAssetNoFromSeq(maxSeq)))
      return formatItAssetNoFromSeq(maxSeq)
    }

    let insertedCount = 0
    let updatedCount = 0
    let skippedCount = 0
    const errors: ItAssetImportParseError[] = [...parsed.errors]
    const operator = displayName(authenticated.session)

    for (const row of parsed.rows) {
      const wxMatches = row.userName ? wxByName.get(row.userName) : undefined
      const uniqueWx = wxMatches && wxMatches.length === 1 ? wxMatches[0] : null
      const resolvedUserid = uniqueWx ? uniqueWx.userid.slice(0, 64) : null
      const resolvedDept = normalizeItAssetDept(row.useDept || uniqueWx?.dept || '').slice(0, 100)

      if (row.assetNo && existingByNo.has(row.assetNo)) {
        const targetId = existingByNo.get(row.assetNo)!
        if (mode === 'skip') {
          skippedCount += 1
          continue
        }
        await connection.query(
          mysqlQueryOptions(`
            UPDATE tk_it_asset SET
              asset_name = ?,
              device_type = ?,
              brand = COALESCE(?, brand),
              model = COALESCE(?, model),
              serial_no = COALESCE(?, serial_no),
              use_dept = COALESCE(?, use_dept),
              user_userid = COALESCE(?, user_userid),
              user_name = COALESCE(?, user_name),
              location = COALESCE(?, location),
              purchase_date = COALESCE(?, purchase_date),
              status = ?,
              cpu_spec = COALESCE(?, cpu_spec),
              memory_spec = COALESCE(?, memory_spec),
              disk_spec = COALESCE(?, disk_spec),
              os_version = COALESCE(?, os_version),
              ip_address = COALESCE(?, ip_address),
              mac_address = COALESCE(?, mac_address),
              warranty_date = COALESCE(?, warranty_date),
              remark = COALESCE(?, remark),
              updated_by_id = ?,
              updated_by_name = ?
            WHERE id = ?
          `),
          [
            row.assetName,
            row.deviceType,
            row.brand || null,
            row.model || null,
            row.serialNo || null,
            resolvedDept || null,
            resolvedUserid,
            row.userName || null,
            row.location || null,
            row.purchaseDate,
            row.status,
            row.cpuSpec || null,
            row.memorySpec || null,
            row.diskSpec || null,
            row.osVersion || null,
            row.ipAddress || null,
            row.macAddress || null,
            row.warrantyDate,
            row.remark || null,
            authenticated.session.userId,
            operator,
            targetId,
          ],
        )
        updatedCount += 1
        continue
      }

      const finalNo = row.assetNo || allocateSeqNo()
      const [res]: any = await connection.query(
        mysqlQueryOptions(`
          INSERT INTO tk_it_asset (
            asset_no, asset_name, device_type, brand, model, serial_no,
            use_dept, user_userid, user_name, location, purchase_date, status,
            cpu_spec, memory_spec, disk_spec, os_version, ip_address, mac_address,
            warranty_date, remark, created_by_id, created_by_name, updated_by_id, updated_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `),
        [
          finalNo,
          row.assetName,
          row.deviceType,
          row.brand || null,
          row.model || null,
          row.serialNo || null,
          resolvedDept || null,
          resolvedUserid,
          row.userName || null,
          row.location || null,
          row.purchaseDate,
          row.status,
          row.cpuSpec || null,
          row.memorySpec || null,
          row.diskSpec || null,
          row.osVersion || null,
          row.ipAddress || null,
          row.macAddress || null,
          row.warrantyDate,
          row.remark || null,
          authenticated.session.userId,
          operator,
          authenticated.session.userId,
          operator,
        ],
      )
      existingByNo.set(finalNo, Number(res?.insertId || 0))
      insertedCount += 1
    }

    await insertOperationLog(event, connection, authenticated.session, 'IT资产批量导入', 6, {
      mode,
      insertedCount,
      updatedCount,
      skippedCount,
      failedCount: errors.length,
    })
    await connection.commit()

    return apiSuccess(
      {
        insertedCount,
        updatedCount,
        skippedCount,
        failedCount: errors.length,
        errors: errors.slice(0, 50),
      },
      `导入完成：新增 ${insertedCount} 条，更新 ${updatedCount} 条，跳过 ${skippedCount} 条${errors.length ? `，校验失败 ${errors.length} 条` : ''}`,
    )
  } catch (error) {
    if (connection) {
      try { await connection.rollback() } catch {}
    }
    if (error instanceof Error && 'statusCode' in error) {
      return apiError(error.message, Number((error as any).statusCode) || 500)
    }
    console.error('[ItAssetImport] failed:', errorMessage(error, 'unknown error'))
    return apiError('导入IT资产失败', 500)
  } finally {
    connection?.release()
  }
}
