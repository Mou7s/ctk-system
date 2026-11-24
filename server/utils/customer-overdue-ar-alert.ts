import XLSX from 'xlsx-js-style'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { queryCustomerOverdueAr } from './customer-overdue-ar'
import { readAlertMembers } from './sales-delivery-alert-read'
import { matchMember, shanghaiClock, type AlertMember } from './sales-delivery-alert-model'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { readWecomConfig, uploadWarningExcelMedia, sendFileToUser } from './nitro-jobs/kucun-warning-send'
import { errorMessage } from './response'

type ArRow = Awaited<ReturnType<typeof queryCustomerOverdueAr>>['rows'][number]
export const OVERDUE_ALERT_ENABLED_KEY = 'tk.customerOverdueAr.weeklyEnabled'
export const OVERDUE_ALERT_TOTAL_KEY = 'tk.customerOverdueAr.totalReceiver'

function ignoredOwners(): Set<string> {
  return new Set(
    String(process.env.NUXT_OVERDUE_AR_IGNORED_OWNERS || '')
      .split(/[,，;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function overdueAlertDue(now: Date) {
  const clock = shanghaiClock(now)
  const weekday = new Date(`${clock.day}T00:00:00Z`).getUTCDay()
  // 周五08:00起当天补发一次；日期锁保证重启/多实例不会重复发。
  return weekday === 5 && clock.hour >= 8
}

export function overdueRecipientPlans(rows: ArRow[], members: AlertMember[], totalReceiver = '') {
  const plans = new Map<string, { userid: string; name: string; rows: ArRow[]; total?: boolean }>()
  const unmatched: Array<{ customer: string; owner: string }> = []
  const skipped: Array<{ customer: string; owner: string }> = []
  const ignored = ignoredOwners()
  for (const row of rows) {
    const names = [...new Set([row.merchandiserName, row.merchandiser1Name, row.merchandiser2Name, row.sellerName].filter(Boolean))]
    if (!names.length) unmatched.push({ customer: row.custName, owner: '未维护负责人' })
    const ids = new Set<string>()
    for (const owner of names) {
      if (ignored.has(owner)) { skipped.push({ customer: row.custName, owner }); continue }
      const member = matchMember(owner, members)
      if (!member) { unmatched.push({ customer: row.custName, owner }); continue }
      if (ids.has(member.userid)) continue
      ids.add(member.userid)
      const plan = plans.get(member.userid) || { ...member, rows: [] }
      plan.rows.push(row)
      plans.set(member.userid, plan)
    }
  }
  const totalIds = [...new Set(totalReceiver.split(',').map(id => id.trim()).filter(Boolean))]
  const totalMembers = totalIds.map(id => members.find(member => member.userid === id))
  for (const member of totalMembers) {
    if (member && rows.length) plans.set(member.userid, { ...member, rows, total: true })
  }
  return { plans: [...plans.values()], unmatched, skipped, invalidTotal: totalMembers.some(member => !member) }
}

export function renderOverdueAlertExcel(rows: ArRow[], name: string, day: string): Uint8Array {
  const headers = ['客户编码', '客户名称', '币种', '逾期未收金额', '逾期单据数', '最早到期日', '最长逾期天数', '平均逾期天数', '跟单员', '跟单员1', '跟单员2', '销售员', '备注']
  const sheet = XLSX.utils.aoa_to_sheet([
    [`${name}的客户逾期应收 · ${day}`],
    headers,
    ...rows.map(r => [r.custCode, r.custName, r.currencyName || r.currencyCode || '币种未维护', r.openAmt, r.billCnt, r.earliestDue || '', r.maxOverdueDays, r.avgOverdueDays, r.merchandiserName, r.merchandiser1Name, r.merchandiser2Name, r.sellerName, r.remark || '']),
  ])
  sheet['!cols'] = [18,36,14,20,14,16,18,18,16,16,16,16,36].map(wch => ({ wch }))
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]
  sheet['!rows'] = [{ hpt: 30 }, { hpt: 26 }]
  sheet['!autofilter'] = { ref: `A2:M${rows.length + 2}` }
  for (const address of Object.keys(sheet).filter(key => !key.startsWith('!'))) {
    const cell = sheet[address]
    const { r, c } = XLSX.utils.decode_cell(address)
    cell.s = { font: { name: '微软雅黑', sz: r === 0 ? 14 : 10, bold: r === 0 || r === 1, color: { rgb: r === 1 ? 'FFFFFF' : '334155' } },
      fill: { fgColor: { rgb: r === 1 ? '1E3A8A' : r % 2 === 0 ? 'F1F5F9' : 'FFFFFF' } }, alignment: { vertical: 'center', wrapText: true } }
    if (r >= 2 && c === 3) cell.z = '#,##0.00'
  }
  // 各币种单独合计，不把不同币种相加。
  const totals = new Map<string, number>()
  for (const row of rows) {
    const currency = row.currencyName || row.currencyCode || '币种未维护'
    totals.set(currency, (totals.get(currency) || 0) + row.openAmt)
  }
  const totalSheet = XLSX.utils.aoa_to_sheet([['币种', '逾期未收合计'], ...[...totals].map(([currency, amount]) => [currency, Math.round(amount * 100) / 100])])
  totalSheet['!cols'] = [{ wch: 18 }, { wch: 24 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '客户逾期应收')
  XLSX.utils.book_append_sheet(book, totalSheet, '币种合计')
  const files = unzipSync(new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })))
  const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>'
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']!).replace(/<sheetViews[\s\S]*?<\/sheetViews>/, views))
  return zipSync(files, { level: 6 })
}

export async function readOverdueAlertSettings() {
  const [rows] = await getMysqlPool().query<any[]>(mysqlQueryOptions('SELECT config_key,config_value FROM sys_config WHERE config_key IN (?,?,?)'), [OVERDUE_ALERT_ENABLED_KEY, OVERDUE_ALERT_TOTAL_KEY, 'tk.deliveryAlert.totalReceivers'])
  const values = new Map(rows.map(row => [row.config_key, String(row.config_value || '')]))
  // 导入迁移前，预览沿用已经配置的唯一销售交期总表账号；保存后独立配置。
  const legacyTotal = values.get('tk.deliveryAlert.totalReceivers') || ''
  const totalReceiver = values.has(OVERDUE_ALERT_TOTAL_KEY) ? values.get(OVERDUE_ALERT_TOTAL_KEY)! : (legacyTotal && !legacyTotal.includes(',') ? legacyTotal : '')
  return { enabled: values.get(OVERDUE_ALERT_ENABLED_KEY) === '1', totalReceiver }
}

export async function readOverdueAlertEnabled() {
  return (await readOverdueAlertSettings()).enabled
}

export async function previewOverdueAlert() {
  const [data, members, settings] = await Promise.all([queryCustomerOverdueAr({ excludeInternal: true }), readAlertMembers(), readOverdueAlertSettings()])
  return { ...overdueRecipientPlans(data.rows, members, settings.totalReceiver), settings, asOfDate: data.asOfDate, customerCount: data.summary.customerCount }
}

export async function runWeeklyOverdueAlert(now = new Date()) {
  if (!overdueAlertDue(now) || !await readOverdueAlertEnabled()) return { skipped: true }
  const day = shanghaiClock(now).day
  const pool = getMysqlPool()
  const [claim] = await pool.query<any>(mysqlQueryOptions("INSERT IGNORE INTO tk_overdue_ar_alert_run (run_date,status,started_at) VALUES (?,'running',NOW())"), [day])
  if (!claim.affectedRows) return { skipped: true }
  let sent = 0
  let failed = 0
  try {
    const snapshot = await previewOverdueAlert()
    if (!await readOverdueAlertEnabled()) throw new Error('提醒已关闭')
    if (!snapshot.settings.totalReceiver || snapshot.invalidTotal) throw new Error('总表接收人未设置或已停用，本次停止发送')
    // 通讯录缺失/同名不猜发；记录漏配，已匹配的负责人仍各自收到自己的客户。
    const config = snapshot.plans.length ? await readWecomConfig() : null
    for (const plan of snapshot.plans) {
      await pool.query(mysqlQueryOptions("INSERT INTO tk_overdue_ar_alert_delivery (run_date,userid,recipient_name,is_total,row_count,status) VALUES (?,?,?,?,?,'preparing')"), [day, plan.userid, plan.name, plan.total ? 1 : 0, plan.rows.length])
      try {
        const buffer = renderOverdueAlertExcel(plan.rows, plan.total ? `${plan.name}（总表）` : plan.name, day)
        const mediaId = await uploadWarningExcelMedia(config!, buffer, `客户逾期应收${plan.total ? '总表' : ''}_${day}.xlsx`)
        await pool.query(mysqlQueryOptions("UPDATE tk_overdue_ar_alert_delivery SET status='sending' WHERE run_date=? AND userid=?"), [day, plan.userid])
        await sendFileToUser(config!, plan.userid, mediaId)
        await pool.query(mysqlQueryOptions("UPDATE tk_overdue_ar_alert_delivery SET status='sent',finished_at=NOW() WHERE run_date=? AND userid=?"), [day, plan.userid])
        sent++
      } catch (error) {
        failed++
        await pool.query(mysqlQueryOptions("UPDATE tk_overdue_ar_alert_delivery SET status=IF(status='sending','uncertain','failed'),error_message=?,finished_at=NOW() WHERE run_date=? AND userid=?"), [errorMessage(error, '发送失败').slice(0,500), day, plan.userid])
      }
    }
    const summary = `客户${snapshot.customerCount}家；发送${sent}人；失败或待核对${failed}人；人员未匹配${snapshot.unmatched.length}项`
    await pool.query(mysqlQueryOptions('UPDATE tk_overdue_ar_alert_run SET status=?,summary=?,finished_at=NOW() WHERE run_date=?'), [failed || snapshot.unmatched.length ? 'partial' : 'sent', summary, day])
    return { skipped: false, sent, failed, summary }
  } catch (error) {
    const summary = errorMessage(error, '逾期应收周提醒失败').slice(0,500)
    await pool.query(mysqlQueryOptions("UPDATE tk_overdue_ar_alert_run SET status='failed',summary=?,finished_at=NOW() WHERE run_date=?"), [summary, day])
    return { skipped: false, sent, failed, summary }
  }
}
