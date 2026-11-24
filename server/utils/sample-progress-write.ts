import { getHeader, getRouterParam, readMultipartFormData, type H3Event } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import * as XLSX from 'xlsx/xlsx.mjs'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
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

const statusSet = new Set(['registered', 'purchasing', 'waiting_sample', 'received', 'testing', 'shipped', 'converted', 'closed', 'abnormal'])

const fields = [
  ['customer_received', 'customerReceived', 16],
  ['salesperson', 'salesperson', 100],
  ['country', 'country', 100],
  ['city', 'city', 100],
  ['customer_name', 'customerName', 255],
  ['customer_type', 'customerType', 100],
  ['product_application', 'productApplication', 255],
  ['brand_requirement', 'brandRequirement', 100],
  ['grade_requirement', 'gradeRequirement', 100],
  ['part_no', 'partNo', 255],
  ['package_name', 'packageName', 100],
  ['quantity', 'quantity', 100],
  ['unit', 'unit', 32],
  ['datasheet', 'datasheet', 500],
  ['sample_order_date', 'sampleOrderDate', 10],
  ['sample_required_date', 'sampleRequiredDate', 10],
  ['buyer', 'buyer', 100],
  ['supplier_code', 'supplierCode', 100],
  ['chip_size', 'chipSize', 100],
  ['wafer_factory_code', 'waferFactoryCode', 100],
  ['sample_due_date', 'sampleDueDate', 10],
  ['merchandiser', 'merchandiser', 100],
  ['actual_arrival_qty', 'actualArrivalQty', 100],
  ['delivery_status', 'deliveryStatus', 100],
  ['actual_delivery_date', 'actualDeliveryDate', 10],
  ['test_qty', 'testQty', 100],
  ['retained_qty', 'retainedQty', 100],
  ['shipping_status', 'shippingStatus', 100],
  ['test_owner', 'testOwner', 100],
  ['test_result', 'testResult', 255],
  ['order_status', 'orderStatus', 100],
] as const

const insertColumns = fields.map(([column]) => column).join(', ')
const insertValues = fields.map(() => '?').join(', ')
const updateColumns = fields.map(([column]) => `${column} = VALUES(${column})`).join(',\n      ')

const keyToColumn = new Map<string, string>(fields.map(([column, key]) => [key as string, column as string]))

const statusLabelToCode: Record<string, string> = {
  已登记: 'registered',
  采购中: 'purchasing',
  待到样: 'waiting_sample',
  已到样: 'received',
  测试中: 'testing',
  已寄出: 'shipped',
  已转订单: 'converted',
  已关闭: 'closed',
  异常: 'abnormal',
}

export function normalizeImportStatus(value: unknown): string | null {
  const valueText = text(value).replace(/\s+/g, '')
  if (!valueText) return null
  if (statusSet.has(valueText)) return valueText
  return statusLabelToCode[valueText] || null
}

function nullableText(value: unknown, maxLength: number): string | null {
  const valueText = text(value)
  if (!valueText) return null
  return valueText.slice(0, maxLength)
}

function dateText(value: unknown): string | null {
  const valueText = text(value)
  if (!valueText) return null
  const matched = valueText.match(/^(\d{4}-\d{1,2}-\d{1,2})/)
  if (!matched) writeFail('日期格式必须为 YYYY-MM-DD')
  const date = matched[1].split('-').map(Number)
  const normalized = `${date[0]}-${String(date[1]).padStart(2, '0')}-${String(date[2]).padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) writeFail('日期格式不正确')
  return normalized
}

function displayName(session: AuthSession): string {
  return text(session.user.nickName) || session.userName
}

function requestId(event: H3Event, body: Record<string, unknown> = {}): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function payloadValues(body: Record<string, unknown>): unknown[] {
  return fields.map(([column, key, maxLength]) => column.endsWith('_date')
    ? dateText(body[key])
    : nullableText(body[key], maxLength))
}

function inferStatusOf(pick: (key: string) => unknown): string {
  // 订单情况只有 YES 才算转化；NO 是明确未转化，不能推进状态。
  if (String(pick('orderStatus') ?? '').trim().toUpperCase() === 'YES') return 'converted'
  // 已寄出晚于测试：两边都有值时以寄出为准。
  if (text(pick('shippingStatus'))) return 'shipped'
  if (text(pick('testResult')) || text(pick('testOwner')) || text(pick('testQty'))) return 'testing'
  if (text(pick('actualDeliveryDate')) || text(pick('actualArrivalQty')) || text(pick('deliveryStatus'))) return 'received'
  if (text(pick('buyer')) || text(pick('supplierCode')) || text(pick('sampleDueDate'))) return 'purchasing'
  return 'registered'
}

function inferStatus(item: Record<string, unknown>): string {
  return inferStatusOf((key) => item[key])
}

// 新增：没填或保持默认 registered 时按业务字段推导；显式指定其他状态则尊重人工判断。
function resolveCreateStatus(body: Record<string, unknown>): string {
  const raw = text(body.progressStatus)
  if (!raw || raw === 'registered') return inferStatus(body)
  if (!statusSet.has(raw)) writeFail('流程状态不符合规范')
  return raw
}

// 更新：请求体里没带 progressStatus（前端只发差异字段）时按“库里现状 + 本次改动”推导；
// 带了有效状态则尊重人工选择（含手动回退到 registered、标异常/关闭）。
function inferUpdateStatus(body: Record<string, unknown>, current: Record<string, unknown>): string {
  if (!Object.prototype.hasOwnProperty.call(body, 'progressStatus') || !text(body.progressStatus)) {
    return inferStatusOf((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) return body[key]
      const column = keyToColumn.get(key)
      return column ? current?.[column] : undefined
    })
  }
  const raw = text(body.progressStatus)
  if (!statusSet.has(raw)) writeFail('流程状态不符合规范')
  return raw
}

async function createRow(event: H3Event, session: AuthSession, connection: PoolConnection, body: Record<string, unknown>, requestKey: string) {
  if (!text(body.partNo)) writeFail('CTK part NO 不能为空')
  if (!text(body.quantity)) writeFail('数量不能为空')
  const values = payloadValues(body)
  const status = resolveCreateStatus(body)
  const result: any = await connection.query(mysqlQueryOptions(`
    INSERT INTO tk_sample_progress
      (${insertColumns}, progress_status, remark, created_by_id, created_by_name, updated_by_id, updated_by_name)
    VALUES (${insertValues}, ?, ?, ?, ?, ?, ?)
  `), [...values, status, nullableText(body.remark, 1000), session.userId, displayName(session), session.userId, displayName(session)])
  await insertOperationLog(event, connection, session, '客户样品进度', 1, { id: result[0]?.insertId, requestId: requestKey })
  return apiSuccess({ id: result[0]?.insertId, status }, '样品进度已新增')
}

async function updateRow(event: H3Event, session: AuthSession, connection: PoolConnection, body: Record<string, unknown>, requestKey: string) {
  const id = text(body.id)
  if (!/^\d+$/.test(id) || Number(id) <= 0) writeFail('样品进度ID不符合规范')
  const [currentRows]: any = await connection.query(mysqlQueryOptions(
    'SELECT * FROM tk_sample_progress WHERE id = ? LIMIT 1',
  ), [Number(id)])
  const current = currentRows?.[0]
  if (!current) writeFail('样品进度记录不存在')
  // 只更新请求体里明确携带的字段：并发两人改不同格时互不覆盖。
  const sets: string[] = []
  const values: unknown[] = []
  for (const [column, key, maxLength] of fields) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue
    sets.push(`${column} = ?`)
    values.push(column.endsWith('_date') ? dateText(body[key]) : nullableText(body[key], maxLength))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'remark')) {
    sets.push('remark = ?')
    values.push(nullableText(body.remark, 1000))
  }
  const status = inferUpdateStatus(body, current)
  sets.push('progress_status = ?')
  values.push(status)
  const result: any = await connection.query(mysqlQueryOptions(`
    UPDATE tk_sample_progress
    SET ${sets.join(',\n        ')},
        updated_by_id = ?, updated_by_name = ?, updated_at = NOW()
    WHERE id = ?
  `), [...values, session.userId, displayName(session), Number(id)])
  if (!affectedRows(result[0])) writeFail('样品进度记录不存在')
  await insertOperationLog(event, connection, session, '客户样品进度', 2, { id: Number(id), requestId: requestKey })
  return apiSuccess({ status }, '样品进度已更新')
}

export async function addSampleProgress(event: H3Event) {
  const body = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SampleProgressAdd', 'tk_custom:sampleProgress:add', requestId(event, body), body,
    (session, connection, claim) => createRow(event, session, connection, body, claim.requestId), '新增客户样品进度失败')
}

export async function updateSampleProgress(event: H3Event) {
  const body = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SampleProgressEdit', 'tk_custom:sampleProgress:edit', requestId(event, body), body,
    (session, connection, claim) => updateRow(event, session, connection, body, claim.requestId), '更新客户样品进度失败')
}

export async function deleteSampleProgress(event: H3Event) {
  const raw = getRouterParam(event, 'ids') || (event.context.params as any)?.ids || event.path?.split('/').pop()?.split('?')[0] || ''
  const ids = idList(raw, '样品进度ID')
  const body = { ids }
  return withIdempotentWriteSession(event, 'SampleProgressDelete', 'tk_custom:sampleProgress:remove', requestId(event, body), body,
    async (session, connection, claim) => {
      const placeholders = ids.map(() => '?').join(', ')
      const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_sample_progress WHERE id IN (${placeholders})`), ids)
      const count = affectedRows(result[0])
      if (!count) writeFail('样品进度记录不存在')
      await insertOperationLog(event, connection, session, '客户样品进度', 3, { ids, requestId: claim.requestId })
      return apiSuccess(undefined, `已删除 ${count} 条样品进度记录`)
    }, '删除客户样品进度失败')
}

const headerToKey: Record<string, string> = {
  客户是否收样: 'customerReceived',
  业务员: 'salesperson',
  国家: 'country',
  城市: 'city',
  客户名称: 'customerName',
  客户类型: 'customerType',
  产品应用: 'productApplication',
  品牌要求: 'brandRequirement',
  等级需求: 'gradeRequirement',
  CTKpartNO: 'partNo',
  封装: 'packageName',
  数量: 'quantity',
  单位: 'unit',
  规格书: 'datasheet',
  样品下单日期: 'sampleOrderDate',
  样品需求日: 'sampleRequiredDate',
  采购员: 'buyer',
  '供应商代码(001)': 'supplierCode',
  芯片尺寸: 'chipSize',
  晶圆厂代码: 'waferFactoryCode',
  样品交期: 'sampleDueDate',
  跟单员: 'merchandiser',
  实际到样数量: 'actualArrivalQty',
  样品交付情况: 'deliveryStatus',
  实际交期: 'actualDeliveryDate',
  测样数量: 'testQty',
  留样数量: 'retainedQty',
  发走情况: 'shippingStatus',
  检测负责人: 'testOwner',
  '检测结果（与规格书比较）': 'testResult',
  '订单情况': 'orderStatus',
  '备注': 'remark',
  '流程状态': 'progressStatus',
}

function normalizedHeader(value: unknown): string {
  return text(value).replace(/\s+/g, '')
}

function cellText(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  return String(value).trim()
}

function excelDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
  }
  const valueText = String(value).trim()
  const match = valueText.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (!match) return null
  const normalized = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized
}

function parseImportRows(file: { filename?: string; data: Uint8Array }) {
  const workbook = XLSX.read(Buffer.from(file.data), { type: 'buffer', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) writeFail('Excel 中没有可读取的工作表')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizedHeader(cell) === 'CTKpartNO'))
  if (headerRowIndex < 0) writeFail('未找到 CTK part NO 表头，请使用客户样品进度表模板')
  const headers = rows[headerRowIndex].map(normalizedHeader)
  const headerLabels = rows[headerRowIndex].map((cell) => String(cell ?? '').trim())
  const fileName = text(file.filename) || 'sample-progress.xlsx'
  const dateKeys = new Set(['sampleOrderDate', 'sampleRequiredDate', 'sampleDueDate', 'actualDeliveryDate'])
  const result: Array<{ item: Record<string, unknown>; sourceRow: number; sourceKey: string }> = []
  const warnings: string[] = []
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    const sourceRow = index + 1
    const item: Record<string, unknown> = {}
    headers.forEach((header, columnIndex) => {
      const key = headerToKey[header]
      if (!key) return
      const rawCell = row[columnIndex]
      if (dateKeys.has(key)) {
        if (rawCell == null || String(rawCell).trim() === '') {
          item[key] = null
        } else {
          const parsed = excelDate(rawCell)
          if (!parsed) warnings.push(`第${sourceRow}行「${headerLabels[columnIndex] || key}」日期格式无效，已置空`)
          item[key] = parsed
        }
        return
      }
      if (key === 'progressStatus') {
        item[key] = normalizeImportStatus(rawCell)
        return
      }
      item[key] = cellText(rawCell)
    })
    const hasBusinessData = ['customerName', 'partNo', 'quantity', 'salesperson', 'sampleOrderDate'].some((key) => text(item[key]))
    if (!hasBusinessData) continue
    result.push({ item, sourceRow, sourceKey: `${fileName.slice(0, 170)}:${sourceRow}` })
  }
  return { fileName, result, warnings }
}

export async function importSampleProgress(event: H3Event) {
  const files = await readMultipartFormData(event)
  const file = files?.find((part) => part.name === 'file' && part.data?.length)
  if (!file?.data) writeFail('请选择客户样品进度 Excel 文件')
  if (file.data.length > 20 * 1024 * 1024) writeFail('Excel 文件不能超过 20MB')
  const parsed = parseImportRows({ filename: file.filename, data: file.data })
  if (!parsed.result.length) writeFail('Excel 中没有可导入的样品明细')

  return withWriteSession(event, 'SampleProgressImport', 'tk_custom:sampleProgress:import', async (session, connection) => {
    let processed = 0
    for (const row of parsed.result) {
      const item = row.item
      const values = fields.map(([column, key, maxLength]) => column.endsWith('_date')
        ? excelDate(item[key])
        : nullableText(item[key], maxLength))
      // 导入表自带“流程状态”列时尊重表里的值（支持中文标签或英文编码），否则按业务字段推导。
      const status = (item.progressStatus as string) || inferStatus(item)
      if (!statusSet.has(status)) writeFail(`第${row.sourceRow}行流程状态不符合规范`)
      await connection.query(mysqlQueryOptions(`
        INSERT INTO tk_sample_progress
          (${insertColumns}, progress_status, remark, source_file, source_row, source_key, created_by_id, created_by_name, updated_by_id, updated_by_name)
        VALUES (${insertValues}, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          ${updateColumns}, progress_status = VALUES(progress_status), remark = VALUES(remark), source_file = VALUES(source_file), source_row = VALUES(source_row),
          updated_by_id = VALUES(updated_by_id), updated_by_name = VALUES(updated_by_name), updated_at = NOW()
      `), [...values, status, nullableText(item.remark, 1000), parsed.fileName.slice(0, 255), row.sourceRow, row.sourceKey.slice(0, 200), session.userId, displayName(session), session.userId, displayName(session)])
      processed += 1
    }
    await insertOperationLog(event, connection, session, '客户样品进度', 1, { sourceFile: parsed.fileName, rows: processed })
    const warningText = parsed.warnings.length ? `；${parsed.warnings.length} 处日期格式无效已置空：${parsed.warnings.slice(0, 5).join('，')}${parsed.warnings.length > 5 ? '…' : ''}` : ''
    return apiSuccess({ rows: processed, sourceFile: parsed.fileName, warnings: parsed.warnings }, `已导入 ${processed} 条样品进度记录${warningText}`)
  }, '导入客户样品进度失败')
}
