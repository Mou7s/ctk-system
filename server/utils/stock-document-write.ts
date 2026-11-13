import type { H3Event } from 'h3'
import { defineEventHandler, getHeader, readBody } from 'h3'
import { apiError, apiSuccess } from './response'
import { auditBill, K3CloudError, pushBill, submitBill } from './k3'
import { queryK3DocumentList } from './stock-document'
import { insertOperationLog, requiredText, text, withIdempotentWriteSession, writeFail } from './write'

const PURCHASE_ORDER_FORM = 'PUR_PurchaseOrder'
const PURCHASE_INBOUND_FORM = 'STK_InStock'
const PURCHASE_ORDER_PUSH_RULE = 'PUR_PurchaseOrder-STK_InStock'

function booleanValue(value: unknown, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue
  return !['false', '0', 'no'].includes(text(value).toLowerCase())
}

function requestId(event: H3Event, body: Record<string, any>, billNo: string): string {
  const explicit = text(getHeader(event, 'idempotency-key')) || text(body.requestId)
  if (explicit) return explicit
  const entries = Array.isArray(body.entryIds) ? body.entryIds.map(text).sort().join(',') : ''
  return `purchase-inbound:${billNo}:${entries}:${booleanValue(body.autoAudit, true) ? 'audit' : 'save'}`
}

function entityText(entity: any, key: string): string {
  return text(entity?.[key] ?? entity?.[key.toLowerCase()])
}

function alreadyCompleted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : text(error)
  return /已经审核|已审核|已提交|重新审核|already|submitted|audited/i.test(message)
}

async function completePurchaseInbound(event: H3Event, body: Record<string, any>, requestKey: string) {
  const billNo = requiredText(body.billNo, '采购订单号', 100)
  const autoAudit = booleanValue(body.autoAudit, true)
  const entryIds = Array.isArray(body.entryIds) ? body.entryIds.map((item) => text(item)).filter(Boolean) : []
  if (new Set(entryIds).size !== entryIds.length) return apiError('采购订单明细不能重复选择', 400)

  return withIdempotentWriteSession(
    event,
    'stock-document:purchase-inbound',
    null,
    requestKey,
    { ...body, billNo, requestId: requestKey },
    async (session, connection) => {
      const orderResult = await queryK3DocumentList('purchaseOrder', { billNo, pageNum: 1, pageSize: 1000, remainOnly: true })
      const rows = Array.isArray(orderResult.rows)
        ? orderResult.rows.filter((row: any) => text(row.billNo).trim().toLowerCase() === billNo.toLowerCase())
        : []
      if (!rows.length) writeFail(`金蝶中未找到可入库的采购订单 ${billNo}（需已审核且仍有可入库数量）`)

      const validEntryIds = new Set(rows.map((row: any) => text(row.entryId)))
      const selectedEntryIds = entryIds.length ? entryIds : [...validEntryIds]
      if (selectedEntryIds.some((entryId) => !validEntryIds.has(entryId))) writeFail('采购订单明细已变化，请刷新后重试')

      const pushed = await pushBill(PURCHASE_ORDER_FORM, {
        Ids: '',
        Numbers: [billNo],
        EntryIds: entryIds.length ? selectedEntryIds.join(',') : '',
        RuleId: PURCHASE_ORDER_PUSH_RULE,
        TargetBillTypeId: '',
        TargetOrgId: 0,
        TargetFormId: PURCHASE_INBOUND_FORM,
        IsEnableDefaultRule: 'false',
        IsDraftWhenSaveFail: 'true',
        CustomParams: {},
      }, '下推采购入库', true)
      const entity = pushed.successEntities[0]
      const inboundBillNo = entityText(entity, 'Number')
      if (!inboundBillNo) writeFail('下推成功但未返回采购入库单号')
      const inboundId = entity?.Id ?? entity?.id ?? null

      if (autoAudit) {
        try {
          await submitBill(PURCHASE_INBOUND_FORM, [inboundBillNo], '提交采购入库单')
        } catch (error) {
          if (!alreadyCompleted(error)) throw error
        }
        try {
          await auditBill(PURCHASE_INBOUND_FORM, [inboundBillNo], '审核采购入库单')
        } catch (error) {
          if (!alreadyCompleted(error)) throw error
        }
        const audited = await queryK3DocumentList('purchaseInbound', { billNo: inboundBillNo, pageNum: 1, pageSize: 1000, documentStatus: 'C' })
        const auditedRows = Array.isArray(audited.rows)
          ? audited.rows.filter((row: any) => text(row.billNo).trim().toLowerCase() === inboundBillNo.toLowerCase())
          : []
        if (!auditedRows.length) writeFail(`采购入库单未进入已审核状态：${inboundBillNo}`)
      }

      const result = apiSuccess({
        purchaseOrderNo: billNo,
        inboundBillNo,
        inboundId,
        lineCount: selectedEntryIds.length,
        status: autoAudit ? 'C' : 'A',
        autoAudit,
      }, autoAudit ? `采购订单已下推并完成入库审核：${inboundBillNo}` : `采购订单已下推为采购入库单：${inboundBillNo}（未自动审核）`)
      await insertOperationLog(event, connection, session, '采购订单下推入库', 1, { ...body, requestId: requestKey }, result)
      return result
    },
    '金蝶采购入库失败，请检查单据状态或稍后重试',
  )
}

export default defineEventHandler(async (event) => {
  const rawBody = await readBody(event)
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
  const billNo = text(body.billNo)
  if (!billNo) return apiError('采购订单号不能为空', 400)
  const key = requestId(event, body, billNo)
  try {
    return await completePurchaseInbound(event, body, key)
  } catch (error) {
    if (error instanceof K3CloudError) return apiError(error.message, error.statusCode)
    if (error instanceof Error && /采购订单|明细|入库|不能为空|不一致|格式/.test(error.message)) return apiError(error.message, 400)
    console.error('[NitroStockDocument] purchase inbound failed:', error)
    return apiError('金蝶采购入库失败，请检查单据状态或稍后重试', 502)
  }
})
