import XLSX from 'xlsx-js-style'
import { domesticQuotationUnit, domesticPriceToPcs, domesticPackToPcs } from '../../app/packages/shared/domesticQuotationUnits.js'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { shanghaiClock } from './sales-delivery-alert-model'
import { readWecomConfig, uploadWarningExcelMedia, sendFileToUser } from './nitro-jobs/kucun-warning-send'

export const MONTHLY_ENABLED_KEY = 'tk.quotation.domestic.monthly.enabled'
export const MONTHLY_RECEIVER_KEY = 'tk.quotation.domestic.monthly.receiver'
export const MONTHLY_MAX_LINES = 20000

export function monthlyQuotationPeriod(now = new Date(), month = '') {
  const reportMonth = month || shanghaiClock(now).day.slice(0, 7)
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/u.test(reportMonth)) throw new Error('汇总月份格式应为 YYYY-MM')
  const [year, number] = reportMonth.split('-').map(Number)
  const previous = new Date(Date.UTC(year, number - 2, 20)).toISOString().slice(0, 10)
  return { month: reportMonth, from: previous, to: `${reportMonth}-19`, endExclusive: `${reportMonth}-20` }
}

export function monthlyQuotationDue(now: Date) {
  const clock = shanghaiClock(now)
  return clock.day.endsWith('-20') && clock.hour >= 8
}

export type MonthlyQuotationRow = Record<string, any>

/** Business timestamps in MySQL are Shanghai local DATETIME, so bind local half-open boundaries. */
export async function queryMonthlyQuotations(period: ReturnType<typeof monthlyQuotationPeriod>, pool: Pool = getMysqlPool()) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT q.*, l.line_no AS report_line_no, l.material_code AS report_material_code,
           l.application AS report_product_name, l.ctk_mpn AS report_model,
           l.package_name AS report_package, l.unit AS report_unit,
           l.min_pack_count AS report_min_pack, l.final_price_rmb AS report_price,
           l.manufacturer AS report_brand, l.remark AS report_remark
    FROM tk_quotation q JOIN tk_quotation_line l ON l.quotation_id = q.id
    WHERE q.business_type = 'DOMESTIC' AND q.status = 'APPROVED'
      AND TRIM(COALESCE(q.payment_term, '')) LIKE '月结%'
      AND q.final_review_time >= ? AND q.final_review_time < ?
    ORDER BY q.final_review_time, q.id, l.line_no, l.id
    LIMIT ?`), [`${period.from} 00:00:00`, `${period.endExclusive} 00:00:00`, MONTHLY_MAX_LINES + 1])
  if (rows.length > MONTHLY_MAX_LINES) throw new Error('月结汇总超过20000行，停止导出和发送，避免截断')
  return rows as MonthlyQuotationRow[]
}

function localDateTime(value: unknown) {
  if (!(value instanceof Date)) return String(value ?? '')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

export function renderMonthlyQuotationExcel(rows: MonthlyQuotationRow[], period: ReturnType<typeof monthlyQuotationPeriod>) {
  rows = rows.map(row => {
    const kind = domesticQuotationUnit(row.report_unit)
    return { ...row, report_unit: kind ? 'PCS' : '待核对',
      report_price: kind ? domesticPriceToPcs(row.report_price, row.report_unit) : row.report_price,
      report_min_pack: kind ? domesticPackToPcs(row.report_min_pack, row.report_unit) : row.report_min_pack,
      report_remark: [row.report_remark, kind ? '' : '原计价及包装单位未确认，保留原值'].filter(Boolean).join('；') }
  })
  const quotes = [...new Map(rows.map(row => [row.id, row])).values()]
  const title = `月结内贸报价汇总 ${period.from} 至 ${period.to}（${quotes.length}张报价单，${rows.length}行明细）`
  const note = '按终审通过时间统计，仅含当前终审通过且收款方式以“月结”开头的内贸报价单；本表为报价信息，不是实际应收或收款。已知单位统一PCS；标为待核对的单价和包装数保留原值。单价不合计，缺失终审价留空。'
  const quoteHeaders = ['报价单号', '客户', '客户性质', '收款方式', '客户应用', '业务员', '联系人', '客户电话', '客户地址', '终审人', '终审通过时间', '明细行数']
  const details = ['报价单号', '客户', '收款方式', '客户应用', '终审通过时间', '业务员', '行号', '品号', '品名', '型号', '封装', '计价单位', '最小包装数（PCS，待核对除外）', '终审含税单价（元/PCS，待核对除外）', '品牌', '备注']
  const book = XLSX.utils.book_new()
  const sheets = [
    { name: '报价汇总', headers: quoteHeaders, data: quotes.map(r => [r.quote_no, r.customer_name, r.customer_style, r.payment_term, r.customer_application || '', r.salesperson_name, r.contact_text, r.customer_phone || '', r.customer_address || '', r.final_reviewer_name, localDateTime(r.final_review_time), r.line_count]) },
    { name: '报价明细', headers: details, data: rows.map(r => [r.quote_no, r.customer_name, r.payment_term, r.customer_application || '', localDateTime(r.final_review_time), r.salesperson_name, Number(r.report_line_no), r.report_material_code || '', r.report_product_name || '', r.report_model, r.report_package, r.report_unit, r.report_min_pack == null ? '' : Number(r.report_min_pack), r.report_price == null ? '' : Number(r.report_price), r.report_brand || '', r.report_remark || '']) },
  ]
  for (const entry of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet([[title], [note], entry.headers, ...entry.data])
    sheet['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: entry.headers.length - 1 } }))
    sheet['!cols'] = entry.headers.map(label => ({ wch: label.includes('地址') || label === '备注' ? 36 : label.includes('时间') || label.includes('单价') || label === '报价单号' ? 26 : 18 }))
    sheet['!rows'] = [{ hpt: 30 }, { hpt: 42 }, { hpt: 28 }]
    sheet['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(entry.headers.length - 1)}${Math.max(3, entry.data.length + 3)}` }
    for (const address of Object.keys(sheet).filter(key => !key.startsWith('!'))) {
      const cell = sheet[address]
      const { r, c } = XLSX.utils.decode_cell(address)
      cell.s = { font: { name: '微软雅黑', sz: r === 0 ? 14 : 10, bold: r === 0 || r === 2, color: { rgb: r === 2 ? 'FFFFFF' : '334155' } }, fill: { fgColor: { rgb: r === 2 ? '1E3A8A' : r % 2 ? 'F1F5F9' : 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } }
      if (entry.name === '报价明细' && r >= 3 && c === 13) cell.z = '#,##0.00######'
    }
    XLSX.utils.book_append_sheet(book, sheet, entry.name)
  }
  return new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
}

export async function readMonthlyQuotationSettings(pool: Pool = getMysqlPool()) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT config_key,config_value FROM sys_config WHERE config_key IN (?,?) ORDER BY config_id'), [MONTHLY_ENABLED_KEY, MONTHLY_RECEIVER_KEY])
  const values = new Map(rows.map(row => [row.config_key, String(row.config_value || '').trim()]))
  return { enabled: values.get(MONTHLY_ENABLED_KEY) === '1', receiver: values.get(MONTHLY_RECEIVER_KEY) || '' }
}

export async function resolveMonthlyQuotationReceiver(receiver: string, pool: Pool = getMysqlPool()) {
  if (!receiver) throw new Error('月结汇总接收人未配置')
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions("SELECT userid,name FROM wxuser WHERE status='active' AND (userid=? OR name=?)"), [receiver, receiver])
  if (rows.length !== 1) throw new Error('财务接收人未唯一匹配或已停用，停止发送')
  return { userid: String(rows[0].userid), name: String(rows[0].name) }
}

/** Persistent unique month claim: failures and interrupted sends require inspection, never automatic replay. */
export async function runMonthlyQuotationReport(now = new Date()) {
  if (!monthlyQuotationDue(now)) return { skipped: true }
  const pool = getMysqlPool()
  const settings = await readMonthlyQuotationSettings(pool)
  if (!settings.enabled) return { skipped: true }
  const period = monthlyQuotationPeriod(now)
  const [claim] = await pool.query<any>(mysqlQueryOptions("INSERT IGNORE INTO tk_quotation_monthly_run (report_month,period_from,period_to,status,started_at) VALUES (?,?,?,'preparing',NOW())"), [period.month, period.from, period.to])
  if (!claim.affectedRows) return { skipped: true }
  let sending = false
  try {
    const receiver = await resolveMonthlyQuotationReceiver(settings.receiver, pool)
    const rows = await queryMonthlyQuotations(period, pool)
    const config = await readWecomConfig()
    const mediaId = await uploadWarningExcelMedia(config, renderMonthlyQuotationExcel(rows, period), `内贸月结报价汇总_${period.from}_${period.to}.xlsx`)
    const latest = await readMonthlyQuotationSettings(pool)
    if (!latest.enabled || latest.receiver !== settings.receiver) throw new Error('发送设置已变化，停止本期发送')
    const currentReceiver = await resolveMonthlyQuotationReceiver(latest.receiver, pool)
    if (currentReceiver.userid !== receiver.userid) throw new Error('接收人映射已变化，停止本期发送')
    await pool.query(mysqlQueryOptions("UPDATE tk_quotation_monthly_run SET status='sending',recipient_name=?,row_count=?,quotation_count=? WHERE report_month=?"), [receiver.name, rows.length, new Set(rows.map(row => row.id)).size, period.month])
    sending = true
    await sendFileToUser(config, receiver.userid, mediaId)
    await pool.query(mysqlQueryOptions("UPDATE tk_quotation_monthly_run SET status='sent',finished_at=NOW() WHERE report_month=?"), [period.month])
    return { skipped: false, sent: true, rowCount: rows.length }
  } catch {
    // Do not persist raw network errors, which can contain credentials or recipient identifiers.
    const message = sending ? '发送结果待核对；请先检查蔡主管是否收到，禁止直接重试' : '准备失败；请检查接收人、企业微信配置、数据库和数据上限'
    await pool.query(mysqlQueryOptions('UPDATE tk_quotation_monthly_run SET status=?,error_message=?,finished_at=NOW() WHERE report_month=?'), [sending ? 'uncertain' : 'failed', message, period.month])
    return { skipped: false, sent: false, uncertain: sending, message }
  }
}
