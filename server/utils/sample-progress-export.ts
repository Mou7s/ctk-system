import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import * as XLSX from 'xlsx/xlsx.mjs'
import { querySampleProgressExportRows } from './sample-progress-read'
import { apiError } from './response'
import { withReadPermissionSession } from './read'

const SAMPLE_PROGRESS_QUERY_PERMISSION = 'tk_custom:sampleProgress:query'

const columns: Array<[string, string]> = [
  ['客户是否收样', 'customerReceived'], ['业务员', 'salesperson'], ['国家', 'country'], ['城市', 'city'],
  ['客户名称', 'customerName'], ['客户类型', 'customerType'], ['产品应用', 'productApplication'],
  ['品牌要求', 'brandRequirement'], ['等级需求', 'gradeRequirement'], ['CTK part NO', 'partNo'],
  ['封装', 'packageName'], ['数量', 'quantity'], ['单位', 'unit'], ['规格书', 'datasheet'],
  ['样品下单日期', 'sampleOrderDate'], ['样品需求日', 'sampleRequiredDate'], ['采购员', 'buyer'],
  ['供应商代码', 'supplierCode'], ['芯片尺寸', 'chipSize'], ['晶圆厂代码', 'waferFactoryCode'],
  ['样品交期', 'sampleDueDate'], ['跟单员', 'merchandiser'], ['实际到样数量', 'actualArrivalQty'],
  ['样品交付情况', 'deliveryStatus'], ['实际交期', 'actualDeliveryDate'], ['测样数量', 'testQty'],
  ['留样数量', 'retainedQty'], ['发走情况', 'shippingStatus'], ['检测负责人', 'testOwner'],
  ['检测结果（与规格书比较）', 'testResult'], ['订单情况', 'orderStatus'], ['流程状态', 'progressStatusLabel'],
  ['备注', 'remark'],
]

export async function exportSampleProgress(event: H3Event) {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
  const query = Object.keys(body || {}).length ? body : getQuery(event)
  return withReadPermissionSession(event, 'SampleProgressExport', SAMPLE_PROGRESS_QUERY_PERMISSION, async (_, pool) => {
    const rows = await querySampleProgressExportRows(pool, query)
    const output = rows.map((row) => Object.fromEntries(columns.map(([label, key]) => [label, row[key] ?? ''])))
    const sheet = XLSX.utils.json_to_sheet(output, { header: columns.map(([label]) => label) })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '客户样品进度')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('客户样品进度.xlsx')}`)
    setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
    return buffer
  }, '导出客户样品进度失败').catch((error) => apiError(error?.message || '导出客户样品进度失败', 500))
}
