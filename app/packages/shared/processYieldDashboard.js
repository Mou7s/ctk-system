export const PROCESS_YIELD_THRESHOLD = 97.5

export const PROCESS_YIELD_METRICS = Object.freeze([
  {
    key: 'packaging',
    label: '封装直通率',
    description: '入库合格数量 ÷ 固晶投入数量',
    scopeNote: '按入库汇报日期统计',
    formula: '入库合格 ÷ 固晶投入',
    mode: 'quantity',
    inputKey: 'packagingInputQty',
    qualifiedKey: 'packagingQualifiedQty',
    planKey: 'packagingPlanCount',
    passedKey: 'packagingPassedPlanCount',
    inputLabel: '固晶投入',
    qualifiedLabel: '入库合格',
    rateLabel: '直通率',
    targetLabel: '目标线 100%',
    target: 100,
    usesThreshold: false,
    color: '#10b981',
  },
  {
    key: 'testing',
    label: '测试良率',
    description: '（合格数量 + 尾数 - 增投数量）÷ 上工序转入数量',
    scopeNote: '按测试汇报日期统计',
    formula: '（合格 + 尾数 - 增投）÷ 上工序转入',
    mode: 'quantity',
    inputKey: 'testingPreviousInputQty',
    qualifiedKey: 'testingStraightThroughQty',
    planKey: 'testingPlanCount',
    passedKey: 'testingPassedPlanCount',
    inputLabel: '上工序转入',
    qualifiedLabel: '合格 + 尾数 - 增投',
    rateLabel: '直通率',
    targetLabel: '目标线 100%',
    target: 100,
    usesThreshold: false,
    color: '#3b82f6',
  },
  {
    key: 'process',
    label: '工序达标率',
    description: `达到 ${PROCESS_YIELD_THRESHOLD}% 达标线的工序计划单 ÷ 工序计划总数`,
    scopeNote: '按入库汇报计划和当前达标阈值统计',
    formula: '达标工序单 ÷ 工序计划单',
    mode: 'plans',
    inputKey: 'packagingPlanCount',
    qualifiedKey: 'packagingPassedPlanCount',
    planKey: 'packagingPlanCount',
    passedKey: 'packagingPassedPlanCount',
    inputLabel: '工序计划单',
    qualifiedLabel: '达标工序单',
    rateLabel: '达标率',
    targetLabel: `达标线 ${PROCESS_YIELD_THRESHOLD}%`,
    target: PROCESS_YIELD_THRESHOLD,
    usesThreshold: true,
    color: '#8b5cf6',
  },
])

export function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function percentOf(numerator, denominator) {
  const base = toNumber(denominator)
  if (base <= 0) return null
  return toNumber(numerator) / base * 100
}

export function metricRow(row, metric) {
  const inputQty = toNumber(row?.[metric.inputKey])
  const qualifiedQty = toNumber(row?.[metric.qualifiedKey])
  const planCount = toNumber(row?.[metric.planKey])
  const passedPlanCount = toNumber(row?.[metric.passedKey])
  const rate = metric.mode === 'plans'
    ? percentOf(passedPlanCount, planCount)
    : percentOf(qualifiedQty, inputQty)

  return {
    packageName: row?.packageName || '未维护封装',
    inputQty,
    qualifiedQty,
    planCount,
    passedPlanCount,
    rate,
    hasData: planCount > 0,
  }
}

export function normalizeDashboardResponse(result) {
  const payload = result?.data && !Array.isArray(result?.data) && result?.rows === undefined
    ? result.data
    : result
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : []

  return {
    rows: rows.map((row) => ({
      ...row,
      packageName: row?.packageName || '未维护封装',
      packagingInputQty: toNumber(row?.packagingInputQty ?? row?.inputQty),
      packagingReportInputQty: toNumber(row?.packagingReportInputQty),
      packagingQualifiedQty: toNumber(row?.packagingQualifiedQty ?? row?.stockInQty),
      packagingPlanCount: toNumber(row?.packagingPlanCount ?? row?.planCount),
      packagingPassedPlanCount: toNumber(row?.packagingPassedPlanCount),
      testingInputQty: toNumber(row?.testingInputQty ?? row?.csfxInputQty),
      testingQualifiedQty: toNumber(row?.testingQualifiedQty ?? row?.csfxQualifiedQty),
      testingPreviousInputQty: toNumber(row?.testingPreviousInputQty ?? row?.testingInputQty ?? row?.csfxInputQty),
      testingStraightThroughQty: toNumber(row?.testingStraightThroughQty ?? row?.testingQualifiedQty ?? row?.csfxQualifiedQty),
      testingPlanCount: toNumber(row?.testingPlanCount),
      testingPassedPlanCount: toNumber(row?.testingPassedPlanCount),
    })),
    summary: payload?.summary || null,
    generatedAt: payload?.generatedAt || '',
  }
}

export function buildDashboardSummary(rows = []) {
  return rows.reduce((summary, row) => {
    summary.packageCount += 1
    summary.packagingInputQty += toNumber(row.packagingInputQty)
    summary.packagingReportInputQty += toNumber(row.packagingReportInputQty)
    summary.packagingQualifiedQty += toNumber(row.packagingQualifiedQty)
    summary.packagingPlanCount += toNumber(row.packagingPlanCount)
    summary.packagingPassedPlanCount += toNumber(row.packagingPassedPlanCount)
    summary.testingInputQty += toNumber(row.testingInputQty)
    summary.testingQualifiedQty += toNumber(row.testingQualifiedQty)
    summary.testingPreviousInputQty += toNumber(row.testingPreviousInputQty ?? row.testingInputQty)
    summary.testingStraightThroughQty += toNumber(row.testingStraightThroughQty ?? row.testingQualifiedQty)
    summary.testingPlanCount += toNumber(row.testingPlanCount)
    summary.testingPassedPlanCount += toNumber(row.testingPassedPlanCount)
    return summary
  }, {
    packageCount: 0,
    packagingInputQty: 0,
    packagingReportInputQty: 0,
    packagingQualifiedQty: 0,
    packagingPlanCount: 0,
    packagingPassedPlanCount: 0,
    testingInputQty: 0,
    testingQualifiedQty: 0,
    testingPreviousInputQty: 0,
    testingStraightThroughQty: 0,
    testingPlanCount: 0,
    testingPassedPlanCount: 0,
  })
}
