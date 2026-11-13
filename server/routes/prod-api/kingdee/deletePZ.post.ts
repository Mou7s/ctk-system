import { executeBillQuery, K3CloudError, deleteBill, unAuditBill } from '../../../utils/k3'
import { ExecuteSqlInputError, normalizeExecuteSqlMonth } from '../../../utils/execute-sql'
import { ExecuteSqlPartialError, createExecuteSqlRoute } from '../../../utils/execute-sql-write'

const FORM_ID = 'CB_ENDPROCOSTADJ'
const QUERY_PAGE_SIZE = 5000
const MAX_BILL_COUNT = 10000

async function findBillNumbers(month: string): Promise<string[]> {
  const [year, monthNumber] = month.split('-').map(Number)
  const filterString = [
    { Left: '', FieldName: 'FYEAR', Compare: '76', Value: String(year), Right: '', Logic: 0 },
    { Left: '', FieldName: 'FPERIOD', Compare: '76', Value: String(monthNumber), Right: '', Logic: 0 },
  ]
  const numbers: string[] = []
  let startRow = 0

  while (true) {
    const rows = await executeBillQuery({
      formId: FORM_ID,
      fieldKeys: 'FBillNo',
      filterString,
      orderString: 'FBillNo ASC',
      startRow,
      limit: QUERY_PAGE_SIZE,
    })
    if (!Array.isArray(rows)) throw new K3CloudError('query', '期末成本调整单查询返回异常', 502)

    for (const row of rows) {
      const billNo = String(
        Array.isArray(row)
          ? row[0]
          : (row as Record<string, unknown>)?.FBillNo ?? (row as Record<string, unknown>)?.fbillno ?? '',
      ).trim()
      if (billNo && !numbers.includes(billNo)) numbers.push(billNo)
    }
    if (numbers.length > MAX_BILL_COUNT) {
      throw new ExecuteSqlInputError(`指定期间单据数量超过安全上限 ${MAX_BILL_COUNT}，已停止执行`)
    }
    if (rows.length < QUERY_PAGE_SIZE) break
    startRow += rows.length
  }

  return numbers
}

export default defineEventHandler(createExecuteSqlRoute({
  label: 'delete-pz',
  title: '反审并删除期末成本调整',
  businessType: 3,
  operation: async (body) => {
    const month = normalizeExecuteSqlMonth(body.dateStr)
    const numbers = await findBillNumbers(month)
    if (!numbers.length) {
      return {
        success: true,
        status: 'noop',
        date: month,
        matchedBillCount: 0,
        unAuditedBillCount: 0,
        deletedBillCount: 0,
        steps: [{ name: '查询期末成本调整单', success: true, affectedRows: 0 }],
        message: '指定期间没有期末成本调整单，无需处理',
      }
    }

    let unAuditedBillCount = 0
    try {
      const unAudited = await unAuditBill(FORM_ID, numbers, '反审核期末成本调整单')
      unAuditedBillCount = unAudited.successEntities.length || numbers.length
    } catch (error) {
      throw new ExecuteSqlPartialError('反审核结果不明确，未自动重试，请人工检查金蝶单据状态', {
        date: month,
        matchedBillCount: numbers.length,
        unAuditedBillCount: 0,
        deletedBillCount: 0,
        manualReviewRequired: true,
        stage: 'unAudit',
      })
    }

    try {
      const deleted = await deleteBill(FORM_ID, numbers, '删除期末成本调整单')
      const deletedBillCount = deleted.successEntities.length || numbers.length
      return {
        success: true,
        date: month,
        matchedBillCount: numbers.length,
        unAuditedBillCount,
        deletedBillCount,
        steps: [
          { name: '查询期末成本调整单', success: true, affectedRows: numbers.length },
          { name: '反审核期末成本调整单', success: true, affectedRows: unAuditedBillCount },
          { name: '删除期末成本调整单', success: true, affectedRows: deletedBillCount },
        ],
        message: '反审并删除期末成本调整成功',
      }
    } catch (error) {
      throw new ExecuteSqlPartialError('反审核已完成，但删除结果不明确，请人工检查金蝶单据状态', {
        date: month,
        matchedBillCount: numbers.length,
        unAuditedBillCount,
        deletedBillCount: 0,
        manualReviewRequired: true,
        stage: 'delete',
      })
    }
  },
}))
