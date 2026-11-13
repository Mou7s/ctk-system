import { getK3SqlServerPool, sqlStringParameter, withK3SqlServerTransaction } from './sqlserver'

export class ExecuteSqlInputError extends Error {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'ExecuteSqlInputError'
  }
}

const UPDATE_REPORT_DATE_SQL = `
UPDATE detail
SET detail.REPORT_DATE = CONVERT(varchar(100), report.FDATE, 120)
FROM T_SFC_OPERPLANNINGDETAIL AS detail
JOIN (
  SELECT report.FDATE, entry.FSOURCEBILLNO, entry.FOPERNUMBER
  FROM T_SFC_OPTRPTENTRY AS entry
  LEFT JOIN T_SFC_OPTRPT AS report ON report.FID = entry.FID
) AS report
  ON detail.FBARCODE = report.FSOURCEBILLNO + '-0-' + CONVERT(varchar, report.FOPERNUMBER)
WHERE CONVERT(varchar(100), report.FDATE, 120) LIKE @monthPattern`

const RESET_PICKING_FLAG_SQL = `
UPDATE T_SFC_OPERPLANNINGDETAIL
SET F_LL = ''
WHERE REPORT_DATE LIKE @monthPattern`

const MARK_UNPICKED_SQL = `
UPDATE T_SFC_OPERPLANNINGDETAIL
SET F_LL = NCHAR(26410) + NCHAR(39046) + NCHAR(26009)
WHERE FDETAILID IN (
  SELECT FDETAILID
  FROM (
    SELECT detail.FDETAILID,
      planning.FBILLNO,
      planning.FMONumber,
      planning.FMOEntrySeq,
      detail.FOperNumber,
      detail.FProcessId,
      detail.REPORT_DATE
    FROM T_SFC_OPERPLANNING AS planning
    LEFT JOIN T_SFC_OPERPLANNINGSEQ AS sequence
      ON planning.FID = sequence.FID
    LEFT JOIN T_SFC_OPERPLANNINGDETAIL AS detail
      ON sequence.FENTRYID = detail.FENTRYID
    LEFT JOIN (
      SELECT bom.FMOBILLNO,
        bom.FMOENTRYSEQ,
        bomEntry.FOperID,
        bomEntry.FMUSTQTY,
        bomEntryQuantity.FPICKEDQTY
      FROM T_PRD_PPBOM AS bom
      LEFT JOIN T_PRD_PPBOMENTRY AS bomEntry
        ON bom.FID = bomEntry.FID
      LEFT JOIN T_PRD_PICKMTRLDATA AS picked
        ON picked.FPPBOMENTRYID = bomEntry.FENTRYID
      LEFT JOIN T_PRD_PPBOMENTRY_Q AS bomEntryQuantity
        ON bomEntryQuantity.FENTRYID = bomEntry.FENTRYID
      WHERE ISNULL(bomEntry.FMUSTQTY, 0) - ISNULL(bomEntryQuantity.FPICKEDQTY, 0) > 0.000001
    ) AS material
      ON planning.FMONumber = material.FMOBILLNO
      AND planning.FMOEntrySeq = material.FMOENTRYSEQ
      AND detail.FOperNumber = material.FOperID
    WHERE material.FMOBILLNO IS NOT NULL
      AND detail.REPORT_DATE LIKE @monthPattern
  ) AS candidates
)`

type UpdateDetail = {
  date: string
  success: boolean
  reportDateUpdated: number
  llResetCount: number
  unpickedMarkedCount: number
  message?: string
}

export type ExecuteSqlStep = {
  name: string
  success: boolean
  affectedRows?: number
}

export type ExecuteSqlDetail = {
  success: boolean
  steps: ExecuteSqlStep[]
  affectedRows?: number
  durationMs?: number
  message?: string
}

const HANDLE_COST_INDEX_SQL = `
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'ALTER INDEX ALL ON ' + QUOTENAME(name) + N' REBUILD;'
FROM sysobjects
WHERE xtype = 'U'
  AND name IN (
    'T_HS_OUTACCTG','T_HS_CALDINENSIONS','T_FA_ACCTPOLICY','T_CB_COSTCENTER',
    'T_CB_COSTCALEXPENSEDETAIL','T_CB_COSTCALEXPENSE','T_CB_COSTCALEXPENSEDETAIL_H',
    'T_CB_COSTCALEXPENSE_H','T_CB_PROORDERTYPE','T_CB_PROORDERINFO',
    'T_CB_PROORDERINFO_H','T_CB_PRORDERDIME','T_BD_MATERIAL','T_BD_MATERIALBASE',
    'T_BD_ACCOUNTCALENDAR','T_BD_ACCOUNTPERIOD','T_HS_OUTINSTOCKSEQ',
    'T_HS_OUTINSTOCKSEQ_H','T_CB_COSTALLORESULTSEND_H','T_CB_COSTALLORESULTREC_H'
  )
  AND name NOT LIKE 'TMP%';
EXEC sp_executesql @sql`

const HANDLE_COST_STATISTICS_SQL = `
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'UPDATE STATISTICS ' + QUOTENAME(name) + N';'
FROM sysobjects
WHERE xtype = 'U'
  AND name IN (
    'T_HS_OUTACCTG','T_HS_CALDINENSIONS','T_FA_ACCTPOLICY','T_CB_COSTCENTER',
    'T_CB_COSTCALEXPENSEDETAIL','T_CB_COSTCALEXPENSE','T_CB_COSTCALEXPENSEDETAIL_H',
    'T_CB_COSTCALEXPENSE_H','T_CB_PROORDERTYPE','T_CB_PROORDERINFO',
    'T_CB_PROORDERINFO_H','T_CB_PRORDERDIME','T_BD_MATERIAL','T_BD_MATERIALBASE',
    'T_BD_ACCOUNTCALENDAR','T_BD_ACCOUNTPERIOD','T_HS_OUTINSTOCKSEQ',
    'T_HS_OUTINSTOCKSEQ_H','T_CB_COSTALLORESULTSEND_H','T_CB_COSTALLORESULTREC_H'
  )
  AND name NOT LIKE 'TMP%';
EXEC sp_executesql @sql`

const REBUILD_ALL_INDEXES_SQL = `
DECLARE @sql NVARCHAR(1000) = N'DBCC DBREINDEX(@TABLE_NAME) WITH NO_INFOMSGS';
DECLARE @tbl NVARCHAR(1000) = N'';
DECLARE tblcur CURSOR FOR
  SELECT [NAME]
  FROM sys.tables
  WHERE [NAME] NOT LIKE 'TMP%'
    AND [NAME] NOT LIKE 'Z[_]%'
  ORDER BY 1;
OPEN tblcur;
FETCH NEXT FROM tblcur INTO @tbl;
WHILE @@FETCH_STATUS = 0
BEGIN
  EXEC SP_EXECUTESQL @sql, N'@TABLE_NAME NVARCHAR(1000)', @tbl;
  FETCH NEXT FROM tblcur INTO @tbl;
END;
CLOSE tblcur;
DEALLOCATE tblcur`

// Preserve the current Java SQL exactly during migration. The existing
// predicate intentionally remains unchanged until the business confirms
// whether NULL F_GONGXUHAO rows should also be included.
const WRITE_TO_MO_SQL = `
UPDATE T_PRD_MOENTRY
SET T_PRD_MOENTRY.F_GONGXUHAO = ISNULL(T_SFC_OPERPLANNING.FBILLNO, '')
FROM T_PRD_MOENTRY
LEFT JOIN T_PRD_MO ON T_PRD_MOENTRY.FID = T_PRD_MO.FID
LEFT JOIN T_SFC_OPERPLANNING
  ON T_SFC_OPERPLANNING.FMONUMBER = T_PRD_MO.FBILLNO
  AND T_SFC_OPERPLANNING.FMOENTRYSEQ = T_PRD_MOENTRY.FSEQ
WHERE T_PRD_MOENTRY.F_GONGXUHAO IS NOT NULL`

function normalizeMonth(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  const month = String(raw ?? '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ExecuteSqlInputError('月份格式不正确')
  }
  return month
}

function affectedRows(result: { rowsAffected?: unknown }): number {
  const rowsAffected = result.rowsAffected
  if (!Array.isArray(rowsAffected)) return 0
  const count = Number(rowsAffected[0])
  return Number.isFinite(count) && count >= 0 ? count : 0
}

export async function updateTimeOfGXLL(dateStr: unknown): Promise<UpdateDetail> {
  const month = normalizeMonth(dateStr)
  const monthPattern = `${month}%`

  return withK3SqlServerTransaction(async (transaction) => {
    const updateReportDateRequest = transaction.request()
    sqlStringParameter(updateReportDateRequest, 'monthPattern', monthPattern)
    const reportDateUpdated = affectedRows(await updateReportDateRequest.query(UPDATE_REPORT_DATE_SQL))

    const resetPickingFlagRequest = transaction.request()
    sqlStringParameter(resetPickingFlagRequest, 'monthPattern', monthPattern)
    const llResetCount = affectedRows(await resetPickingFlagRequest.query(RESET_PICKING_FLAG_SQL))

    const markUnpickedRequest = transaction.request()
    sqlStringParameter(markUnpickedRequest, 'monthPattern', monthPattern)
    const unpickedMarkedCount = affectedRows(await markUnpickedRequest.query(MARK_UNPICKED_SQL))

    return {
      date: month,
      success: true,
      reportDateUpdated,
      llResetCount,
      unpickedMarkedCount,
      message: '执行未领料信息成功',
    }
  })
}

export async function handleCBData(): Promise<ExecuteSqlDetail> {
  return withK3SqlServerTransaction(async (transaction) => {
    await transaction.request().query(HANDLE_COST_INDEX_SQL)
    await transaction.request().query(HANDLE_COST_STATISTICS_SQL)
    return {
      success: true,
      steps: [
        { name: '重建成本相关表索引', success: true },
        { name: '更新成本相关表统计信息', success: true },
      ],
      message: '优化成本数据成功',
    }
  })
}

export async function buildIndexOfKingdee(): Promise<ExecuteSqlDetail> {
  // DBCC DBREINDEX is a long-running DDL operation. Do not retry after it
  // starts; a caller can safely submit a new request only after inspecting
  // this result and the SQL Server state.
  const startedAt = Date.now()
  const pool = await getK3SqlServerPool()
  await pool.request().query(REBUILD_ALL_INDEXES_SQL)
  const durationMs = Date.now() - startedAt
  return {
    success: true,
    steps: [{ name: '重建全库索引（排除 TMP/Z_ 表）', success: true }],
    durationMs,
    message: `重建索引成功，耗时 ${durationMs} ms`,
  }
}

export async function writeToMO(): Promise<ExecuteSqlDetail> {
  return withK3SqlServerTransaction(async (transaction) => {
    const result = await transaction.request().query(WRITE_TO_MO_SQL)
    const count = affectedRows(result)
    return {
      success: true,
      affectedRows: count,
      steps: [{ name: '反写工序计划单号到生产订单', success: true, affectedRows: count }],
      message: '更新工序计划单号成功',
    }
  })
}

export function normalizeExecuteSqlMonth(value: unknown): string {
  return normalizeMonth(value)
}
