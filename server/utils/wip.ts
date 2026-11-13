import { queryK3SqlServer, sqlStringParameter } from './sqlserver'
import { k3PackageNameExpression, k3PackageTypeExpression, K3_PACKAGE_TYPES } from './k3-package-name'

export const MAX_OPERATION_ROWS = 200_000
export const WIP_SCOPE_NOTE = '总在制=各工序「本道已产出-下道已接收」之和（末道为「本道已产出-本道转出」）；一道都没汇报的流程单，整单数量算作停在首道工序（未汇报）；只统计已审核且关联到上游销售订单的生产订单，排除上游销售订单已业务关闭的流程单；按工序筛选时会自动带出整条流程链计算，仅展示命中工序。数据来自金蝶工序计划数据库直连。'
export const WIP_FILTER_REQUIRED_MESSAGE = '请至少填写一个筛选条件后查询'

export class WipQueryLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WipQueryLimitError'
  }
}

export type WipQuery = {
  materialKeyword?: unknown
  moNumber?: unknown
  billNo?: unknown
  processName?: unknown
  packageName?: unknown
  // 封装工艺：玻封 / 塑封（空 = 两条线一起看）。口径与生产质量看板共用，见 k3-package-name.ts
  packageType?: unknown
  // 一个输入框搜全厂：订单 / 流程单 / 物料编码 · 名称 · 规格 / 封装（页面顶部的搜索框）
  keyword?: unknown
  onlyPositive?: unknown
  // 在制恰好为 0 的行（料已经走完、不在这个工序上了）是否从明细里去掉。默认去掉；
  // 传 false 才原样返回，供排查用。
  hideZeroWip?: unknown
  page?: unknown
  pageSize?: unknown
  // 明细抽屉用：一次把这条产线/这道工序的明细全部拉走，不按页截断（矩阵首屏仍按页，只给第 1 页）
  all?: unknown
  // 明细表头点击排序：只认 WIP_SORTABLE_FIELDS 里那三列。排序在明细组装之后做，
  // 所以它不进 SQL、也不会改变合计/矩阵口径，只决定返回的明细行序（翻页/导出同序）
  sortBy?: unknown
  sortDir?: unknown
}

export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 1000
export const WEAK_FILTER_MESSAGE = '筛选条件太宽泛，请至少输入2个字符后再查询'
export const UNKNOWN_PACKAGE_NAME = '未维护封装'

type OperationRow = {
  moNumber: string
  moEntrySeq: string
  billNo: string
  materialNumber: string
  materialName: string
  specification: string
  packageName: string
  packageType: string
  processNumber: string
  processName: string
  routeId: string
  routeName: string
  operQty: number
  reportQty: number
  qualifiedQty: number
  transInQty: number
  transOutQty: number
  departmentName: string
  lastReportTime: string
}

function valueText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '')
}

function trimmed(value: unknown): string {
  return valueText(value).trim()
}

function numberValue(value: unknown): number {
  if (value == null || String(value).trim() === '') return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function positiveOnly(value: unknown): boolean {
  if (value == null || value === '') return true
  return !['false', '0', 'no'].includes(trimmed(value).toLowerCase())
}

// 在制为 0 的行不是「在制」：料已经从这道工序走完了，列进在制清单只会把人淹掉。
// 默认去掉负值以外的 0 行；显式传 hideZeroWip=false 时才返回。
function hideZeroWipRows(value: unknown): boolean {
  if (value == null || value === '') return true
  return !['false', '0', 'no'].includes(trimmed(value).toLowerCase())
}

// 封装工艺只认「玻封 / 塑封」两个值，其它（含空、拼错）一律当作「不筛」
export function normalizePackageType(value: unknown): string {
  const text = trimmed(value)
  return K3_PACKAGE_TYPES.includes(text) ? text : ''
}

// 明细表头可排序的三列：生产订单 / 流程单（金蝶的工序计划号）/ 在制数量。
// 只认这三个值，别的（含空、拼错）一律当作「不排序」，回到默认顺序（工序-物料-订单）。
export const WIP_SORTABLE_FIELDS = ['moNumber', 'billNo', 'wipQty'] as const

export function normalizeWipSort(query: WipQuery = {}): { field: string; desc: boolean } {
  const field = trimmed(query.sortBy)
  if (!(WIP_SORTABLE_FIELDS as readonly string[]).includes(field)) return { field: '', desc: false }
  return { field, desc: trimmed(query.sortDir).toLowerCase() === 'desc' }
}

export function hasWipFilter(query: WipQuery = {}): boolean {
  return Boolean(trimmed(query.moNumber) || trimmed(query.billNo) || trimmed(query.materialKeyword) || trimmed(query.processName) || trimmed(query.packageName) || trimmed(query.keyword))
}

// 所有已填筛选条件都只有1个字符时视为弱条件：LIKE '%x%' 全表扫描，
// 直接拦截比查到 8 万行再 429 更省资源。
export function weakWipFilterMessage(query: WipQuery = {}): string | null {
  if (!hasWipFilter(query)) return null
  const filters = [trimmed(query.moNumber), trimmed(query.billNo), trimmed(query.materialKeyword), trimmed(query.processName), trimmed(query.packageName), trimmed(query.keyword)]
    .filter((value) => value.length > 0)
  if (filters.length > 0 && filters.every((value) => value.length < 2)) return WEAK_FILTER_MESSAGE
  return null
}

function parsePage(value: unknown): number {
  const page = Number.parseInt(valueText(value), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function parsePageSize(value: unknown): number {
  const size = Number.parseInt(valueText(value), 10)
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(size, MAX_PAGE_SIZE)
}

// all=true → 明细整批返回（与导出同一条路：不截断、page/pageSize 不生效）。
// 分页仍是默认行为：不带这个参数的调用（矩阵首屏、翻页）完全不受影响。
function wantsAllDetails(value: unknown): boolean {
  return ['true', '1', 'yes', 'on'].includes(trimmed(value).toLowerCase())
}

function bindLike(request: any, name: string, value: unknown): void {
  sqlStringParameter(request, name, `%${trimmed(value)}%`)
}

// 单据状态与工序行过滤常驻。注意：不再过滤「数量全为 0」的工序行，
// 因为那些行代表该工序还没汇报，按业务口径要作为物料停留点参与在制计算
// （整单一道都没汇报时，首道工序按工序计划数量计入在制）。
// 塑封这批固化类工序不需要回报（业务确认）。K3 里它们的工序控制码是 226304「不用汇报」，
// 全库只有这 7 个工序标过这个码；SQL 已经排掉标了 226304 的行，但每个工序各有几十行
// 老数据挂着 111586「免检+汇报」会漏进来，矩阵里就冒出「银胶固化 / PLASMA / 回流焊」，
// 去掉回流焊后「固化」还会顶上来。所以按 K3 标记动态剔（见 queryRouteProcessOps 的 noReport），
// 下面这三个是用户点名的，取不到路线骨架时也照样生效。
const NO_REPORT_PROCESS_NAMES = new Set(['银胶固化', 'PLASMA', '回流焊'])
// K3 工序控制码：226304「不用汇报」（111586=免检+汇报、111610=免检+委外）
const NO_REPORT_OPT_CTRL_CODE = '226304'

const BASE_CONDITIONS = [
  `d.FOptCtrlCodeId <> ${NO_REPORT_OPT_CTRL_CODE}`,
  "ISNULL(d.FOperNumber, '') <> ''",
  "mo.FDOCUMENTSTATUS = 'C'",
  'moe_a.FSTATUS IN (3, 4, 5)',
  // 必须有实际存在的上游销售订单，按生产订单行追溯；EXISTS 不重复工序行。
  'EXISTS (SELECT 1 FROM T_SAL_ORDER sale_source WHERE sale_source.FID = moe.FSALEORDERID)',
  // 销售订单业务关闭：已关闭且非手工关闭。
  "NOT EXISTS (SELECT 1 FROM T_SAL_ORDER sale_order WHERE sale_order.FID = moe.FSALEORDERID AND sale_order.FCLOSESTATUS = 'B' AND sale_order.FMANUALCLOSE = '0')",
]

const OPERATION_JOINS = [
  'JOIN T_SFC_OPERPLANNINGSEQ s ON op.FID = s.FID',
  'JOIN T_SFC_OPERPLANNINGDETAIL d ON s.FENTRYID = d.FENTRYID',
  'LEFT JOIN T_SFC_OPERPLANNINGDETAIL_B b ON d.FDETAILID = b.FDETAILID',
  'JOIN T_PRD_MO mo ON op.FMONumber = mo.FBILLNO',
  'JOIN T_PRD_MOENTRY moe ON mo.FID = moe.FID AND op.FMOEntrySeq = moe.FSEQ',
  'LEFT JOIN T_PRD_MOENTRY_A moe_a ON moe.FENTRYID = moe_a.FENTRYID',
  'LEFT JOIN T_BD_MATERIAL mat ON mat.FMATERIALID = op.FProductId',
  'LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FProductId AND mat_l.FLOCALEID = 2052',
  'LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = d.FProcessId AND proc_l.FLOCALEID = 2052',
  'LEFT JOIN T_ENG_ROUTE_L route_l ON route_l.FID = op.FRouteId AND route_l.FLOCALEID = 2052',
  'LEFT JOIN T_BD_DEPARTMENT_L dept_oper ON dept_oper.FDEPTID = d.FDepartmentId AND dept_oper.FLOCALEID = 2052',
]

const OPERATION_COLUMNS = `op.FMONumber AS moNumber, op.FMOEntrySeq AS moEntrySeq, op.FBillNo AS billNo, mat.FNUMBER AS materialNumber, mat_l.FNAME AS materialName, mat_l.FSPECIFICATION AS specification, ${k3PackageNameExpression('mat_l')} AS packageName, ${k3PackageTypeExpression('mat_l')} AS packageType, d.FOperNumber AS processNumber, proc_l.FNAME AS processName, op.FRouteId AS routeId, route_l.FNAME AS routeName, d.FOperQty AS operQty, b.FREPORTQTY AS reportQty, b.FQualifiedQty AS qualifiedQty, b.FTransInQty AS transInQty, b.FTransOutQty AS transOutQty, dept_oper.FFullName AS departmentName, d.REPORT_DATE AS lastReportTime`

const OPERATION_ORDER = 'ORDER BY op.FMONumber DESC, op.FMOEntrySeq ASC, d.FOperNumber ASC'

function groupConditions(query: WipQuery): string[] {
  const conditions: string[] = []
  if (trimmed(query.moNumber)) conditions.push('op.FMONumber LIKE @moNumber')
  if (trimmed(query.billNo)) conditions.push('op.FBillNo LIKE @billNo')
  if (trimmed(query.materialKeyword)) {
    conditions.push('(mat.FNUMBER LIKE @materialKeyword OR mat_l.FNAME LIKE @materialKeyword OR mat_l.FSPECIFICATION LIKE @materialKeyword)')
  }
  // 封装名与「矩阵视图」的行轴同源（同一段 CASE 表达式），避免筛选与展示口径不一致。
  if (trimmed(query.packageName)) conditions.push(`${k3PackageNameExpression('mat_l')} LIKE @packageName`)
  // 封装工艺：玻封 / 塑封。与封装名筛选一样走 SQL（不是前端过滤），
  // 这样筛了哪条线，列头（工序轴）就只剩那条线的工序，不再和另一条线合并排序。
  const packageType = normalizePackageType(query.packageType)
  if (packageType) conditions.push(`${k3PackageTypeExpression('mat_l')} = @packageType`)
  // 顶部搜索框：一个关键词横扫订单 / 流程单 / 物料编码 · 名称 · 规格 / 封装。
  // 注意不含工序名——按工序收窄走矩阵的列头点选（那条路径会自动带出整条流程链）。
  if (trimmed(query.keyword)) {
    conditions.push(`(op.FMONumber LIKE @keyword OR op.FBillNo LIKE @keyword OR mat.FNUMBER LIKE @keyword OR mat_l.FNAME LIKE @keyword OR mat_l.FSPECIFICATION LIKE @keyword OR ${k3PackageNameExpression('mat_l')} LIKE @keyword)`)
  }
  return conditions
}

async function queryOperations(query: WipQuery): Promise<{ rows: OperationRow[]; chainExpanded: boolean }> {
  // 单据状态过滤常驻：只统计已审核(C)且分录状态为在制(3,4,5)的生产订单，
  // 带筛选查询同样生效，避免作废/结案订单混入在制。
  const fromClause = `FROM T_SFC_OPERPLANNING op ${OPERATION_JOINS.join(' ')}`
  // 工序筛选会截断流程链（在制=本道合格-下道转入，缺下道行算不出），
  // 此时先按筛选命中整组流程单，再整链取回计算，展示时只留命中工序。
  const chainExpanded = Boolean(trimmed(query.processName))
  let queryText: string
  if (!chainExpanded) {
    const conditions = [...BASE_CONDITIONS, ...groupConditions(query)]
    queryText = `SELECT TOP ${MAX_OPERATION_ROWS + 1} ${OPERATION_COLUMNS} ${fromClause} WHERE ${conditions.join(' AND ')} ${OPERATION_ORDER}`
  } else {
    const matchedConditions = [...BASE_CONDITIONS, ...groupConditions(query), 'proc_l.FNAME LIKE @processName']
    const outerConditions = [...BASE_CONDITIONS, ...groupConditions(query)]
    queryText = `WITH matched AS (SELECT DISTINCT op.FMONumber AS moNumber, op.FMOEntrySeq AS moEntrySeq, op.FBillNo AS billNo ${fromClause} WHERE ${matchedConditions.join(' AND ')}) SELECT TOP ${MAX_OPERATION_ROWS + 1} ${OPERATION_COLUMNS} ${fromClause} JOIN matched m ON m.moNumber = op.FMONumber AND m.moEntrySeq = op.FMOEntrySeq AND m.billNo = op.FBillNo WHERE ${outerConditions.join(' AND ')} ${OPERATION_ORDER}`
  }

  const rows = await queryK3SqlServer(async (request) => {
    if (trimmed(query.moNumber)) bindLike(request, 'moNumber', query.moNumber)
    if (trimmed(query.billNo)) bindLike(request, 'billNo', query.billNo)
    if (trimmed(query.processName)) bindLike(request, 'processName', query.processName)
    if (trimmed(query.packageName)) bindLike(request, 'packageName', query.packageName)
    const packageType = normalizePackageType(query.packageType)
    if (packageType) sqlStringParameter(request, 'packageType', packageType)
    if (trimmed(query.materialKeyword)) bindLike(request, 'materialKeyword', query.materialKeyword)
    if (trimmed(query.keyword)) bindLike(request, 'keyword', query.keyword)
    return request.query(queryText)
  })
  if (rows.length > MAX_OPERATION_ROWS) throw new WipQueryLimitError('在制数据量过大，请补充生产订单、物料或工序筛选条件后重试')

  // 路线骨架 + K3「不用汇报」标记必须在过滤之前取：被剔掉的工序也要给剩下的工序当锚点。
  // 它排在主查询之后，主查询始终是第一条 SQL（有测试按这个顺序断言）。
  const routeIds = [...new Set(rows.map((row: any) => valueText(row.routeId)).filter(Boolean))]
  const routeOps = await queryRouteProcessOps(routeIds)
  const operationRows = rows.map((row: any): OperationRow => ({
    moNumber: valueText(row.moNumber),
    moEntrySeq: valueText(row.moEntrySeq),
    billNo: valueText(row.billNo),
    materialNumber: valueText(row.materialNumber),
    materialName: valueText(row.materialName),
    specification: valueText(row.specification),
    packageName: valueText(row.packageName),
    packageType: valueText(row.packageType),
    processNumber: valueText(row.processNumber),
    processName: valueText(row.processName),
    routeId: valueText(row.routeId),
    routeName: valueText(row.routeName),
    operQty: numberValue(row.operQty),
    reportQty: numberValue(row.reportQty),
    qualifiedQty: numberValue(row.qualifiedQty),
    transInQty: numberValue(row.transInQty),
    transOutQty: numberValue(row.transOutQty),
    departmentName: valueText(row.departmentName),
    lastReportTime: valueText(row.lastReportTime),
    // 不回报的工序剔掉，后面的明细、矩阵、合计、未汇报和列轴权重都在这份行上算：
    // 一是用户点名的三个，二是 K3 在这条路上标了「不用汇报」(226304) 的（固化/二次固化等）
  })).filter((row) => !NO_REPORT_PROCESS_NAMES.has(row.processName)
    && !routeOps.get(row.routeId)?.noReport.has(row.processName))
  return { rows: operationRows, chainExpanded, processOrder: buildRouteProcessOrder(operationRows, routeOps) }
}

export async function queryWipReport(input: WipQuery = {}, options: { fullExport?: boolean } = {}): Promise<Record<string, unknown>> {
  const queryResult = await queryOperations(input)
  const built = buildDetails(input, queryResult.rows)
  const processKeyword = queryResult.chainExpanded ? trimmed(input.processName).toLowerCase() : ''
  let allDetails = built.details
  if (queryResult.chainExpanded) {
    allDetails = allDetails.filter((detail) => String(detail.processName ?? '').toLowerCase().includes(processKeyword))
  }

  // 合计口径按全部筛选结果计算，不受分页截断影响。
  // 必须在排序之前按默认顺序累加：浮点加法不满足结合律，换行序会把 totalQty 的末位算歪，
  // 屏幕上就会出现「排个序合计变了」
  let totalQty = 0
  const processSet = new Set<string>()
  const materialSet = new Set<string>()
  const orderSet = new Set<string>()
  const packageSet = new Set<string>()
  for (const detail of allDetails) {
    totalQty += detail.wipQty
    processSet.add(detail.processName)
    materialSet.add(detail.materialNumber)
    orderSet.add(`${detail.moNumber}_${detail.moEntrySeq}`)
    packageSet.add(detail.packageName || UNKNOWN_PACKAGE_NAME)
  }

  // 未汇报流程单数：不受「只看有量」影响，只要该流程单有未汇报工序就算，
  // 工序筛选时按未汇报工序名匹配。
  const unreportedBillSet = new Set<string>()
  for (const bill of built.unreportedBills) {
    if (processKeyword && !String(bill.processName ?? '').toLowerCase().includes(processKeyword)) continue
    unreportedBillSet.add(bill.key)
  }

  // 表头排序：在明细组装、合计算完之后，分页之前做。
  //   1. 不进 SQL——口径（末道算转出、未汇报整单算首道）是 buildDetails 算出来的，
  //      排序只该决定行序，不该绕过口径；
  //   2. 排的是全量而不是当前页——「在制数量倒序」要的是全场最大值出现在第 1 行，
  //      只排本页会让人以为翻到第 2 页还有更大的；
  //   3. sort 本身是稳定的，并列时保留默认顺序（工序-物料-订单），翻页不会来回窜行。
  const sort = normalizeWipSort(input)
  if (sort.field) {
    const sign = sort.desc ? -1 : 1
    allDetails.sort((left, right) => sign * (sort.field === 'wipQty'
      ? numberValue(left.wipQty) - numberValue(right.wipQty)
      : compareText(left[sort.field], right[sort.field])))
  }

  // 明细是否整批返回：导出（fullExport）与抽屉的一次性加载（all=true）都走全量，不截断；
  // 其余照常按 page/pageSize 截断（pageSize 上限 MAX_PAGE_SIZE）。
  const loadAll = options.fullExport || wantsAllDetails(input.all)
  const page = parsePage(input.page)
  const pageSize = parsePageSize(input.pageSize)
  const detailsTotal = allDetails.length
  const pageCount = loadAll ? 1 : Math.max(Math.ceil(detailsTotal / pageSize), 1)
  const safePage = loadAll ? 1 : Math.min(page, pageCount)
  const details = loadAll
    ? allDetails
    : allDetails.slice((safePage - 1) * pageSize, safePage * pageSize)

  // 分组汇总按当前页明细构建，与屏幕显示一致
  const summaryMap = new Map<string, any>()
  for (const detail of details) {
    const key = `${detail.processName}||${detail.materialNumber}||${detail.specification}`
    const summary = summaryMap.get(key) || {
      processNumber: null,
      processName: detail.processName,
      materialNumber: detail.materialNumber,
      materialName: detail.materialName,
      specification: detail.specification,
      wipQty: 0,
      orderCount: 0,
      details: [],
    }
    summary.wipQty += detail.wipQty
    summary.details.push(detail)
    summaryMap.set(key, summary)
  }

  const summaries = [...summaryMap.values()]
  for (const summary of summaries) {
    summary.orderCount = new Set(summary.details.map((detail: any) => `${detail.moNumber}_${detail.moEntrySeq}`)).size
  }
  summaries.sort((left, right) => compareText(left.processName, right.processName) || compareText(left.materialNumber, right.materialNumber))
  // 一次性加载时把 summaries 里嵌的明细行拆掉：那些就是 details 的同一批对象，
  // 再序列化一遍会让响应凭空翻倍（实测 1000 行 = details 472KB + summaries 489KB）。
  // 汇总数字（条数/合计/订单数）保留，明细一律看 details。
  if (loadAll) summaries.forEach((summary) => { delete summary.details })

  return {
    details,
    detailsTotal,
    page: safePage,
    pageSize: loadAll ? detailsTotal : pageSize,
    pageCount,
    summaries,
    // 矩阵基于「当前筛选的全部明细」汇总，与合计、导出同口径，不受分页影响
    matrix: buildPackageProcessMatrix(allDetails, queryResult.processOrder),
    totalQty,
    processCount: processSet.size,
    materialCount: materialSet.size,
    orderCount: orderSet.size,
    packageCount: packageSet.size,
    unreportedBillCount: unreportedBillSet.size,
    operationRowCount: queryResult.rows.length,
    scopeNote: WIP_SCOPE_NOTE,
  }
}

// 工序是否已有汇报：合格/转入/转出任一有数即视为已汇报。
// 全为 0 的行代表这道工序还没动，按业务口径是物料停留点，不能当无数据丢掉。
function hasReportData(row: OperationRow): boolean {
  return row.qualifiedQty > 0 || row.transInQty > 0 || row.transOutQty > 0
}

function buildDetails(query: WipQuery, operations: OperationRow[]): { details: any[]; unreportedBills: Array<{ key: string; processName: string }> } {
  const hideNonPositive = positiveOnly(query.onlyPositive)
  const hideZero = hideZeroWipRows(query.hideZeroWip)
  const orderMap = new Map<string, OperationRow[]>()
  for (const operation of operations) {
    const key = `${operation.moNumber}_${operation.moEntrySeq}_${operation.billNo}`
    const rows = orderMap.get(key) || []
    rows.push(operation)
    orderMap.set(key, rows)
  }

  const details: any[] = []
  const unreportedBills: Array<{ key: string; processName: string }> = []
  const pushDetail = (current: OperationRow, wipQty: number, nextReceivedQty: number, unreported: boolean) => {
    details.push({
      processNumber: current.processNumber,
      processName: current.processName,
      materialNumber: current.materialNumber,
      materialName: current.materialName,
      specification: current.specification,
      packageName: current.packageName,
      packageType: current.packageType,
      wipQty,
      moNumber: current.moNumber,
      moEntrySeq: current.moEntrySeq,
      billNo: current.billNo,
      operQty: current.operQty,
      reportQty: current.reportQty,
      qualifiedQty: current.qualifiedQty,
      transInQty: current.transInQty,
      transOutQty: current.transOutQty,
      nextReceivedQty,
      departmentName: current.departmentName,
      routeName: current.routeName,
      lastReportTime: current.lastReportTime,
      unreported,
      // 本工序汇报状态：以「汇报数量>0」为唯一直接证据（转入/合格/转出都可能是转移单或上道动作带来的）。
      // 注意：状态只影响标签，不影响在制数量计算——口径仍是「本道已产出 − 下道已接收」。
      wipStatus: current.reportQty > 0
        ? 'reported'
        : (current.qualifiedQty > 0 || current.transOutQty > 0 ? 'produced' : current.transInQty > 0 ? 'received' : 'unreported'),
    })
  }

  for (const rows of orderMap.values()) {
    rows.sort((left, right) => processNumber(left.processNumber) - processNumber(right.processNumber))
    const billKey = `${rows[0].moNumber}_${rows[0].moEntrySeq}_${rows[0].billNo}`
    for (let index = 0; index < rows.length; index += 1) {
      const current = rows[index]
      const next = rows[index + 1]

      if (!hasReportData(current)) {
        // 未汇报工序（工序计划已下发但合格/转入/转出全为 0）= 物料停留点。
        // 整张流程单一套汇报都没有时，首道工序按工序计划数量计入在制；
        // 非首道时数量已经在上一道「本道产出 - 下道已接收」里体现，这里记 0 并打标记，避免重复。
        unreportedBills.push({ key: billKey, processName: current.processName })
        const wipQty = index === 0 ? numberValue(current.operQty) : 0
        if (hideZero && wipQty === 0) continue
        if (hideNonPositive && wipQty <= 0) continue
        pushDetail(current, wipQty, 0, true)
        continue
      }

      // 口径：本道在制 = 本道已产出 - 下道已接收；末道 = 本道已产出 - 本道转出。
      // 已产出取 max(合格, 转入)，避免“已接收未产出”的在制被算成 0；
      // 下道已接收只认转入（不用下道合格兜底），缺口直接暴露，不抹平。
      // 下道尚未汇报时转入为 0，本道已产出的量全部算作未接收，不会被末道「本道转出」兜底抹平。
      const producedQty = Math.max(current.qualifiedQty, current.transInQty)
      const nextReceivedQty = next ? next.transInQty : current.transOutQty
      const wipQty = producedQty - nextReceivedQty
      // 这道工序的料已经全部走完（在制 0）：它不是「在制品」，不进明细清单
      if (hideZero && wipQty === 0) continue
      if (hideNonPositive && wipQty <= 0) continue
      pushDetail(current, wipQty, nextReceivedQty, false)
    }
  }
  details.sort((left, right) => compareText(left.processName, right.processName)
    || compareText(left.materialNumber, right.materialNumber)
    || compareText(left.moNumber, right.moNumber)
    || compareText(left.billNo, right.billNo)
    || processNumber(left.processNumber) - processNumber(right.processNumber))
  return { details, unreportedBills }
}

function processNumber(value: unknown): number {
  const number = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER
}

type RouteSequence = {
  name: string
  // 该路线里工序的先后顺序，已按工序号排好
  order: string[]
  // 这条路线上的工序计划行数，用来决定并入的先后（量大的路线先并，锚点更权威）
  weight: number
}

// 路线 → 全量工序（工序号 + 名字，已按工序号排好）+ 这条路线上 K3 标了「不用汇报」的工序
type RouteProcessOps = Map<string, {
  order: Array<{ name: string; number: number }>
  // K3 工序控制码 226304「不用汇报」：模板或历史里只要标过，这道工序在这条路线上就不进在制口径
  noReport: Set<string>
}>

// 列轴骨架不能只用「本次查询返回的工序行」拼，得拿路线的全量工序，两个坑都是实测踩到的：
//   1. 没有在制的工序进不了骨架 → 别的路线插不进锚点。玻封那张跑在 (塑封)反编返工线上的单
//      就是这么被甩到「玻封包装」后面的——它的锚点（外观全检/包装入库）当时都没有在制，
//      于是「测试分选」尾接到最后，看着像包装完才去测试；
//   2. 路线会改版（外观全检 2024-12 已从玻封路线删除），只认当前模板或只认在制行，
//      列序都会随数据漂移。
// 所以两个来源取并集：当前路线模板（T_ENG_ROUTE→T_ENG_ROUTEOPERSEQ→T_ENG_ROUTEOPERDETAIL）
// ∪ 这条路线历史上生成过的工序计划（T_SFC_OPERPLANNING…），按工序号排。
// 只查本次结果里出现过的路线（路线数是十位级），实测 3 条 40ms、40 条 350ms。
async function queryRouteProcessOps(routeIds: Array<string>): Promise<RouteProcessOps> {
  const ids = [...new Set(routeIds.map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value > 0))]
  const map: RouteProcessOps = new Map()
  if (!ids.length) return map
  const idList = ids.join(',')
  try {
    const rows = await queryK3SqlServer(async (request) => request.query(`
      SELECT routeId, operNumber, processName, optCtrlCode FROM (
        SELECT seq.FID AS routeId, d.FOPERNUMBER AS operNumber, pl.FNAME AS processName, d.FOptCtrlCodeId AS optCtrlCode
        FROM T_ENG_ROUTEOPERSEQ seq
        JOIN T_ENG_ROUTEOPERDETAIL d ON d.FENTRYID = seq.FENTRYID
        LEFT JOIN T_ENG_PROCESS_L pl ON pl.FID = d.FPROCESSID AND pl.FLOCALEID = 2052
        WHERE seq.FID IN (${idList})
        UNION
        SELECT op.FRouteId, d.FOperNumber, pl.FNAME, d.FOptCtrlCodeId
        FROM T_SFC_OPERPLANNING op
        JOIN T_SFC_OPERPLANNINGSEQ s ON op.FID = s.FID
        JOIN T_SFC_OPERPLANNINGDETAIL d ON s.FENTRYID = d.FENTRYID
        LEFT JOIN T_ENG_PROCESS_L pl ON pl.FID = d.FProcessId AND pl.FLOCALEID = 2052
        WHERE op.FRouteId IN (${idList})
      ) x
      WHERE processName IS NOT NULL AND LTRIM(RTRIM(processName)) <> ''
      ORDER BY routeId, operNumber`))
    for (const row of rows as Array<Record<string, unknown>>) {
      const routeId = trimmed(row.routeId)
      const name = trimmed(row.processName)
      const number = Number.parseInt(String(row.operNumber ?? ''), 10)
      if (!routeId || !name || !Number.isFinite(number)) continue
      let entry = map.get(routeId)
      if (!entry) {
        entry = { order: [], noReport: new Set<string>() }
        map.set(routeId, entry)
      }
      // 同一道工序在模板与历史里都可能出现：按名字去重，保留较小的工序号
      if (!entry.order.some((item) => item.name === name)) entry.order.push({ name, number })
      if (String(row.optCtrlCode ?? '').trim() === NO_REPORT_OPT_CTRL_CODE) entry.noReport.add(name)
    }
  } catch {
    // 骨架取不到不能拖垮报表：退回「只按返回行推顺序 + 只按点名名单剔」的老口径
    return new Map()
  }
  for (const entry of map.values()) {
    entry.order.sort((left, right) => left.number - right.number || compareText(left.name, right.name))
  }
  return map
}

// 列头（工序轴）的顺序必须按工艺路线来，不能拿各路线的最小工序号硬排：
// 同一道工序在不同路线里的工序号并不一套（塑封线 固晶部=10，玻封线 组装=10，
// 反编返工路线 测试分选=10），按最小工序号排会把「测试分选/外观全检/包装入库」
// 这些只在小路线里打头的工序挤到最前面，整排看起来完全不按工艺走。
// 这里的口径：
//   1. 先从路线的全量工序（模板 ∪ 历史，见 queryRouteProcessOps）还原每条路线的工序顺序，
//      路线没查到时才退回「从本次返回的工序行推」；同一路线内按工序号；
//   2. 取工序最多（并列取行数最多）的那条路线当骨架，其余路线按行数从多到少并入；
//   3. 并入时贴着本路线里最近的后继工序插到它前面，没有后继就贴最近的前继工序之后，
//      两者都没有（整条路线都是新工序，例如玻封线）就按本路线顺序尾接。
// 这样每条路线内部的先后都被保留，且一次全表顺序稳定可复现。
export function buildRouteProcessOrder(
  operations: Array<Pick<OperationRow, 'routeId' | 'routeName' | 'processName' | 'processNumber'>>,
  routeOps: RouteProcessOps = new Map(),
): string[] {
  const routeMap = new Map<string, { name: string; weight: number; processes: Map<string, number> }>()
  for (const operation of operations) {
    const processName = String(operation.processName ?? '')
    if (!processName) continue
    const routeId = String(operation.routeId ?? '')
    const routeName = String(operation.routeName ?? '')
    const key = routeId || routeName
    if (!key) continue
    let route = routeMap.get(key)
    if (!route) {
      route = { name: routeName, weight: 0, processes: new Map() }
      routeMap.set(key, route)
    }
    route.weight += 1
    const number = processNumber(operation.processNumber)
    const current = route.processes.get(processName)
    if (current == null || number < current) route.processes.set(processName, number)
  }
  // 把路线的全量工序并进骨架：只有本次结果里出现过的路线才参与（别的路线在列轴上没有列），
  // 但这些路线上「没有在制的工序」要占位——它们是别的路线找锚点用的
  for (const [key, entry] of routeOps) {
    const route = routeMap.get(key)
    if (!route) continue
    for (const op of entry.order) {
      const current = route.processes.get(op.name)
      if (current == null || op.number < current) route.processes.set(op.name, op.number)
    }
  }

  const routes: RouteSequence[] = [...routeMap.values()].map((route) => ({
    name: route.name,
    weight: route.weight,
    order: [...route.processes.entries()]
      .sort((left, right) => left[1] - right[1] || compareText(left[0], right[0]))
      .map(([processName]) => processName),
  }))
  if (!routes.length) return []

  const backbone = routes.reduce((best, route) => (
    route.order.length > best.order.length
    || (route.order.length === best.order.length && route.weight > best.weight)
    || (route.order.length === best.order.length && route.weight === best.weight && compareText(route.name, best.name) < 0)
      ? route
      : best
  ))

  const merged = [...backbone.order]
  const rest = routes
    .filter((route) => route !== backbone)
    .sort((left, right) => right.weight - left.weight || compareText(left.name, right.name))
  for (const route of rest) {
    for (const [index, processName] of route.order.entries()) {
      if (merged.includes(processName)) continue
      const successor = route.order.slice(index + 1).find((name) => merged.includes(name))
      if (successor) {
        merged.splice(merged.indexOf(successor), 0, processName)
        continue
      }
      const predecessor = [...route.order.slice(0, index)].reverse().find((name) => merged.includes(name))
      merged.splice(predecessor ? merged.indexOf(predecessor) + 1 : merged.length, 0, processName)
    }
  }
  return merged
}

export type WipMatrixCell = {
  packageName: string
  processName: string
  wipQty: number
  orderCount: number
  materialCount: number
  unreportedQty: number
  unreportedCount: number
}

export type WipMatrixAxis = {
  name: string
  wipQty: number
  orderCount: number
  materialCount: number
  sortOrder: number
}

type MatrixBucket = {
  name: string
  wipQty: number
  orderKeys: Set<string>
  materialKeys: Set<string>
  sortOrder: number
}

function matrixBucket(map: Map<string, MatrixBucket>, name: string): MatrixBucket {
  let bucket = map.get(name)
  if (!bucket) {
    bucket = { name, wipQty: 0, orderKeys: new Set(), materialKeys: new Set(), sortOrder: Number.MAX_SAFE_INTEGER }
    map.set(name, bucket)
  }
  return bucket
}

function axisOf(bucket: MatrixBucket): WipMatrixAxis {
  return {
    name: bucket.name,
    wipQty: bucket.wipQty,
    orderCount: bucket.orderKeys.size,
    materialCount: bucket.materialKeys.size,
    sortOrder: bucket.sortOrder
  }
}

const MATRIX_KEY_SEPARATOR = '\u0000'

export function matrixCellKey(packageName: unknown, processName: unknown): string {
  return `${String(packageName ?? '')}${MATRIX_KEY_SEPARATOR}${String(processName ?? '')}`
}

// 封装 × 工序 交叉汇总。输入是已经算好「在制数量」的明细集合，
// 所以 矩阵合计 = 明细合计 = 导出合计，不存在第二套口径。
// 列（工序）按工艺路线的工序顺序排（见 buildRouteProcessOrder，而不是各路线工序号的最小值）；
// 行（封装）按在制量倒序，量大的排在上面。
export function buildPackageProcessMatrix(details: any[], processOrder: string[] = []): {
  packages: WipMatrixAxis[]
  processes: WipMatrixAxis[]
  cells: WipMatrixCell[]
  totalQty: number
  maxCellQty: number
  cellCount: number
  packageCount: number
  processCount: number
} {
  const cellMap = new Map<string, WipMatrixCell & { orderKeys: Set<string>; materialKeys: Set<string> }>()
  const packageMap = new Map<string, MatrixBucket>()
  const processMap = new Map<string, MatrixBucket>()

  for (const detail of details) {
    const packageName = String(detail.packageName || UNKNOWN_PACKAGE_NAME)
    const processName = String(detail.processName || '')
    const wipQty = Number(detail.wipQty) || 0
    const orderKey = `${detail.moNumber || ''}_${detail.moEntrySeq || ''}`
    const materialKey = String(detail.materialNumber || '')

    const key = matrixCellKey(packageName, processName)
    let cell = cellMap.get(key)
    if (!cell) {
      cell = {
        packageName,
        processName,
        wipQty: 0,
        orderCount: 0,
        materialCount: 0,
        unreportedQty: 0,
        unreportedCount: 0,
        orderKeys: new Set(),
        materialKeys: new Set(),
      }
      cellMap.set(key, cell)
    }
    cell.wipQty += wipQty
    // 本工序没有汇报的（含「上道已转入但本工序没汇报」「有产出但没汇报单」）都算没汇报，
    // 这样格子上的提醒跟明细里的状态标签是同一件事
    if (detail.wipStatus && detail.wipStatus !== 'reported') {
      cell.unreportedQty += wipQty
      cell.unreportedCount += 1
    }
    cell.orderKeys.add(orderKey)
    cell.materialKeys.add(materialKey)

    const packageBucket = matrixBucket(packageMap, packageName)
    packageBucket.wipQty += wipQty
    packageBucket.orderKeys.add(orderKey)
    packageBucket.materialKeys.add(materialKey)

    const processBucket = matrixBucket(processMap, processName)
    processBucket.wipQty += wipQty
    processBucket.orderKeys.add(orderKey)
    processBucket.materialKeys.add(materialKey)
    processBucket.sortOrder = Math.min(processBucket.sortOrder, processNumber(detail.processNumber))
  }

  const cells: WipMatrixCell[] = [...cellMap.values()].map((cell) => ({
    packageName: cell.packageName,
    processName: cell.processName,
    wipQty: cell.wipQty,
    orderCount: cell.orderKeys.size,
    materialCount: cell.materialKeys.size,
    unreportedQty: cell.unreportedQty,
    unreportedCount: cell.unreportedCount,
  }))

  const packages = [...packageMap.values()].map(axisOf)
    .sort((left, right) => right.wipQty - left.wipQty || compareText(left.name, right.name))
  // 工序轴按工艺路线的先后排；路线里没覆盖到的工序（理论上不该有）退回「工序号 → 名称」兜底
  const routeRank = new Map(processOrder.map((name, index) => [name, index]))
  const processes = [...processMap.values()].map(axisOf)
    .sort((left, right) => {
      const leftRank = routeRank.get(left.name)
      const rightRank = routeRank.get(right.name)
      if (leftRank != null && rightRank != null && leftRank !== rightRank) return leftRank - rightRank
      if (leftRank != null && rightRank == null) return -1
      if (leftRank == null && rightRank != null) return 1
      return left.sortOrder - right.sortOrder || compareText(left.name, right.name)
    })

  // 单元格排序与坐标轴一致（先按列头次序，再按封装在行轴上的次序），
  // 前端只做查表渲染，但稳定的返回顺序让接口本身可核对、可测试。
  const processRank = new Map(processes.map((process, index) => [process.name, index]))
  const packageRank = new Map(packages.map((packageItem, index) => [packageItem.name, index]))
  cells.sort((left, right) => (processRank.get(left.processName) ?? Number.MAX_SAFE_INTEGER) - (processRank.get(right.processName) ?? Number.MAX_SAFE_INTEGER)
    || (packageRank.get(left.packageName) ?? Number.MAX_SAFE_INTEGER) - (packageRank.get(right.packageName) ?? Number.MAX_SAFE_INTEGER))

  let totalQty = 0
  let maxCellQty = 0
  for (const cell of cells) {
    totalQty += cell.wipQty
    if (cell.wipQty > maxCellQty) maxCellQty = cell.wipQty
  }

  return {
    packages,
    processes,
    cells,
    totalQty,
    maxCellQty,
    cellCount: cells.length,
    packageCount: packages.length,
    processCount: processes.length,
  }
}

function compareText(left: unknown, right: unknown): number {
  const a = String(left ?? '')
  const b = String(right ?? '')
  return a < b ? -1 : a > b ? 1 : 0
}
