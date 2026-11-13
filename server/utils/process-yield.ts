import { queryK3SqlServer, sqlBigIntParameter, sqlStringParameter } from './sqlserver'
import { k3PackageNameExpression, k3PackageTypeExpression } from './k3-package-name'

export const DEFAULT_PROCESS_YIELD_THRESHOLD = 97.5
export const MAX_PROCESS_YIELD_THRESHOLD = 100

export class ProcessYieldInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'ProcessYieldInputError'
  }
}

type ProcessYieldInput = Record<string, unknown>

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function text(value: unknown): string {
  return String(scalar(value) ?? '')
}

function trimmed(value: unknown): string {
  return text(value).trim()
}

function hasText(value: unknown): boolean {
  return trimmed(value) !== ''
}

function parseDate(value: unknown, label: string): string {
  const normalized = trimmed(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new ProcessYieldInputError(`${label}格式不正确`)
  const date = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new ProcessYieldInputError(`${label}格式不正确`)
  }
  return normalized
}

function localDate(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function localDateTime(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function dateRange(input: ProcessYieldInput): { startDate: string; endDate: string } {
  const startDate = hasText(input.startDate) ? parseDate(input.startDate, '开始日期') : localDate(-30)
  const endDate = hasText(input.endDate) ? parseDate(input.endDate, '结束日期') : localDate()
  if (endDate < startDate) throw new ProcessYieldInputError('结束日期不能早于开始日期')
  return { startDate, endDate }
}

export function normalizeProcessYieldThreshold(value: unknown): number {
  if (!hasText(value)) return DEFAULT_PROCESS_YIELD_THRESHOLD
  const parsed = Number(trimmed(value))
  if (!Number.isFinite(parsed)) return DEFAULT_PROCESS_YIELD_THRESHOLD
  return Math.min(Math.max(parsed, 0), MAX_PROCESS_YIELD_THRESHOLD)
}

function numberValue(value: unknown): number {
  const parsed = Number(scalar(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function decimalSum(values: unknown[]): number {
  let scale = 0
  let unscaled = 0n
  let fallback = 0
  let hasDecimal = false

  for (const value of values) {
    const parsed = numberValue(value)
    const textValue = String(parsed)
    const match = textValue.match(/^([+-]?)(\d+)(?:\.(\d+))?$/)
    if (!match) {
      fallback += parsed
      continue
    }

    hasDecimal = true
    const fraction = match[3] || ''
    const current = BigInt(`${match[1] === '-' ? '-' : ''}${match[2]}${fraction}`)
    if (fraction.length > scale) {
      unscaled *= 10n ** BigInt(fraction.length - scale)
      scale = fraction.length
    }
    unscaled += current * 10n ** BigInt(scale - fraction.length)
  }

  if (!hasDecimal) return fallback
  const absolute = unscaled < 0n ? -unscaled : unscaled
  const digits = absolute.toString().padStart(scale + 1, '0')
  const sign = unscaled < 0n ? '-' : ''
  const decimal = scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`
  const result = Number(decimal)
  return Number.isFinite(result) ? result + fallback : fallback
}

// 玻封 / 塑封口径与车间半成品在制（wip）共用一段 CASE，别在两张报表里各写一套
const PROCESS_YIELD_PACKAGE_TYPE_EXPRESSION = k3PackageTypeExpression('mat_l')

const PROCESS_YIELD_QUERY = `SELECT
  CONVERT(varchar(10), rpt.FDATE, 120) AS reportDate,
  ${PROCESS_YIELD_PACKAGE_TYPE_EXPRESSION} AS packageType,
  proc_l.FNAME AS processName,
  SUM(a.FQUAQTY) AS totalQua,
  SUM(a.FFAILQTY) AS totalFail
FROM T_SFC_OPTRPT rpt
JOIN T_SFC_OPTRPTENTRY entry ON entry.FID = rpt.FID
JOIN T_SFC_OPTRPTENTRY_A a ON a.FENTRYID = entry.FENTRYID
LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = entry.FMATERIALID
LEFT JOIN T_SFC_OPTRPTENTRY_B b ON b.FENTRYID = entry.FENTRYID
LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = b.FPROCESSID
WHERE rpt.FDATE >= @startDate AND rpt.FDATE <= @endDate
  AND (@processName = N'' OR proc_l.FNAME LIKE N'%' + @processName + N'%')
  AND (@packageType = N'' OR ${PROCESS_YIELD_PACKAGE_TYPE_EXPRESSION} = @packageType)
GROUP BY CONVERT(varchar(10), rpt.FDATE, 120), ${PROCESS_YIELD_PACKAGE_TYPE_EXPRESSION}, proc_l.FNAME
ORDER BY reportDate DESC, totalQua DESC`

const STOCK_IN_ACHIEVEMENT_QUERY = `WITH query_params AS (
  SELECT CAST(@startDate AS varchar(19)) AS start_date, CAST(@endDate AS varchar(19)) AS end_date
), date_plans AS (
  SELECT DISTINCT op.FID AS planId, op.FBILLNO AS billNo,
    LTRIM(RTRIM(COALESCE(mat_l.FSPECIFICATION, ''))) AS specification
  FROM T_SFC_OPERPLANNING op
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = op.FID
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FPRODUCTID AND mat_l.FLOCALEID = 2052
  LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = d.FPROCESSID AND proc_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE op.FDOCUMENTSTATUS = 'C' AND op.FCANCELSTATUS = 'A'
    AND ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
    AND d.REPORT_DATE IS NOT NULL AND d.REPORT_DATE <> ''
    AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
    AND ((proc_l.FNAME LIKE N'%入库%' OR proc_l.FNAME = N'玻封包装') OR proc_l.FNAME = N'测试分选')
), packaging_data AS (
  SELECT dp.planId,
    SUM(CASE WHEN (proc_l.FNAME LIKE N'%入库%' OR proc_l.FNAME = N'玻封包装')
      AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
      THEN ISNULL(b.FQUALIFIEDQTY, 0) ELSE 0 END) AS stockInQty,
    CASE WHEN SUM(CASE WHEN proc_l.FNAME LIKE N'%固晶%' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) > 0
      THEN SUM(CASE WHEN proc_l.FNAME LIKE N'%固晶%' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END)
      ELSE SUM(CASE WHEN d.FISFIRSTOPER = '1' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) END AS inputQty
  FROM date_plans dp
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = dp.planId
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  JOIN T_SFC_OPERPLANNINGDETAIL_B b ON b.FDETAILID = d.FDETAILID
  LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = d.FPROCESSID AND proc_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
  GROUP BY dp.planId
), testing_data AS (
  SELECT dp.planId,
    SUM(ISNULL(d.FOPERQTY, 0)) AS csfxInputQty,
    SUM(ISNULL(b.FQUALIFIEDQTY, 0)) AS csfxQualifiedQty
  FROM date_plans dp
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = dp.planId
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  JOIN T_SFC_OPERPLANNINGDETAIL_B b ON b.FDETAILID = d.FDETAILID
  LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = d.FPROCESSID AND proc_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
    AND proc_l.FNAME = N'测试分选'
    AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
  GROUP BY dp.planId
)
SELECT dp.planId, dp.billNo,
  LTRIM(RTRIM(CASE
    WHEN dp.specification = '' THEN N'未维护封装'
    WHEN LEFT(LTRIM(dp.specification), 5) = N'LL-34' THEN N'LL-34'
    WHEN LEFT(LTRIM(dp.specification), 5) = N'LL-41' THEN N'LL-41'
    WHEN CHARINDEX('/', dp.specification) > 0 THEN LEFT(dp.specification, CHARINDEX('/', dp.specification) - 1)
    WHEN CHARINDEX(N'／', dp.specification) > 0 THEN LEFT(dp.specification, CHARINDEX(N'／', dp.specification) - 1)
    ELSE dp.specification END)) AS packageName,
  ISNULL(pd.inputQty, 0) AS inputQty,
  ISNULL(pd.stockInQty, 0) AS stockInQty,
  ISNULL(td.csfxInputQty, 0) AS csfxInputQty,
  ISNULL(td.csfxQualifiedQty, 0) AS csfxQualifiedQty
FROM date_plans dp
LEFT JOIN packaging_data pd ON pd.planId = dp.planId
LEFT JOIN testing_data td ON td.planId = dp.planId
ORDER BY dp.billNo DESC`

const DASHBOARD_QUERY = `WITH query_params AS (
  SELECT CAST(@startDate AS varchar(19)) AS start_date,
         CAST(@endDate AS varchar(19)) AS end_date,
         CAST(@thresholdRatio AS decimal(9,6)) AS threshold_ratio
), packaging_plan_metrics AS (
  SELECT op.FID AS planId, op.FBILLNO AS billNo,
    LTRIM(RTRIM(CASE
      WHEN LTRIM(RTRIM(COALESCE(mat_l.FSPECIFICATION, ''))) = '' THEN N'未维护封装'
      WHEN LEFT(LTRIM(RTRIM(mat_l.FSPECIFICATION)), 5) = N'LL-34' THEN N'LL-34'
      WHEN LEFT(LTRIM(RTRIM(mat_l.FSPECIFICATION)), 5) = N'LL-41' THEN N'LL-41'
      WHEN CHARINDEX('/', mat_l.FSPECIFICATION) > 0 THEN LEFT(mat_l.FSPECIFICATION, CHARINDEX('/', mat_l.FSPECIFICATION) - 1)
      WHEN CHARINDEX(N'／', mat_l.FSPECIFICATION) > 0 THEN LEFT(mat_l.FSPECIFICATION, CHARINDEX(N'／', mat_l.FSPECIFICATION) - 1)
      ELSE mat_l.FSPECIFICATION END)) AS packageName,
    SUM(CASE WHEN (proc_l.FNAME LIKE N'%入库%' OR proc_l.FNAME = N'玻封包装')
      AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
      THEN ISNULL(b.FQUALIFIEDQTY, 0) ELSE 0 END) AS packagingQualifiedQty,
    SUM(CASE WHEN (proc_l.FNAME LIKE N'%入库%' OR proc_l.FNAME = N'玻封包装')
      AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
      THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) AS packagingReportInputQty,
    CASE WHEN SUM(CASE WHEN proc_l.FNAME LIKE N'%固晶%' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) > 0
      THEN SUM(CASE WHEN proc_l.FNAME LIKE N'%固晶%' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END)
      ELSE SUM(CASE WHEN d.FISFIRSTOPER = '1' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) END AS packagingInputQty
  FROM T_SFC_OPERPLANNING op
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = op.FID
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  LEFT JOIN T_SFC_OPERPLANNINGDETAIL_B b ON b.FDETAILID = d.FDETAILID
  LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FPRODUCTID AND mat_l.FLOCALEID = 2052
  LEFT JOIN T_ENG_PROCESS_L proc_l ON proc_l.FID = d.FPROCESSID AND proc_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE op.FDOCUMENTSTATUS = 'C' AND op.FCANCELSTATUS = 'A'
    AND ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
    AND EXISTS (
      SELECT 1 FROM T_SFC_OPERPLANNINGSEQ s2
      JOIN T_SFC_OPERPLANNINGDETAIL d2 ON d2.FENTRYID = s2.FENTRYID
      LEFT JOIN T_ENG_PROCESS_L proc2_l ON proc2_l.FID = d2.FPROCESSID AND proc2_l.FLOCALEID = 2052
      WHERE s2.FID = op.FID AND ISNULL(d2.FOPTCTRLCODEID, 0) <> 226304
        AND (proc2_l.FNAME LIKE N'%入库%' OR proc2_l.FNAME = N'玻封包装')
        AND d2.REPORT_DATE IS NOT NULL AND d2.REPORT_DATE <> ''
        AND d2.REPORT_DATE >= qp.start_date AND d2.REPORT_DATE <= qp.end_date)
  GROUP BY op.FID, op.FBILLNO, mat_l.FSPECIFICATION
), packaging_package_metrics AS (
  SELECT packageName, SUM(packagingInputQty) AS packagingInputQty,
    SUM(packagingReportInputQty) AS packagingReportInputQty,
    SUM(packagingQualifiedQty) AS packagingQualifiedQty, COUNT(*) AS packagingPlanCount,
    SUM(CASE WHEN packagingReportInputQty > 0
      AND packagingQualifiedQty >= packagingReportInputQty * qp.threshold_ratio THEN 1 ELSE 0 END) AS packagingPassedPlanCount
  FROM packaging_plan_metrics CROSS JOIN query_params qp GROUP BY packageName
), testing_report_metrics AS (
  SELECT entry.FOPTPLANID AS planId,
    SUM(ISNULL(a.FQUAQTY, 0) + ISNULL(entry.F_UNW_QTY_83G, 0) - ISNULL(entry.F_UNW_QTY_YIU, 0)) AS testingStraightThroughQty,
    SUM(ISNULL(entry.F_ZRSL, 0)) AS testingPreviousInputQty
  FROM T_SFC_OPTRPT rpt
  JOIN T_SFC_OPTRPTENTRY entry ON entry.FID = rpt.FID
  JOIN T_SFC_OPTRPTENTRY_A a ON a.FENTRYID = entry.FENTRYID
  LEFT JOIN T_SFC_OPTRPTENTRY_B report_b ON report_b.FENTRYID = entry.FENTRYID
  LEFT JOIN T_ENG_PROCESS_L report_proc_l ON report_proc_l.FID = report_b.FPROCESSID AND report_proc_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE rpt.FDOCUMENTSTATUS = 'C' AND rpt.FCANCELSTATUS = 'A'
    AND rpt.FDATE >= qp.start_date AND rpt.FDATE <= qp.end_date
    AND report_proc_l.FNAME = N'测试分选'
  GROUP BY entry.FOPTPLANID
), testing_plan_metrics AS (
  SELECT op.FID AS planId, op.FBILLNO AS billNo,
    LTRIM(RTRIM(CASE
      WHEN LTRIM(RTRIM(COALESCE(mat_l.FSPECIFICATION, ''))) = '' THEN N'未维护封装'
      WHEN LEFT(LTRIM(RTRIM(mat_l.FSPECIFICATION)), 5) = N'LL-34' THEN N'LL-34'
      WHEN LEFT(LTRIM(RTRIM(mat_l.FSPECIFICATION)), 5) = N'LL-41' THEN N'LL-41'
      WHEN CHARINDEX('/', mat_l.FSPECIFICATION) > 0 THEN LEFT(mat_l.FSPECIFICATION, CHARINDEX('/', mat_l.FSPECIFICATION) - 1)
      WHEN CHARINDEX(N'／', mat_l.FSPECIFICATION) > 0 THEN LEFT(mat_l.FSPECIFICATION, CHARINDEX(N'／', mat_l.FSPECIFICATION) - 1)
      ELSE mat_l.FSPECIFICATION END)) AS packageName,
    report_metrics.testingPreviousInputQty, report_metrics.testingStraightThroughQty
  FROM T_SFC_OPERPLANNING op
  JOIN testing_report_metrics report_metrics ON report_metrics.planId = op.FID
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = op.FID
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  LEFT JOIN T_SFC_OPERPLANNINGDETAIL_B b ON b.FDETAILID = d.FDETAILID
  LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FPRODUCTID AND mat_l.FLOCALEID = 2052
  WHERE op.FDOCUMENTSTATUS = 'C' AND op.FCANCELSTATUS = 'A'
    AND ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
  GROUP BY op.FID, op.FBILLNO, mat_l.FSPECIFICATION,
    report_metrics.testingPreviousInputQty, report_metrics.testingStraightThroughQty
), testing_package_metrics AS (
  SELECT packageName, SUM(testingPreviousInputQty) AS testingPreviousInputQty,
    SUM(testingStraightThroughQty) AS testingStraightThroughQty, COUNT(*) AS testingPlanCount,
    SUM(CASE WHEN testingPreviousInputQty > 0 THEN 1 ELSE 0 END) AS testingPassedPlanCount
  FROM testing_plan_metrics GROUP BY packageName
)
SELECT COALESCE(p.packageName, t.packageName) AS packageName,
  ISNULL(p.packagingInputQty, 0) AS packagingInputQty,
  ISNULL(p.packagingReportInputQty, 0) AS packagingReportInputQty,
  ISNULL(p.packagingQualifiedQty, 0) AS packagingQualifiedQty,
  ISNULL(p.packagingPlanCount, 0) AS packagingPlanCount,
  ISNULL(p.packagingPassedPlanCount, 0) AS packagingPassedPlanCount,
  ISNULL(t.testingPreviousInputQty, 0) AS testingPreviousInputQty,
  ISNULL(t.testingStraightThroughQty, 0) AS testingStraightThroughQty,
  ISNULL(t.testingPreviousInputQty, 0) AS testingInputQty,
  ISNULL(t.testingStraightThroughQty, 0) AS testingQualifiedQty,
  ISNULL(t.testingPlanCount, 0) AS testingPlanCount,
  ISNULL(t.testingPassedPlanCount, 0) AS testingPassedPlanCount
FROM packaging_package_metrics p
FULL OUTER JOIN testing_package_metrics t ON t.packageName = p.packageName
ORDER BY COALESCE(p.packageName, t.packageName)`

function processYieldPackageExpression(alias: string): string {
  return k3PackageNameExpression(alias)
}

const PACKAGING_DETAILS_QUERY = `WITH query_params AS (
  SELECT CAST(@startDate AS varchar(19)) AS start_date, CAST(@endDate AS varchar(19)) AS end_date,
         CAST(@packageName AS nvarchar(100)) AS package_name, CAST(@planNo AS nvarchar(100)) AS plan_no
), stock_in_process AS (
  SELECT FID FROM T_ENG_PROCESS_L WHERE FLOCALEID = 2052 AND (FNAME LIKE N'%入库%' OR FNAME = N'玻封包装')
), solid_crystal_process AS (
  SELECT FID FROM T_ENG_PROCESS_L WHERE FLOCALEID = 2052 AND FNAME LIKE N'%固晶%'
), plan_packaging AS (
  SELECT op.FID AS planId, op.FBILLNO AS planNo, op.FMONumber AS moNumber, op.FMOEntrySeq AS moEntrySeq,
    CONVERT(varchar(10), mo.FDATE, 120) AS orderDate, mat.FNUMBER AS materialNumber, mat_l.FNAME AS materialName,
    ${processYieldPackageExpression('mat_l')} AS packageName,
    SUM(ISNULL(d.FOPERQTY, 0)) AS packagingInputQty, SUM(ISNULL(b.FQUALIFIEDQTY, 0)) AS packagingQualifiedQty,
    MAX(d.REPORT_DATE) AS packagingReportDate
  FROM T_SFC_OPERPLANNINGDETAIL d JOIN stock_in_process sip ON sip.FID = d.FPROCESSID
  JOIN T_SFC_OPERPLANNINGSEQ s ON s.FENTRYID = d.FENTRYID JOIN T_SFC_OPERPLANNING op ON op.FID = s.FID
  LEFT JOIN T_SFC_OPERPLANNINGDETAIL_B b ON b.FDETAILID = d.FDETAILID
  LEFT JOIN T_PRD_MO mo ON mo.FBILLNO = op.FMONumber AND mo.FDOCUMENTSTATUS = 'C'
  LEFT JOIN T_BD_MATERIAL mat ON mat.FMATERIALID = op.FPRODUCTID
  LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FPRODUCTID AND mat_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE op.FDOCUMENTSTATUS = 'C' AND op.FCANCELSTATUS = 'A' AND ISNULL(d.FOPTCTRLCODEID, 0) <> 226304
    AND d.REPORT_DATE IS NOT NULL AND d.REPORT_DATE <> '' AND d.REPORT_DATE >= qp.start_date AND d.REPORT_DATE <= qp.end_date
    AND (qp.package_name = N'' OR ${processYieldPackageExpression('mat_l')} = qp.package_name)
    AND (qp.plan_no = N'' OR op.FBILLNO LIKE N'%' + qp.plan_no + N'%')
  GROUP BY op.FID, op.FBILLNO, op.FMONumber, op.FMOEntrySeq, mo.FDATE, mat.FNUMBER, mat_l.FNAME, mat_l.FSPECIFICATION
), ranked AS (
  SELECT *, COUNT(1) OVER() AS totalCount, ROW_NUMBER() OVER (ORDER BY packageName, planNo) AS rn FROM plan_packaging
), paged AS (
  SELECT * FROM ranked WHERE rn > @offset AND rn <= @endRow
), solid_metrics AS (
  SELECT p.planId, CASE WHEN SUM(CASE WHEN scp.FID IS NOT NULL THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) > 0
    THEN SUM(CASE WHEN scp.FID IS NOT NULL THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END)
    ELSE SUM(CASE WHEN d.FISFIRSTOPER = '1' THEN ISNULL(d.FOPERQTY, 0) ELSE 0 END) END AS solidCrystalInputQty
  FROM paged p JOIN T_SFC_OPERPLANNINGSEQ s ON s.FID = p.planId
  JOIN T_SFC_OPERPLANNINGDETAIL d ON d.FENTRYID = s.FENTRYID
  LEFT JOIN solid_crystal_process scp ON scp.FID = d.FPROCESSID
  WHERE ISNULL(d.FOPTCTRLCODEID, 0) <> 226304 GROUP BY p.planId
)
SELECT p.planId, p.planNo, p.moNumber, p.moEntrySeq, p.orderDate, p.materialNumber, p.materialName, p.packageName,
  p.packagingInputQty, p.packagingQualifiedQty, p.packagingReportDate, ISNULL(sm.solidCrystalInputQty, 0) AS solidCrystalInputQty, p.totalCount
FROM paged p LEFT JOIN solid_metrics sm ON sm.planId = p.planId ORDER BY p.packageName, p.planNo`

const TESTING_DETAILS_QUERY = `WITH query_params AS (
  SELECT CAST(@startDate AS varchar(19)) AS start_date, CAST(@endDate AS varchar(19)) AS end_date,
         CAST(@packageName AS nvarchar(100)) AS package_name, CAST(@planNo AS nvarchar(100)) AS plan_no
), testing_process AS (
  SELECT FID FROM T_ENG_PROCESS_L WHERE FLOCALEID = 2052 AND FNAME = N'测试分选'
), plan_testing AS (
  SELECT op.FID AS planId, op.FBILLNO AS planNo, op.FMONumber AS moNumber, op.FMOEntrySeq AS moEntrySeq,
    CONVERT(varchar(10), mo.FDATE, 120) AS orderDate, mat.FNUMBER AS materialNumber, mat_l.FNAME AS materialName,
    ${processYieldPackageExpression('mat_l')} AS packageName,
    SUM(ISNULL(a.FQUAQTY, 0)) AS testingReportQualifiedQty, SUM(ISNULL(entry.F_UNW_QTY_83G, 0)) AS testingTailQty,
    SUM(ISNULL(entry.F_UNW_QTY_YIU, 0)) AS testingIncreaseQty,
    SUM(ISNULL(a.FQUAQTY, 0) + ISNULL(entry.F_UNW_QTY_83G, 0) - ISNULL(entry.F_UNW_QTY_YIU, 0)) AS testingStraightThroughQty,
    SUM(ISNULL(entry.F_ZRSL, 0)) AS testingPreviousInputQty, MAX(rpt.FDATE) AS testingReportDate
  FROM T_SFC_OPTRPT rpt JOIN T_SFC_OPTRPTENTRY entry ON entry.FID = rpt.FID
  JOIN T_SFC_OPTRPTENTRY_A a ON a.FENTRYID = entry.FENTRYID JOIN T_SFC_OPTRPTENTRY_B report_b ON report_b.FENTRYID = entry.FENTRYID
  JOIN testing_process tp ON tp.FID = report_b.FPROCESSID JOIN T_SFC_OPERPLANNING op ON op.FID = entry.FOPTPLANID
  LEFT JOIN T_PRD_MO mo ON mo.FBILLNO = op.FMONumber AND mo.FDOCUMENTSTATUS = 'C'
  LEFT JOIN T_BD_MATERIAL mat ON mat.FMATERIALID = op.FPRODUCTID
  LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FPRODUCTID AND mat_l.FLOCALEID = 2052
  CROSS JOIN query_params qp
  WHERE rpt.FDOCUMENTSTATUS = 'C' AND rpt.FCANCELSTATUS = 'A' AND op.FDOCUMENTSTATUS = 'C' AND op.FCANCELSTATUS = 'A'
    AND rpt.FDATE >= qp.start_date AND rpt.FDATE <= qp.end_date
    AND (qp.package_name = N'' OR ${processYieldPackageExpression('mat_l')} = qp.package_name)
    AND (qp.plan_no = N'' OR op.FBILLNO LIKE N'%' + qp.plan_no + N'%')
  GROUP BY op.FID, op.FBILLNO, op.FMONumber, op.FMOEntrySeq, mo.FDATE, mat.FNUMBER, mat_l.FNAME, mat_l.FSPECIFICATION
), ranked AS (
  SELECT *, COUNT(1) OVER() AS totalCount, ROW_NUMBER() OVER (ORDER BY packageName, planNo) AS rn FROM plan_testing
)
SELECT planId, planNo, moNumber, moEntrySeq, orderDate, materialNumber, materialName, packageName,
  testingReportQualifiedQty, testingTailQty, testingIncreaseQty, testingPreviousInputQty, testingStraightThroughQty,
  testingReportDate, totalCount FROM ranked WHERE rn > @offset AND rn <= @endRow ORDER BY packageName, planNo`

export async function queryProcessYieldData(input: ProcessYieldInput = {}): Promise<Record<string, unknown>[]> {
  const range = dateRange(input)
  const processName = trimmed(input.processName)
  const requestedPackageType = trimmed(input.packageType)
  const packageType = requestedPackageType === '玻封' || requestedPackageType === '塑封' ? requestedPackageType : ''
  const rows = await queryK3SqlServer(async (request) => {
    sqlStringParameter(request, 'startDate', `${range.startDate} 00:00:00`)
    sqlStringParameter(request, 'endDate', `${range.endDate} 23:59:59`)
    sqlStringParameter(request, 'processName', processName)
    sqlStringParameter(request, 'packageType', packageType)
    return request.query(PROCESS_YIELD_QUERY)
  })
  return rows
    .filter((row) => hasText(row.processName))
    .map((row) => ({
      reportDate: row.reportDate,
      packageType: row.packageType,
      processName: row.processName,
      totalQua: numberValue(row.totalQua),
      totalFail: numberValue(row.totalFail),
    }))
}

export async function queryStockInAchievementData(input: ProcessYieldInput = {}): Promise<Record<string, unknown>[]> {
  const range = dateRange(input)
  const rows = await queryK3SqlServer(async (request) => {
    sqlStringParameter(request, 'startDate', `${range.startDate} 00:00:00`)
    sqlStringParameter(request, 'endDate', `${range.endDate} 23:59:59`)
    return request.query(STOCK_IN_ACHIEVEMENT_QUERY)
  })
  return rows.map((row) => ({
    planId: numberValue(row.planId),
    billNo: row.billNo,
    packageName: row.packageName,
    inputQty: numberValue(row.inputQty),
    stockInQty: numberValue(row.stockInQty),
    csfxInputQty: numberValue(row.csfxInputQty),
    csfxQualifiedQty: numberValue(row.csfxQualifiedQty),
  }))
}

function mapDashboardRow(row: any): Record<string, unknown> {
  return {
    packageName: row.packageName,
    packagingInputQty: numberValue(row.packagingInputQty),
    packagingReportInputQty: numberValue(row.packagingReportInputQty),
    packagingQualifiedQty: numberValue(row.packagingQualifiedQty),
    packagingPlanCount: numberValue(row.packagingPlanCount),
    packagingPassedPlanCount: numberValue(row.packagingPassedPlanCount),
    testingPreviousInputQty: numberValue(row.testingPreviousInputQty),
    testingStraightThroughQty: numberValue(row.testingStraightThroughQty),
    testingInputQty: numberValue(row.testingInputQty),
    testingQualifiedQty: numberValue(row.testingQualifiedQty),
    testingPlanCount: numberValue(row.testingPlanCount),
    testingPassedPlanCount: numberValue(row.testingPassedPlanCount),
  }
}

export async function queryProcessYieldDashboard(input: ProcessYieldInput = {}): Promise<Record<string, unknown>> {
  const range = dateRange(input)
  const threshold = normalizeProcessYieldThreshold(input.threshold)
  const startDate = `${range.startDate} 00:00:00`
  const endDate = `${range.endDate} 23:59:59`
  const rows = await queryK3SqlServer(async (request) => {
    sqlStringParameter(request, 'startDate', startDate)
    sqlStringParameter(request, 'endDate', endDate)
    sqlStringParameter(request, 'thresholdRatio', String(threshold / 100))
    return request.query(DASHBOARD_QUERY)
  })
  const mappedRows = rows.map(mapDashboardRow)
  const sum = (field: string) => decimalSum(mappedRows.map((row) => row[field]))
  const summary = {
    packageCount: mappedRows.length,
    packagingInputQty: sum('packagingInputQty'),
    packagingReportInputQty: sum('packagingReportInputQty'),
    packagingQualifiedQty: sum('packagingQualifiedQty'),
    packagingPlanCount: sum('packagingPlanCount'),
    packagingPassedPlanCount: sum('packagingPassedPlanCount'),
    testingPreviousInputQty: sum('testingPreviousInputQty'),
    testingStraightThroughQty: sum('testingStraightThroughQty'),
    testingInputQty: sum('testingInputQty'),
    testingQualifiedQty: sum('testingQualifiedQty'),
    testingPlanCount: sum('testingPlanCount'),
    testingPassedPlanCount: sum('testingPassedPlanCount'),
  }
  return { rows: mappedRows, summary, generatedAt: localDateTime() }
}

function rate(qualified: number, input: number): number | null {
  if (input <= 0) return null
  return Number(((qualified * 100) / input).toFixed(4))
}

function packagingStatus(reportDate: unknown, input: number, qualified: number, thresholdRatio: number): string {
  if (input <= 0) return '无投入数据'
  if (!hasText(reportDate)) return '待汇报'
  return qualified >= input * thresholdRatio ? '已达标' : '已汇报未达标'
}

function testingStatus(reportDate: unknown, input: number): string {
  if (input <= 0) return '无投入数据'
  return hasText(reportDate) ? '已汇报' : '待汇报'
}

function overallStatus(packaging: string, testing: string): string {
  if (packaging === '无投入数据' && testing === '无投入数据') return '无投入数据'
  if (packaging === '待汇报' || testing === '待汇报') return '待汇报'
  if (packaging === '已汇报未达标' || testing === '已汇报未达标') return '已汇报未达标'
  if (packaging === '已汇报' || testing === '已汇报') return '已汇报'
  return '已达标'
}

function mapPlanDetailRow(row: any, thresholdRatio: number, testingMetric: boolean): Record<string, unknown> {
  const solidCrystalInputQty = testingMetric ? 0 : numberValue(row.solidCrystalInputQty)
  const packagingInputQty = testingMetric ? 0 : numberValue(row.packagingInputQty)
  const packagingQualifiedQty = testingMetric ? 0 : numberValue(row.packagingQualifiedQty)
  const packagingReportDate = testingMetric ? null : row.packagingReportDate
  const testingInputQty = testingMetric ? numberValue(row.testingPreviousInputQty) : 0
  const testingReportQualifiedQty = testingMetric ? numberValue(row.testingReportQualifiedQty) : 0
  const testingTailQty = testingMetric ? numberValue(row.testingTailQty) : 0
  const testingIncreaseQty = testingMetric ? numberValue(row.testingIncreaseQty) : 0
  const testingQualifiedQty = testingMetric ? numberValue(row.testingStraightThroughQty) : 0
  const testingReportDate = testingMetric ? row.testingReportDate : null
  const packagingState = packagingStatus(packagingReportDate, packagingInputQty, packagingQualifiedQty, thresholdRatio)
  const testingState = testingStatus(testingReportDate, testingInputQty)
  return {
    planId: numberValue(row.planId),
    planNo: row.planNo,
    moNumber: row.moNumber,
    moEntrySeq: numberValue(row.moEntrySeq),
    orderDate: row.orderDate,
    materialNumber: row.materialNumber,
    materialName: row.materialName,
    packageName: row.packageName,
    solidCrystalInputQty,
    packagingInputQty,
    packagingQualifiedQty,
    packagingReportDate,
    packagingQualifiedRate: rate(packagingQualifiedQty, packagingInputQty),
    packagingRate: rate(packagingQualifiedQty, solidCrystalInputQty),
    packagingStatus: packagingState,
    testingReportQualifiedQty,
    testingTailQty,
    testingIncreaseQty,
    testingPreviousInputQty: testingInputQty,
    testingStraightThroughQty: testingQualifiedQty,
    testingInputQty,
    testingQualifiedQty,
    testingReportDate,
    testingRate: rate(testingQualifiedQty, testingInputQty),
    testingStatus: testingState,
    overallStatus: overallStatus(packagingState, testingState),
  }
}

export async function queryProcessYieldPlanDetails(input: ProcessYieldInput = {}): Promise<Record<string, unknown>> {
  const range = dateRange(input)
  const packageName = trimmed(input.packageName)
  const planNo = trimmed(input.planNo)
  const testingMetric = trimmed(input.metricKey).toLowerCase() === 'testing'
  const thresholdRatio = normalizeProcessYieldThreshold(input.threshold) / 100
  const pageNum = Math.max(Number(scalar(input.pageNum) || 1), 1)
  const pageSize = Math.min(Math.max(Number(scalar(input.pageSize) || 50), 1), 5_000)
  if (!Number.isInteger(pageNum) || !Number.isInteger(pageSize)) throw new ProcessYieldInputError('分页参数不正确')
  const offset = (pageNum - 1) * pageSize
  const rows = await queryK3SqlServer(async (request) => {
    sqlStringParameter(request, 'startDate', `${range.startDate} 00:00:00`)
    sqlStringParameter(request, 'endDate', `${range.endDate} 23:59:59`)
    sqlStringParameter(request, 'packageName', packageName)
    sqlStringParameter(request, 'planNo', planNo)
    sqlBigIntParameter(request, 'offset', offset)
    sqlBigIntParameter(request, 'endRow', offset + pageSize)
    return request.query(testingMetric ? TESTING_DETAILS_QUERY : PACKAGING_DETAILS_QUERY)
  })
  const total = rows.length ? numberValue(rows[0].totalCount) : 0
  return {
    rows: rows.map((row) => mapPlanDetailRow(row, thresholdRatio, testingMetric)),
    total,
    pageNum,
    pageSize,
    generatedAt: localDateTime(),
  }
}
