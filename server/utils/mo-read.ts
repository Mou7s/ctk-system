import { queryK3SqlServer, sqlIntParameter, sqlStringParameter } from './sqlserver'

type MoQuery = Record<string, unknown>

type MoRow = {
  FFullName: unknown
  FMONumber: unknown
  FMOEntrySeq: unknown
  FBillNo: unknown
  FNUMBER: unknown
  FNAME: unknown
  FSPECIFICATION: unknown
  gongyiluxian: unknown
  FOperQty: unknown
  reportDate: unknown
  FOperNumber: unknown
  zuoye: unknown
  jiagongchejian: unknown
  FQualifiedQty: unknown
  FUnqualifiedQty: unknown
}

type MoPage = {
  rows: Array<Record<string, unknown>>
  total: number
  pageNum: number
  pageSize: number
}

const FILTERS: Record<string, string> = {
  FMONumber: 'op.FMONumber',
  FMOEntrySeq: 'op.FMOEntrySeq',
  FBillNo: 'op.FBillNo',
  FNAME: 'mat_l.FNAME',
  FNUMBER: 'mat.FNUMBER',
}

const MO_FROM_JOINS = `
      FROM T_SFC_OPERPLANNING op
      LEFT JOIN T_SFC_OPERPLANNINGSEQ seq ON seq.FID = op.FID
      LEFT JOIN T_SFC_OPERPLANNINGDETAIL detail ON detail.FENTRYID = seq.FENTRYID
      LEFT JOIN T_SFC_OPERPLANNINGDETAIL_B detail_b ON detail_b.FDETAILID = detail.FDETAILID
      LEFT JOIN T_BD_MATERIAL_L mat_l ON mat_l.FMATERIALID = op.FProductId
      LEFT JOIN T_BD_MATERIAL mat ON mat.FMATERIALID = op.FProductId
      LEFT JOIN T_BD_DEPARTMENT_L dept ON dept.FDEPTID = op.FProDepartmentId
      LEFT JOIN T_ENG_PROCESS_L process_l ON process_l.FID = detail.FProcessId
      LEFT JOIN T_ENG_ROUTE_L route_l ON route_l.FID = op.FRouteId
      LEFT JOIN T_BD_DEPARTMENT_L dept_oper ON dept_oper.FDEPTID = detail.FDepartmentId
`

const MO_DETAIL_COLUMNS = `
        dept.FFullName AS FFullName,
        op.FMONumber AS FMONumber,
        op.FMOEntrySeq AS FMOEntrySeq,
        op.FBillNo AS FBillNo,
        mat.FNUMBER AS FNUMBER,
        mat_l.FNAME AS FNAME,
        mat_l.FSPECIFICATION AS FSPECIFICATION,
        route_l.FNAME AS gongyiluxian,
        detail.FOperNumber AS FOperNumber,
        process_l.FNAME AS zuoye,
        detail.FOptCtrlCodeId AS FOptCtrlCodeId,
        detail.FOperQty AS FOperQty,
        dept_oper.FNAME AS jiagongchejian,
        detail_b.FQualifiedQty AS FQualifiedQty,
        detail_b.FUnqualifiedQty AS FUnqualifiedQty,
        CONVERT(varchar(23), (
          SELECT MAX(rpt.FDATE)
          FROM T_SFC_OPTRPTENTRY rpt_entry
          LEFT JOIN T_SFC_OPTRPT rpt ON rpt_entry.FID = rpt.FID
          WHERE rpt_entry.FOPTPLANID = op.FID
            AND rpt_entry.FOPERNUMBER = detail.FOperNumber
        ), 121) AS reportDate
`

function text(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function reportDateText(value: unknown): string | null {
  const result = text(value)
  if (!result) return result
  return result.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
}

function filterText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim()
}

function numberValue(value: unknown): number {
  if (value == null || String(value).trim() === '') return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function pageNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(1, Math.floor(number))
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_\[]/g, (character) => `\\${character}`)
}

type MoFilter = { name: string; column: string; value: string }

function filterState(input: MoQuery): { filters: MoFilter[]; where: string } {
  const filters = Object.entries(FILTERS)
    .map(([name, column]) => ({ name, column, value: filterText(input[name]) }))
    .filter((filter) => filter.value)
  const conditions = ['detail.FOptCtrlCodeId <> 226304']
  for (const filter of filters) conditions.push(`${filter.column} LIKE @${filter.name} ESCAPE '\\'`)
  return { filters, where: `WHERE ${conditions.join(' AND ')}` }
}

function bindFilters(request: any, filters: MoFilter[]): void {
  for (const filter of filters) sqlStringParameter(request, filter.name, `%${escapeLike(filter.value)}%`)
}

function moDetail(row: MoRow) {
  return {
    FOperNumber: text(row.FOperNumber),
    zuoye: text(row.zuoye),
    jiagongchejian: text(row.jiagongchejian),
    FQualifiedQty: numberValue(row.FQualifiedQty),
    FUnqualifiedQty: numberValue(row.FUnqualifiedQty),
    reportDate: reportDateText(row.reportDate),
  }
}

function groupKeyOf(row: MoRow): string {
  return `${text(row.FMONumber) ?? ''}|${text(row.FMOEntrySeq) ?? ''}|${text(row.FBillNo) ?? ''}`
}

export async function queryMoData(input: MoQuery = {}): Promise<MoPage> {
  const pageNum = pageNumber(input.pageNum, 1)
  const pageSize = Math.min(100, pageNumber(input.pageSize, 10))
  const { filters, where } = filterState(input)

  const counted = await queryK3SqlServer<{ total: number }>(async (request) => {
    bindFilters(request, filters)
    return request.query(`SELECT COUNT(DISTINCT op.FID) AS total ${MO_FROM_JOINS} ${where}`)
  })
  const total = numberValue(counted[0]?.total)
  if (total <= 0) return { rows: [], total: 0, pageNum, pageSize }

  const offset = (pageNum - 1) * pageSize
  const keys = await queryK3SqlServer<{ fid: unknown }>(async (request) => {
    bindFilters(request, filters)
    sqlIntParameter(request, 'moOffset', offset)
    sqlIntParameter(request, 'moPageSize', pageSize)
    return request.query(
      `SELECT op.FID AS fid ${MO_FROM_JOINS} ${where} `
      + 'GROUP BY op.FID ORDER BY MAX(op.FMONumber) DESC, MAX(op.FMOEntrySeq) ASC '
      + 'OFFSET @moOffset ROWS FETCH NEXT @moPageSize ROWS ONLY',
    )
  })
  if (!keys.length) return { rows: [], total, pageNum, pageSize }

  const rows = await queryK3SqlServer<MoRow>(async (request) => {
    bindFilters(request, filters)
    const names = keys.map((key, index) => {
      const name = `moFid${index}`
      sqlIntParameter(request, name, numberValue(key.fid))
      return `@${name}`
    })
    return request.query(`
      SELECT ${MO_DETAIL_COLUMNS}
      ${MO_FROM_JOINS}
      ${where} AND op.FID IN (${names.join(', ')})
      ORDER BY op.FMONumber DESC, op.FMOEntrySeq ASC, detail.FOperNumber
    `)
  })

  const grouped = new Map<string, Record<string, any>>()
  for (const row of rows) {
    const key = groupKeyOf(row)
    const detail = moDetail(row)
    const main = grouped.get(key)
    if (main) {
      main.details.push(detail)
      continue
    }
    grouped.set(key, {
      FFullName: text(row.FFullName),
      FMONumber: text(row.FMONumber),
      FMOEntrySeq: text(row.FMOEntrySeq),
      FBillNo: text(row.FBillNo),
      FNUMBER: text(row.FNUMBER),
      FNAME: text(row.FNAME),
      FSPECIFICATION: text(row.FSPECIFICATION),
      gongyiluxian: text(row.gongyiluxian),
      FOperQty: numberValue(row.FOperQty),
      reportDate: detail.reportDate,
      details: [detail],
    })
  }

  const values = [...grouped.values()]
  values.sort((left, right) =>
    String(right.FMONumber ?? '').localeCompare(String(left.FMONumber ?? ''))
    || numberValue(left.FMOEntrySeq) - numberValue(right.FMOEntrySeq),
  )
  for (const order of values) {
    const dates = (order.details as Array<{ reportDate: string | null }>)
      .map((detail) => detail.reportDate)
      .filter((date): date is string => Boolean(date))
      .sort()
    order.reportDate = dates.length ? dates[dates.length - 1] : null
  }

  return { rows: values, total, pageNum, pageSize }
}
