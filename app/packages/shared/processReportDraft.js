export const PROCESS_REPORT_QUANTITY_KEYS = [
  'qualifiedQty',
  'processFailQty',
  'materialFailQty',
  'reworkQty',
  'wastageQty',
]

function quantityValue(value) {
  if (value === '' || value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function summarizeProcessReportQuantities(quantities = {}) {
  const values = PROCESS_REPORT_QUANTITY_KEYS.map((key) => quantityValue(quantities[key]))
  return {
    values,
    total: values.reduce((sum, value) => sum + (Number.isNaN(value) ? 0 : value), 0),
  }
}

export function validateProcessReportDraft(operation, quantities = {}) {
  if (!operation || !operation.canReport) {
    return { ok: false, message: '请先选择一道可汇报工序', total: 0 }
  }

  const { values, total } = summarizeProcessReportQuantities(quantities)
  if (values.some((value) => Number.isNaN(value) || value < 0)) {
    return { ok: false, message: '数量必须是大于或等于 0 的数字', total }
  }
  if (total <= 0) {
    return { ok: false, message: '请至少填写一项本次汇报数量', total }
  }
  if (total > Number(operation.remainingQty || 0)) {
    return {
      ok: false,
      message: `本次汇报总量 ${total} 超过剩余可报数量 ${operation.remainingQty}`,
      total,
    }
  }
  return { ok: true, message: '数量校验通过，可在后续阶段提交金蝶工序汇报', total }
}
