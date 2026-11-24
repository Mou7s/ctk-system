import { queryK3SqlServer, sqlStringParameter } from './sqlserver'
import {
  overdueArRemarkKey,
  readOverdueArRemarkMap,
  type OverdueArRemarkRecord,
} from './customer-overdue-ar-remark'

const SOURCE = 'K3 SQL / T_AR_RECEIVABLE'
// 内部客户编码列表（通过环境变量 NUXT_INTERNAL_CUSTOMER_CODES 配置，逗号分隔，如 INTERNAL_001,INTERNAL_002）。
function internalCustomerCodes(): Set<string> {
  return new Set(
    String(process.env.NUXT_INTERNAL_CUSTOMER_CODES || '')
      .split(/[,;\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  )
}
const EXCLUDED_TERM_CODES = new Set(['001', '003'])

export class CustomerOverdueArInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'CustomerOverdueArInputError'
  }
}

type QueryInput = Record<string, unknown>
type SqlRow = Record<string, unknown>

// FOPENSTATUS 是开票核销状态；收款判断必须使用 FWRITTENOFFSTATUS。
const CUSTOMER_SUMMARY_SQL = `
WITH bill AS (
  SELECT r.FID,
         r.FBILLNO,
         r.FDATE,
         r.FENDDATE,
         r.FCUSTOMERID,
         r.FCURRENCYID,
         r.FWRITTENOFFSTATUS,
         r.FALLAMOUNTFOR,
         ISNULL(SUM(p.FPAYAMOUNTFOR), 0) AS planPay,
         ISNULL(SUM(p.FWRITTENOFFAMOUNTFOR), 0) AS planWritten
  FROM T_AR_RECEIVABLE r
  LEFT JOIN T_AR_RECEIVABLEPLAN p ON p.FID = r.FID
  WHERE r.FDOCUMENTSTATUS = 'C'
    AND ISNULL(r.FISINIT, '0') <> '1'
    AND ISNULL(r.FCANCELSTATUS, 'A') = 'A'
    AND ISNULL(r.FSETACCOUNTTYPE, '') <> '2'
    AND r.FWRITTENOFFSTATUS IN ('A', 'B')
    AND r.FALLAMOUNTFOR > 0
  GROUP BY r.FID,
           r.FBILLNO,
           r.FDATE,
           r.FENDDATE,
           r.FCUSTOMERID,
           r.FCURRENCYID,
           r.FWRITTENOFFSTATUS,
           r.FALLAMOUNTFOR
), open_bill AS (
  SELECT *,
         CASE WHEN planPay > 0 THEN planPay - planWritten ELSE FALLAMOUNTFOR END AS openAmt
  FROM bill
)
SELECT c.FNUMBER AS custCode,
       cu.FNUMBER AS currencyCode,
       cul.FNAME AS currencyName,
       cl.FNAME AS custName,
       cl.FSHORTNAME AS shortName,
       cond.FNUMBER AS termCode,
       condl.FNAME AS termName,
       ISNULL(ext.FFREEZESTATUS, 'A') AS freezeStatus,
       LTRIM(RTRIM(ISNULL(ext.FFREEZELIMIT, ''))) AS freezeLimit,
       CONVERT(varchar(10), ext.FFREEZEDATE, 120) AS freezeDate,
       sol.FNAME AS sellerName,
       ISNULL(ss.FNUMBER, '') AS sellerNo,
       ml.FNAME AS merchandiserName,
       ISNULL(m.FNUMBER, '') AS merchandiserNo,
       m1l.FNAME AS merchandiser1Name,
       ISNULL(m1.FNUMBER, '') AS merchandiser1No,
       m2l.FNAME AS merchandiser2Name,
       ISNULL(m2.FNUMBER, '') AS merchandiser2No,
       COUNT(*) AS billCnt,
       SUM(o.openAmt) AS openAmt,
       CONVERT(varchar(10), MIN(o.FENDDATE), 120) AS earliestDue,
       MAX(DATEDIFF(day, o.FENDDATE, CAST(GETDATE() AS date))) AS maxOverdueDays,
       AVG(CAST(DATEDIFF(day, o.FENDDATE, CAST(GETDATE() AS date)) AS float)) AS avgOverdueDays
FROM open_bill o
JOIN T_BD_CUSTOMER c ON c.FCUSTID = o.FCUSTOMERID
LEFT JOIN T_BD_CURRENCY cu ON cu.FCURRENCYID = o.FCURRENCYID
LEFT JOIN T_BD_CURRENCY_L cul ON cul.FCURRENCYID = o.FCURRENCYID AND cul.FLOCALEID = 2052
LEFT JOIN T_BD_CUSTOMER_L cl ON cl.FCUSTID = c.FCUSTID AND cl.FLOCALEID = 2052
LEFT JOIN T_BD_CUSTOMEREXT ext ON ext.FCUSTID = c.FCUSTID
LEFT JOIN T_BD_RECCONDITION cond ON cond.FID = c.FRECCONDITIONID
LEFT JOIN T_BD_RECCONDITION_L condl ON condl.FID = cond.FID AND condl.FLOCALEID = 2052
LEFT JOIN T_BD_OPERATORENTRY soe ON soe.FENTRYID = c.FSELLER
LEFT JOIN T_BD_OPERATORENTRY_L sol ON sol.FENTRYID = c.FSELLER AND sol.FLOCALEID = 2052
LEFT JOIN T_BD_STAFF ss ON ss.FSTAFFID = soe.FSTAFFID
LEFT JOIN T_HR_EMPINFO m ON m.FID = c.F_UNW_BASE_KYB
LEFT JOIN T_HR_EMPINFO_L ml ON ml.FID = m.FID AND ml.FLOCALEID = 2052
LEFT JOIN T_HR_EMPINFO m1 ON m1.FID = c.F_UNW_BASE_KYB_W5C
LEFT JOIN T_HR_EMPINFO_L m1l ON m1l.FID = m1.FID AND m1l.FLOCALEID = 2052
LEFT JOIN T_HR_EMPINFO m2 ON m2.FID = c.F_ADKB_BASE_83G
LEFT JOIN T_HR_EMPINFO_L m2l ON m2l.FID = m2.FID AND m2l.FLOCALEID = 2052
WHERE o.openAmt > 0.005
  AND o.FENDDATE IS NOT NULL
  AND o.FENDDATE < CAST(GETDATE() AS date)
  AND DATEDIFF(day, o.FENDDATE, CAST(GETDATE() AS date)) >= @minOverdueDays
GROUP BY c.FNUMBER,
         cu.FNUMBER,
         cul.FNAME,
         cl.FNAME,
         cl.FSHORTNAME,
         cond.FNUMBER,
         condl.FNAME,
         ext.FFREEZESTATUS,
         ext.FFREEZELIMIT,
         ext.FFREEZEDATE,
         sol.FNAME,
         ss.FNUMBER,
         ml.FNAME,
         m.FNUMBER,
         m1l.FNAME,
         m1.FNUMBER,
         m2l.FNAME,
         m2.FNUMBER
ORDER BY openAmt DESC`

const CUSTOMER_BILLS_SQL = `
WITH bill AS (
  SELECT r.FID,
         r.FBILLNO,
         r.FDATE,
         r.FENDDATE,
         r.FCUSTOMERID,
         r.FCURRENCYID,
         r.FWRITTENOFFSTATUS,
         r.FALLAMOUNTFOR,
         ISNULL(SUM(p.FPAYAMOUNTFOR), 0) AS planPay,
         ISNULL(SUM(p.FWRITTENOFFAMOUNTFOR), 0) AS planWritten
  FROM T_AR_RECEIVABLE r
  LEFT JOIN T_AR_RECEIVABLEPLAN p ON p.FID = r.FID
  JOIN T_BD_CUSTOMER c ON c.FCUSTID = r.FCUSTOMERID
  LEFT JOIN T_BD_RECCONDITION cond ON cond.FID = c.FRECCONDITIONID
  WHERE r.FDOCUMENTSTATUS = 'C'
    AND ISNULL(r.FISINIT, '0') <> '1'
    AND ISNULL(r.FCANCELSTATUS, 'A') = 'A'
    AND ISNULL(r.FSETACCOUNTTYPE, '') <> '2'
    AND r.FWRITTENOFFSTATUS IN ('A', 'B')
    AND r.FALLAMOUNTFOR > 0
    AND c.FNUMBER = @custCode
    AND ISNULL(cond.FNUMBER, '') NOT IN ('001', '003')
  GROUP BY r.FID,
           r.FBILLNO,
           r.FDATE,
           r.FENDDATE,
           r.FCUSTOMERID,
           r.FCURRENCYID,
           r.FWRITTENOFFSTATUS,
           r.FALLAMOUNTFOR
)
SELECT FBILLNO AS billNo,
       cu.FNUMBER AS currencyCode,
       cul.FNAME AS currencyName,
       CONVERT(varchar(10), FDATE, 120) AS billDate,
       CONVERT(varchar(10), FENDDATE, 120) AS dueDate,
       FWRITTENOFFSTATUS AS openStatus,
       FALLAMOUNTFOR AS billAmt,
       CASE WHEN planPay > 0 THEN planPay - planWritten ELSE FALLAMOUNTFOR END AS openAmt,
       planWritten AS writtenAmt,
       DATEDIFF(day, FENDDATE, CAST(GETDATE() AS date)) AS overdueDays
FROM bill
LEFT JOIN T_BD_CURRENCY cu ON cu.FCURRENCYID = bill.FCURRENCYID
LEFT JOIN T_BD_CURRENCY_L cul ON cul.FCURRENCYID = bill.FCURRENCYID AND cul.FLOCALEID = 2052
WHERE (CASE WHEN planPay > 0 THEN planPay - planWritten ELSE FALLAMOUNTFOR END) > 0.005
  AND FENDDATE IS NOT NULL
  AND FENDDATE < CAST(GETDATE() AS date)
  AND DATEDIFF(day, FENDDATE, CAST(GETDATE() AS date)) >= @minOverdueDays
  AND (@currencyCode = '' OR cu.FNUMBER = @currencyCode)
ORDER BY FENDDATE ASC, FBILLNO ASC`

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '').trim()
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function moneyValue(value: unknown): number {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100
}

function localDate(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseTermCodes(value: unknown): Set<string> {
  const raw = text(value)
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item && item !== 'ALL'),
  )
}

function normalizeBoolean(value: unknown, defaultValue = false): boolean {
  const normalized = text(value).toLowerCase()
  if (!normalized) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function normalizeSummaryRow(row: SqlRow, remarkMap: Map<string, OverdueArRemarkRecord>) {
  const freezeStatus = text(row.freezeStatus) || 'A'
  const freezeLimit = text(row.freezeLimit)
  const freezeOutStock = freezeStatus.toUpperCase() === 'B' && freezeLimit.toLowerCase() === 'outstock'
  const merchandiserName = text(row.merchandiserName)
  const merchandiserNo = text(row.merchandiserNo)
  const custCode = text(row.custCode)
  const currencyCode = text(row.currencyCode)
  const remarkRecord = remarkMap.get(overdueArRemarkKey(custCode, currencyCode))

  return {
    currencyCode,
    currencyName: text(row.currencyName),
    custCode,
    custName: text(row.custName),
    shortName: text(row.shortName),
    termCode: text(row.termCode),
    termName: text(row.termName),
    sellerName: text(row.sellerName),
    sellerNo: text(row.sellerNo),
    merchandiserName,
    merchandiserNo,
    merchandiser1Name: text(row.merchandiser1Name),
    merchandiser1No: text(row.merchandiser1No),
    merchandiser2Name: text(row.merchandiser2Name),
    merchandiser2No: text(row.merchandiser2No),
    followName: merchandiserName,
    followNo: merchandiserNo,
    freezeStatus,
    freezeLimit,
    freezeDate: text(row.freezeDate) || null,
    freezeOutStock,
    freezeLabel: freezeOutStock ? '已冻结出库' : '未冻结',
    billCnt: Math.max(0, Math.trunc(numberValue(row.billCnt))),
    openAmt: moneyValue(row.openAmt),
    earliestDue: text(row.earliestDue) || null,
    maxOverdueDays: Math.max(0, Math.trunc(numberValue(row.maxOverdueDays))),
    avgOverdueDays: Math.max(0, Math.round(numberValue(row.avgOverdueDays))),
    remark: remarkRecord?.remark || '',
    remarkUpdatedBy: remarkRecord?.updatedBy || '',
    remarkUpdatedAt: remarkRecord?.updatedAt || null,
  }
}

function normalizeBillRow(row: SqlRow) {
  const openStatus = text(row.openStatus)
  return {
    currencyCode: text(row.currencyCode),
    currencyName: text(row.currencyName),
    billNo: text(row.billNo),
    billDate: text(row.billDate) || null,
    dueDate: text(row.dueDate) || null,
    openStatus,
    openStatusLabel: openStatus.toUpperCase() === 'A'
      ? '未收款核销'
      : openStatus.toUpperCase() === 'B'
        ? '部分收款核销'
        : openStatus.toUpperCase() === 'C'
          ? '已收款核销'
          : openStatus || '-',
    billAmt: moneyValue(row.billAmt),
    openAmt: moneyValue(row.openAmt),
    writtenAmt: moneyValue(row.writtenAmt),
    overdueDays: Math.max(0, Math.trunc(numberValue(row.overdueDays))),
  }
}

export async function queryCustomerOverdueAr(input: QueryInput = {}) {
  const minOverdueDays = minimumOverdueDays(input.minOverdueDays)
  const [rows, remarkMap] = await Promise.all([
    queryK3SqlServer<SqlRow>((request) => {
      request.input('minOverdueDays', minOverdueDays)
      return request.query(CUSTOMER_SUMMARY_SQL)
    }),
    readOverdueArRemarkMap(),
  ])
  const keyword = text(input.keyword).toLowerCase()
  const minOpenAmt = Math.max(0, numberValue(input.minOpenAmt))
  const termCodes = parseTermCodes(input.termCodes ?? input.termCode)
  const excludeInternal = normalizeBoolean(input.excludeInternal)
  const internalCodes = excludeInternal ? internalCustomerCodes() : new Set<string>()

  const filtered = rows
    .map((row) => normalizeSummaryRow(row, remarkMap))
    .filter((row) => {
      if (EXCLUDED_TERM_CODES.has(row.termCode.toUpperCase())) return false
      if (excludeInternal && internalCodes.has(row.custCode.toUpperCase())) return false
      if (minOpenAmt > 0 && row.openAmt < minOpenAmt) return false
      if (termCodes.size && !termCodes.has(row.termCode.toUpperCase())) return false
      if (!keyword) return true

      const haystack = [
        row.custCode,
        row.custName,
        row.shortName,
        row.sellerName,
        row.merchandiserName,
        row.merchandiser1Name,
        row.merchandiser2Name,
        row.remark,
      ].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })

  const currencyTotals = new Map<string, { currencyCode: string; currencyName: string; openAmt: number }>()
  for (const row of filtered) {
    const key = row.currencyCode || row.currencyName
    const total = currencyTotals.get(key) || { currencyCode: row.currencyCode, currencyName: row.currencyName, openAmt: 0 }
    total.openAmt = moneyValue(total.openAmt + row.openAmt)
    currencyTotals.set(key, total)
  }
  const amountsByCurrency = [...currencyTotals.values()]
  const summary = {
    customerCount: new Set(filtered.map(row => row.custCode)).size,
    billCount: filtered.reduce((total, row) => total + row.billCnt, 0),
    openAmt: amountsByCurrency.length > 1 ? null : (amountsByCurrency[0]?.openAmt || 0),
    amountsByCurrency,
    maxOverdueDays: filtered.reduce((max, row) => Math.max(max, row.maxOverdueDays), 0),
  }

  return {
    rows: filtered,
    total: filtered.length,
    source: SOURCE,
    asOfDate: localDate(),
    summary,
  }
}

function minimumOverdueDays(value: unknown): number {
  return Math.min(2147483647, Math.max(0, Math.ceil(numberValue(value))))
}

export async function queryCustomerOverdueArBills(custCodeValue: unknown, input: QueryInput = {}) {
  const custCode = text(custCodeValue)
  if (!custCode) throw new CustomerOverdueArInputError('客户编码不能为空')

  const rows = await queryK3SqlServer<SqlRow>((request) => {
    sqlStringParameter(request, 'custCode', custCode)
    request.input('minOverdueDays', minimumOverdueDays(input.minOverdueDays))
    sqlStringParameter(request, 'currencyCode', text(input.currencyCode))
    return request.query(CUSTOMER_BILLS_SQL)
  })

  return {
    rows: rows.map(normalizeBillRow),
    total: rows.length,
    custCode,
    source: SOURCE,
  }
}
