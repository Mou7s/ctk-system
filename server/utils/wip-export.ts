import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import { loadXlsx } from './lazy-deps'
import { getAuthSession } from './auth'
import { apiError, errorMessage } from './response'
import { hasWipFilter, queryWipReport, weakWipFilterMessage, WIP_FILTER_REQUIRED_MESSAGE, WipQueryLimitError } from './wip'
import { SqlServerError } from './sqlserver'

type Query = Record<string, unknown>

const headers = [
  '工序号', '当前工序', '物料编码', '物料名称', '规格型号', '封装类型', '在制数量', '生产订单号', '生产订单行号',
  '流程单号', '工序数量', '合格数量', '转入数量', '转出数量', '下一工序已接收', '加工车间', '工艺路线', '最后汇报时间', '汇报状态',
]

const fields = [
  'processNumber', 'processName', 'materialNumber', 'materialName', 'specification', 'packageType', 'wipQty', 'moNumber', 'moEntrySeq',
  'billNo', 'operQty', 'qualifiedQty', 'transInQty', 'transOutQty', 'nextReceivedQty', 'departmentName', 'routeName', 'lastReportTime',
]

async function requestQuery(event: H3Event): Promise<Query> {
  const query: Query = { ...(getQuery(event) as Query) }
  const body = await readBody<Record<string, unknown> | string>(event).catch(() => null)
  if (typeof body === 'string' && body) {
    for (const [key, value] of new URLSearchParams(body).entries()) query[key] = value
  } else if (body && typeof body === 'object') {
    Object.assign(query, body)
  }
  return query
}

// 与页面同一套状态文案：判断依据是本工序的「汇报数量」，不是上道转入
const WIP_STATUS_LABELS: Record<string, string> = {
  reported: '已汇报',
  produced: '未汇报（有产出无汇报单）',
  received: '未汇报（上道已转入）',
  unreported: '未汇报',
}

function wipStatusLabel(detail: Record<string, unknown>): string {
  const status = String(detail.wipStatus ?? '')
  if (status) return WIP_STATUS_LABELS[status] ?? status
  return detail.unreported ? WIP_STATUS_LABELS.unreported : WIP_STATUS_LABELS.reported
}

async function sendExcel(event: H3Event, details: Array<Record<string, unknown>>) {
  const XLSX = await loadXlsx()
  const rows = details.map((detail) => [
    ...fields.map((field) => detail[field] ?? ''),
    wipStatusLabel(detail),
  ])
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '车间半成品在制明细')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('车间半成品在制明细.xlsx')}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

export async function exportWip(event: H3Event) {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  try {
    const query = await requestQuery(event)
    if (!hasWipFilter(query)) return apiError(WIP_FILTER_REQUIRED_MESSAGE, 400)
    const weakMessage = weakWipFilterMessage(query)
    if (weakMessage) return apiError(weakMessage, 400)
    // 导出始终全量：忽略列表分页参数，避免导出与分页相互影响
    delete query.page
    delete query.pageSize

    const report = await queryWipReport(query, { fullExport: true })
    return sendExcel(event, (report.details || []) as Array<Record<string, unknown>>)
  } catch (error) {
    if (error instanceof WipQueryLimitError) return apiError(error.message, 429)
    if (error instanceof SqlServerError) {
      console.error(`[NitroSqlServer:wip/export:${error.kind}]`, errorMessage(error, 'unknown error'))
      return apiError(error.message, error.statusCode)
    }
    console.error('[NitroSqlServer:wip/export]', errorMessage(error, 'unknown error'))
    return apiError(error instanceof Error ? error.message : '导出工序计划在制数据失败', 502)
  }
}
