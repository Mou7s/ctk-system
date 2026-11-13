export type AlertMember = { userid: string; name: string }
export type DeliveryRow = {
  entryId: number; billNo: string; seq: number; customer: string; materialCode: string; materialName: string
  specification: string; productionOrderNos: string
  unit: string; qty: number; shippedQty: number; returnedQty: number; remainingQty: number; dueDate: string | null
  seller: string; follow1: string; follow2: string; recipients: string[]; issues: string[]
  daysLeft: number | null; urgency: string
  productionStatus: string; productionGroup: string; instockedQty: number | null
  readyQty: number | null; unfinishedQty: number | null
}

/** 入库为订单关联的累计合格入库；扣掉已出货后判断能否覆盖未交量，不等同于实时可用库存。 */
export function deliveryProduction(r: Record<string, any>) {
  const instockedQty = Number(r.instockedQty)
  const shippedQty = Number(r.shippedQty)
  const remainingQty = Number(r.remainingQty)
  const difference = Number(r.qty) - shippedQty - remainingQty
  if (Number(r.productionReliable) !== 1 || r.instockedQty == null
    || ![instockedQty, shippedQty, remainingQty].every(Number.isFinite)
    || instockedQty < 0 || shippedQty < 0 || remainingQty <= 0 || Number(r.returnedQty || 0) > 0
    || Math.abs(difference) > 0.000001) {
    return { productionStatus: '待核实', productionGroup: '待核实', instockedQty: null, readyQty: null, unfinishedQty: null }
  }
  const readyQty = Math.min(remainingQty, Math.max(0, instockedQty - shippedQty))
  const unfinishedQty = Math.max(0, remainingQty - readyQty)
  const productionStatus = unfinishedQty <= 0.000001 ? '已入库待发货' : '生产未完成'
  return { productionStatus, productionGroup: productionStatus === '已入库待发货' ? productionStatus : '生产未完成',
    instockedQty, readyQty, unfinishedQty }
}

export function shanghaiClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) }
}

/** 工作号以通讯录中的“跟单+姓名”识别，不推算 userid；同名拒绝猜发。 */
export function matchMember(name: string, members: AlertMember[]) {
  const requested = name.trim()
  if (!requested) return null
  const workName = requested.startsWith('跟单') ? requested : `跟单${requested}`
  const work = members.filter(m => m.name.trim() === workName)
  if (work.length) return work.length === 1 ? work[0]! : null
  const found = members.filter(m => m.name.trim() === requested)
  return found.length === 1 ? found[0]! : null
}

export function prepareDeliveryRows(raw: Record<string, any>[], members: AlertMember[], now = new Date()): DeliveryRow[] {
  const today = Date.parse(`${shanghaiClock(now).day}T00:00:00Z`)
  return raw.map(r => {
    const issues: string[] = []
    const names = [r.seller, r.follow1, r.follow2].map(n => String(n || '').trim())
    if (!names[0]) issues.push('未填写业务员')
    if (!names[1]) issues.push('未填写跟单员')
    const recipients = [...new Set(names.filter(Boolean).flatMap(name => {
      const member = matchMember(name, members)
      if (!member) issues.push(`${name}：企微姓名未唯一匹配`)
      return member ? [member.userid] : []
    }))]
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(r.dueDate || '')) ? String(r.dueDate) : null
    const daysLeft = dueDate ? Math.round((Date.parse(`${dueDate}T00:00:00Z`) - today) / 86400000) : null
    if (!dueDate) issues.push('未回复交期')
    const returnedQty = Number(r.returnedQty || 0)
    if (returnedQty > 0) issues.push('存在退货，按金蝶剩余量跟进')
    const difference = Number(r.qty) - Number(r.shippedQty) - Number(r.remainingQty)
    // 退货并非一律重新打开应交量；以金蝶台账为准，仅两种口径均不符时提示核对。
    if (Math.abs(difference) > 0.000001 && Math.abs(difference + returnedQty) > 0.000001) {
      issues.push('剩余量与数量勾稽不一致，需核对')
    }
    const production = deliveryProduction(r)
    if (production.productionStatus === '待核实') issues.push('生产关联或数量口径待核实')
    return {
      entryId: Number(r.entryId), billNo: String(r.billNo), seq: Number(r.seq), customer: String(r.customer || ''),
      materialCode: String(r.materialCode || ''), materialName: String(r.materialName || ''), unit: String(r.unit || ''),
      specification: String(r.specification || ''), productionOrderNos: String(r.productionOrderNos || ''),
      qty: Number(r.qty), shippedQty: Number(r.shippedQty), returnedQty, remainingQty: Number(r.remainingQty), dueDate,
      seller: names[0]!, follow1: names[1]!, follow2: names[2]!, recipients, issues, daysLeft,
      urgency: daysLeft == null ? '未回复交期' : daysLeft < 0 ? '逾期' : daysLeft === 0 ? '今天到期' : '待交付',
      ...production,
    }
  }).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || a.billNo.localeCompare(b.billNo) || a.seq - b.seq || a.entryId - b.entryId)
}

export function recipientPlans(rows: DeliveryRow[], members: AlertMember[], totalRecipients: string[]) {
  const ids = new Set([...rows.flatMap(r => r.recipients), ...totalRecipients])
  return [...ids].map(userid => {
    const total = totalRecipients.includes(userid)
    return { userid, name: members.find(m => m.userid === userid)?.name || userid, total,
      rows: total ? rows : rows.filter(r => r.recipients.includes(userid)) }
  }).sort((a, b) => Number(b.total) - Number(a.total) || a.name.localeCompare(b.name, 'zh-CN'))
}

export function filterDeliveryRows(rows: DeliveryRow[], query: Record<string, unknown>) {
  const keyword = String(query.keyword || '').trim().toLowerCase()
  const owner = String(query.owner || '').trim()
  const status = String(query.status || '')
  const production = String(query.production || '')
  return rows.filter(r => (!keyword || [r.billNo, r.customer, r.materialCode, r.materialName, r.specification, r.productionOrderNos].some(s => s.toLowerCase().includes(keyword)))
    && (!owner || [r.seller, r.follow1, r.follow2].some(s => s.includes(owner)))
    && (!status || status === 'all' || r.urgency === status || status === '异常' && r.issues.length > 0)
    && (!production || production === 'all' || r.productionGroup === production))
}
