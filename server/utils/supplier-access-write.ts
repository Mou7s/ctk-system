import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { affectedRows, bodyOf, idList, insertOperationLog, text, withIdempotentWriteSession, withWriteSession, writeFail } from './write'
import { hasRole } from './auth'

const statusSet = new Set(['draft', 'purchaser_review', 'quality_review', 'engineer_review', 'manager_review', 'approved', 'rejected'])
const finalResultSet = new Set(['准入', '不准入', '有条件准入', ''])

function displayName(session: AuthSession): string {
  return text(session.user.nickName) || session.userName
}
function nullableText(value: unknown, max: number): string | null {
  const t = text(value)
  if (!t) return null
  return t.slice(0, max)
}
function dateText(value: unknown): string | null {
  const t = text(value)
  if (!t) return null
  const m = t.match(/^(\d{4}-\d{1,2}-\d{1,2})/)
  if (!m) writeFail('日期格式必须为 YYYY-MM-DD')
  const parts = m[1].split('-').map(Number)
  const normalized = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  const d = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) writeFail('日期格式不正确')
  return normalized
}
function requestId(event: H3Event, body: Record<string, unknown> = {}): string {
  const hk = (event as any).headers ? String((event as any).headers['idempotency-key'] || '') : ''
  return hk || text(body.requestId) || crypto.randomUUID()
}
async function generateAccessNo(connection: PoolConnection): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `SQ-RZ-${dateStr}-`
  const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT access_no FROM tk_supplier_access WHERE access_no LIKE CONCAT(?, '%') ORDER BY access_no DESC LIMIT 1`), [prefix])
  let seq = 1
  if (rows[0]?.access_no) {
    const last = String(rows[0].access_no).slice(prefix.length)
    const num = parseInt(last, 10)
    if (!Number.isNaN(num)) seq = num + 1
  }
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function addSupplierAccess(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SupplierAccessAdd', 'tk_custom:supplierAccess:add', requestId(event, body), body,
    async (session, connection, claim) => {
      const accessNo = text(body.accessNo) || await generateAccessNo(connection)
      if (accessNo.length > 32) writeFail('单号过长')
      const supplierName = nullableText(body.supplierName, 255)
      if (!supplierName) writeFail('供应商名称不能为空')
      // 新建一律草稿：状态/结论/AVL 由评审流转决定，不接受前端自带
      const status = 'draft'
      const finalResult = null
      const isAvlValue = 0
      const result: any = await connection.query(mysqlQueryOptions(`
        INSERT INTO tk_supplier_access
          (access_no, supplier_name, contact_name, contact_phone, contact_email, main_materials, address, business_license_no, certificates, supply_capacity,
           apply_date, applicant, final_result, is_avl, status, attachments, remark, created_by_id, created_by_name, updated_by_id, updated_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `), [
        accessNo, supplierName, nullableText(body.contactName, 100), nullableText(body.contactPhone, 100), nullableText(body.contactEmail, 255),
        nullableText(body.mainMaterials, 500), nullableText(body.address, 500), nullableText(body.businessLicenseNo, 100), nullableText(body.certificates, 1000), nullableText(body.supplyCapacity, 500),
        dateText(body.applyDate), nullableText(body.applicant, 100) || displayName(session), finalResult || null, isAvlValue, status, nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), session.userId, displayName(session),
      ])
      await insertOperationLog(event, connection, session, '供应商准入', 1, { id: result[0]?.insertId, accessNo, requestId: claim.requestId })
      return apiSuccess({ id: result[0]?.insertId, accessNo }, '供应商准入已新增')
    }, '新增供应商准入失败')
}

export async function updateSupplierAccess(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SupplierAccessEdit', 'tk_custom:supplierAccess:edit', requestId(event, body), body,
    async (session, connection, claim) => {
      const id = text(body.id)
      if (!/^\d+$/.test(id)) writeFail('ID不合法')
      const [exist]: any = await connection.query(mysqlQueryOptions(`SELECT status, final_result, is_avl FROM tk_supplier_access WHERE id = ?`), [Number(id)])
      if (!exist[0]) writeFail('记录不存在')
      if (['approved', 'rejected'].includes(exist[0].status)) writeFail('已终审单据不能通过编辑修改，请走评审流转')
      // 编辑仅允许改基础信息，状态/结论/AVL 由评审流转决定，不允许手填
      const status = exist[0].status
      const finalResult = exist[0].final_result
      const isAvl = exist[0].is_avl
      const result: any = await connection.query(mysqlQueryOptions(`
        UPDATE tk_supplier_access SET
          supplier_name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, main_materials = ?, address = ?, business_license_no = ?, certificates = ?, supply_capacity = ?,
          apply_date = ?, applicant = ?, attachments = ?, remark = ?,
          updated_by_id = ?, updated_by_name = ?, updated_at = NOW()
        WHERE id = ?
      `), [
        nullableText(body.supplierName, 255), nullableText(body.contactName, 100), nullableText(body.contactPhone, 100), nullableText(body.contactEmail, 255), nullableText(body.mainMaterials, 500), nullableText(body.address, 500), nullableText(body.businessLicenseNo, 100), nullableText(body.certificates, 1000), nullableText(body.supplyCapacity, 500),
        dateText(body.applyDate), nullableText(body.applicant, 100), nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), Number(id),
      ])
      if (!affectedRows(result[0])) writeFail('更新失败')
      await insertOperationLog(event, connection, session, '供应商准入', 2, { id: Number(id), requestId: claim.requestId })
      return apiSuccess(undefined, '供应商准入已更新')
    }, '更新失败')
}

export async function deleteSupplierAccess(event: H3Event) {
  const raw = getRouterParam(event, 'ids') || (event.context.params as any)?.ids || event.path?.split('/').pop()?.split('?')[0] || ''
  const ids = idList(raw, '供应商准入ID')
  const body: any = { ids }
  return withIdempotentWriteSession(event, 'SupplierAccessDelete', 'tk_custom:supplierAccess:remove', requestId(event, body), body,
    async (session, connection, claim) => {
      const placeholders = ids.map(() => '?').join(',')
      const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT id, status FROM tk_supplier_access WHERE id IN (${placeholders})`), ids)
      if (!rows.length) writeFail('记录不存在')
      for (const r of rows) if (['approved', 'rejected'].includes(r.status)) writeFail(`已终审单据不能删除 ID=${r.id}`)
      const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_supplier_access WHERE id IN (${placeholders})`), ids)
      await insertOperationLog(event, connection, session, '供应商准入', 3, { ids, requestId: claim.requestId })
      return apiSuccess(undefined, `已删除 ${affectedRows(result[0])} 条`)
    }, '删除失败')
}

export async function signSupplierAccess(event: H3Event) {
  const body: any = await bodyOf(event)
  console.log('[signSupplierAccess] body', JSON.stringify(body).slice(0,500))
  return withWriteSession(event, 'SupplierAccessSign', 'tk_custom:supplierAccess:approve', async (session, connection) => {
    const id = text(body.id)
    const opinion = nullableText(body.opinion, 2000)
    const action = text(body.action) || (text(body.step) === 'reject' ? 'reject' : 'approve')
    const finalResultInput = text(body.finalResult)
    if (!/^\d+$/.test(id)) writeFail('ID不合法')
    if (!opinion) writeFail('请填写评审意见')
    const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT * FROM tk_supplier_access WHERE id = ?`), [Number(id)])
    const row = rows[0]
    if (!row) writeFail('记录不存在')
    if (['approved', 'rejected'].includes(row.status)) writeFail('已终审单据不能再评审')
    const nowName = displayName(session)
    const nowId = session.userId
    const status: string = row.status
    let sql = ''
    let params: unknown[] = []

    // 驳回：任意待审状态，谁负责当前状态谁可驳回
    if (action === 'reject') {
      if (status === 'purchaser_review' || status === 'draft') {
        if (!hasRole(session, 'purchaser')) writeFail('该步骤仅采购员(杨阳)可评审')
      } else if (status === 'quality_review') {
        if (!hasRole(session, 'quality_control')) writeFail('该步骤仅品质(彭奇)可评审')
      } else if (status === 'engineer_review') {
        if (!hasRole(session, 'rd_engineering_manager')) writeFail('该步骤仅工程(刘广金)可评审')
      } else if (status === 'manager_review') {
        if (!hasRole(session, 'general_manager')) writeFail('最终评审仅总经理(钟平权)可操作')
      } else {
        writeFail('当前状态不允许驳回')
      }
      sql = `UPDATE tk_supplier_access SET final_result = ?, is_avl = ?, status = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`
      // 驳回时同时记录当前环节的意见到对应字段
      if (status === 'purchaser_review' || status === 'draft') {
        await connection.query(mysqlQueryOptions(`UPDATE tk_supplier_access SET purchaser_opinion = ?, purchaser_by = ?, purchaser_by_id = ?, purchaser_at = NOW() WHERE id = ?`), [opinion, nowName, nowId, Number(id)])
      } else if (status === 'quality_review') {
        await connection.query(mysqlQueryOptions(`UPDATE tk_supplier_access SET quality_opinion = ?, quality_by = ?, quality_by_id = ?, quality_at = NOW() WHERE id = ?`), [opinion, nowName, nowId, Number(id)])
      } else if (status === 'engineer_review') {
        await connection.query(mysqlQueryOptions(`UPDATE tk_supplier_access SET engineer_opinion = ?, engineer_by = ?, engineer_by_id = ?, engineer_at = NOW() WHERE id = ?`), [opinion, nowName, nowId, Number(id)])
      } else if (status === 'manager_review') {
        await connection.query(mysqlQueryOptions(`UPDATE tk_supplier_access SET manager_opinion = ?, manager_by = ?, manager_by_id = ?, manager_at = NOW() WHERE id = ?`), [opinion, nowName, nowId, Number(id)])
      }
      params = ['不准入', 0, 'rejected', nowId, nowName, Number(id)]
      await connection.query(mysqlQueryOptions(sql), params)
      await insertOperationLog(event, connection, session, '供应商准入驳回', 2, { id: Number(id), status, opinion })
      return apiSuccess(undefined, '已驳回')
    }

    // 通过
    if (status === 'draft' || status === 'purchaser_review') {
      if (!hasRole(session, 'purchaser')) writeFail('该步骤仅采购员(杨阳)可评审')
      sql = `UPDATE tk_supplier_access SET purchaser_opinion = ?, purchaser_by = ?, purchaser_by_id = ?, purchaser_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'quality_review', nowId, nowName, Number(id)]
    } else if (status === 'quality_review') {
      if (!hasRole(session, 'quality_control')) writeFail('该步骤仅品质(彭奇)可评审')
      sql = `UPDATE tk_supplier_access SET quality_opinion = ?, quality_by = ?, quality_by_id = ?, quality_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'engineer_review', nowId, nowName, Number(id)]
    } else if (status === 'engineer_review') {
      if (!hasRole(session, 'rd_engineering_manager')) writeFail('该步骤仅工程(刘广金)可评审')
      sql = `UPDATE tk_supplier_access SET engineer_opinion = ?, engineer_by = ?, engineer_by_id = ?, engineer_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'manager_review', nowId, nowName, Number(id)]
    } else if (status === 'manager_review') {
      if (!hasRole(session, 'general_manager')) writeFail('最终评审仅总经理(钟平权)可操作')
      let fr = finalResultInput || '准入'
      if (!finalResultSet.has(fr)) writeFail('准入结论不合法')
      // 管理员选 不准入 实际等同驳回，但此处通过 准入/有条件准入 两种；总经理意见落行
      if (fr === '不准入') {
        sql = `UPDATE tk_supplier_access SET manager_opinion = ?, manager_by = ?, manager_by_id = ?, manager_at = NOW(), final_result = ?, is_avl = ?, status = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`
        params = [opinion, nowName, nowId, fr, 0, 'rejected', nowId, nowName, Number(id)]
      } else {
        sql = `UPDATE tk_supplier_access SET manager_opinion = ?, manager_by = ?, manager_by_id = ?, manager_at = NOW(), final_result = ?, is_avl = ?, status = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`
        params = [opinion, nowName, nowId, fr, 1, 'approved', nowId, nowName, Number(id)]
      }
    } else {
      writeFail('当前状态不允许评审')
    }
    await connection.query(mysqlQueryOptions(sql), params)
    await insertOperationLog(event, connection, session, '供应商准入通过', 2, { id: Number(id), status, opinion })
    return apiSuccess(undefined, '评审通过，已流转到下一环节')
  }, '评审失败')
}
