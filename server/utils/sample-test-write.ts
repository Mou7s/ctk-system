import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { resolveMaterialById } from './material-read'
import { affectedRows, bodyOf, idList, insertOperationLog, text, withIdempotentWriteSession, withWriteSession, writeFail } from './write'

const statusSet = new Set(['draft', 'testing', 'ipqc_review', 'leader_review', 'supervisor_review', 'ren_review', 'approved', 'rejected'])
const finalResultSet = new Set(['合格', '不合格', '特采', ''])

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

async function generateTestNo(connection: PoolConnection): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `TK-SY-${dateStr}-`
  const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT test_no FROM tk_sample_test WHERE test_no LIKE CONCAT(?, '%') ORDER BY test_no DESC LIMIT 1`), [prefix])
  let seq = 1
  if (rows[0]?.test_no) {
    const last = String(rows[0].test_no).slice(prefix.length)
    const num = parseInt(last, 10)
    if (!Number.isNaN(num)) seq = num + 1
  }
  return `${prefix}${String(seq).padStart(3, '0')}`
}

async function assertAvlSupplier(connection: PoolConnection, supplierId: unknown, supplierName: unknown): Promise<string> {
  const id = Number(supplierId)
  if (!Number.isSafeInteger(id) || id <= 0) writeFail('供应商不能为空，且必须为已准入(AVL)供应商')
  const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT supplier_name FROM tk_supplier_access WHERE id = ? AND status = 'approved' AND is_avl = 1 LIMIT 1`), [id])
  if (!rows[0]) {
    const name = nullableText(supplierName, 255) || String(id)
    writeFail(`供应商"${name}"未准入(AVL)，请先在 采购管理->供应商准入 完成准入后再做样品测试`)
  }
  return String(rows[0].supplier_name || '')
}

async function requireK3Material(body: Record<string, unknown>) {
  const materialId = Number(body.materialId)
  if (!Number.isSafeInteger(materialId) || materialId <= 0) writeFail('请选择金蝶已审核、已启用的物料')
  const material = await resolveMaterialById(materialId)
  if (!material?.number) writeFail('所选金蝶物料不存在、未审核或已禁用，请重新选择')
  return material
}

export async function addSampleTest(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SampleTestAdd', 'tk_custom:sampleTest:add', requestId(event, body), body,
    async (session, connection, claim) => {
      const testNo = text(body.testNo) || await generateTestNo(connection)
      if (testNo.length > 32) writeFail('单号过长')
      const productName = nullableText(body.productName, 255)
      if (!productName) writeFail('产品名称不能为空')
      const resolvedName = await assertAvlSupplier(connection, body.supplierId, body.supplierName)
      const material = await requireK3Material(body)
      const materialNameSpec = `${material.name}${material.spec ? ` ${material.spec}` : ''}`.trim()
      // 新建一律草稿：状态/结论由签批流转决定，不接受前端自带
      const status = 'draft'
      const finalResult = null
      const result: any = await connection.query(mysqlQueryOptions(`
        INSERT INTO tk_sample_test
          (test_no, product_name, material_name_spec, supplier_id, supplier_name, material_id, material_number, material_name, material_spec, material_model, test_qty, test_qty_unit, test_dept,
           apply_date, reply_date, applicant, tester_name, tester_target_qty, tester_actual_qty, tester_usage, tester_remark,
           final_result, status, attachments, remark, created_by_id, created_by_name, updated_by_id, updated_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `), [
        testNo, productName, materialNameSpec || null, Number(body.supplierId), resolvedName, material.id, material.number,
        material.name || null, material.spec || null, material.number, nullableText(body.testQty, 100), nullableText(body.testQtyUnit, 32),
        nullableText(body.testDept, 100), dateText(body.applyDate), dateText(body.replyDate), nullableText(body.applicant, 100) || displayName(session), nullableText(body.testerName, 100),
        nullableText(body.testerTargetQty, 100), nullableText(body.testerActualQty, 100), nullableText(body.testerUsage, 100),
        nullableText(body.testerRemark, 2000), finalResult || null, status, nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), session.userId, displayName(session),
      ])
      await insertOperationLog(event, connection, session, '样品测试', 1, { id: result[0]?.insertId, testNo, requestId: claim.requestId })
      return apiSuccess({ id: result[0]?.insertId, testNo }, '样品测试已新增')
    }, '新增样品测试失败')
}

export async function updateSampleTest(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'SampleTestEdit', 'tk_custom:sampleTest:edit', requestId(event, body), body,
    async (session, connection, claim) => {
      const id = text(body.id)
      if (!/^\d+$/.test(id)) writeFail('ID不合法')
      const [exist]: any = await connection.query(mysqlQueryOptions(`SELECT status, final_result FROM tk_sample_test WHERE id = ?`), [Number(id)])
      if (!exist[0]) writeFail('记录不存在')
      if (['approved', 'rejected'].includes(exist[0].status)) writeFail('已核准/已驳回的单据不能通过编辑修改，请走签批流转')
      let _resolved: string | null = null
      if (body.supplierId != null || nullableText(body.supplierName, 255)) _resolved = await assertAvlSupplier(connection, body.supplierId, body.supplierName)
      const material = await requireK3Material(body)
      const materialNameSpec = `${material.name}${material.spec ? ` ${material.spec}` : ''}`.trim()
      // 编辑仅改基础信息，状态/结论由签批流转决定
      const result: any = await connection.query(mysqlQueryOptions(`
        UPDATE tk_sample_test SET
          product_name = ?, material_name_spec = ?, supplier_id = ?, supplier_name = ?, material_id = ?, material_number = ?, material_name = ?, material_spec = ?, material_model = ?,
          test_qty = ?, test_qty_unit = ?, test_dept = ?, apply_date = ?, reply_date = ?, applicant = ?, tester_name = ?,
          tester_target_qty = ?, tester_actual_qty = ?, tester_usage = ?, tester_remark = ?,
          attachments = ?, remark = ?,
          updated_by_id = ?, updated_by_name = ?, updated_at = NOW()
        WHERE id = ?
      `), [
        nullableText(body.productName, 255), materialNameSpec || null, Number(body.supplierId), _resolved, material.id, material.number,
        material.name || null, material.spec || null, material.number, nullableText(body.testQty, 100), nullableText(body.testQtyUnit, 32),
        nullableText(body.testDept, 100), dateText(body.applyDate), dateText(body.replyDate), nullableText(body.applicant, 100), nullableText(body.testerName, 100),
        nullableText(body.testerTargetQty, 100), nullableText(body.testerActualQty, 100), nullableText(body.testerUsage, 100),
        nullableText(body.testerRemark, 2000), nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), Number(id),
      ])
      if (!affectedRows(result[0])) writeFail('更新失败')
      await insertOperationLog(event, connection, session, '样品测试', 2, { id: Number(id), requestId: claim.requestId })
      return apiSuccess(undefined, '样品测试已更新')
    }, '更新样品测试失败')
}

export async function deleteSampleTest(event: H3Event) {
  const raw = getRouterParam(event, 'ids') || (event.context.params as any)?.ids || event.path?.split('/').pop()?.split('?')[0] || ''
  const ids = idList(raw, '样品测试ID')
  const body: any = { ids }
  return withIdempotentWriteSession(event, 'SampleTestDelete', 'tk_custom:sampleTest:remove', requestId(event, body), body,
    async (session, connection, claim) => {
      const placeholders = ids.map(() => '?').join(',')
      const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT id, status FROM tk_sample_test WHERE id IN (${placeholders})`), ids)
      if (!rows.length) writeFail('记录不存在')
      for (const r of rows) {
        if (['approved', 'rejected'].includes(r.status)) writeFail(`已终审单据不能删除 ID=${r.id}`)
      }
      const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_sample_test WHERE id IN (${placeholders})`), ids)
      await insertOperationLog(event, connection, session, '样品测试', 3, { ids, requestId: claim.requestId })
      return apiSuccess(undefined, `已删除 ${affectedRows(result[0])} 条`)
    }, '删除样品测试失败')
}

export async function signSampleTest(event: H3Event) {
  const body: any = await bodyOf(event)
  return withWriteSession(event, 'SampleTestSign', 'tk_custom:sampleTest:approve', async (session, connection) => {
    const id = text(body.id)
    const step = text(body.step) // tester | ipqc | leader | supervisor | approve | reject
    const opinion = nullableText(body.opinion, 2000)
    if (!/^\d+$/.test(id)) writeFail('ID不合法')
    const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT * FROM tk_sample_test WHERE id = ?`), [Number(id)])
    const row = rows[0]
    if (!row) writeFail('记录不存在')
    if (['approved', 'rejected'].includes(row.status)) writeFail('已终审单据不能再签批，请重新发起')
    if (!opinion) writeFail('请输入意见')
    const nowName = displayName(session)
    const nowId = session.userId
    let sql = ''
    let params: unknown[] = []
    let nextStatus = row.status
    // 各环节严格按状态推进，不跳步；测试员环节接受草稿/待测试（首签）
    if (step === 'tester') {
      if (!['draft', 'testing'].includes(row.status)) writeFail('当前不在待测试环节')
      sql = `UPDATE tk_sample_test SET tester_name = ?, tester_remark = ?, tester_by = ?, tester_by_id = ?, tester_at = NOW(), tester_target_qty = ?, tester_actual_qty = ?, tester_usage = ?, status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      nextStatus = 'ipqc_review'
      params = [nullableText(body.testerName, 100) || nowName, opinion || row.tester_remark, nowName, nowId, nullableText(body.testerTargetQty, 100) || row.tester_target_qty, nullableText(body.testerActualQty, 100) || row.tester_actual_qty, nullableText(body.testerUsage, 100) || row.tester_usage, nextStatus, nowId, nowName, Number(id)]
    } else if (step === 'ipqc') {
      if (row.status !== 'ipqc_review') writeFail('当前不在待IPQC环节')
      sql = `UPDATE tk_sample_test SET ipqc_opinion = ?, ipqc_by = ?, ipqc_by_id = ?, ipqc_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      nextStatus = 'leader_review'
      params = [opinion, nowName, nowId, nextStatus, nowId, nowName, Number(id)]
    } else if (step === 'leader') {
      if (row.status !== 'leader_review') writeFail('当前不在待组长环节')
      sql = `UPDATE tk_sample_test SET team_leader_opinion = ?, team_leader_by = ?, team_leader_by_id = ?, team_leader_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      nextStatus = 'supervisor_review'
      params = [opinion, nowName, nowId, nextStatus, nowId, nowName, Number(id)]
    } else if (step === 'supervisor') {
      if (row.status !== 'supervisor_review') writeFail('当前不在待主管环节')
      sql = `UPDATE tk_sample_test SET supervisor_opinion = ?, supervisor_by = ?, supervisor_by_id = ?, supervisor_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      nextStatus = 'ren_review'
      params = [opinion, nowName, nowId, nextStatus, nowId, nowName, Number(id)]
    } else if (step === 'approve') {
      if (row.status !== 'ren_review') writeFail('当前不在待总经理助理环节')
      const fr = text(body.finalResult) || '合格'
      if (!finalResultSet.has(fr)) writeFail('最终结论不合法')
      sql = `UPDATE tk_sample_test SET approver_opinion = ?, approver_by = ?, approver_by_id = ?, approver_at = NOW(), status = ?, final_result = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'approved', fr, nowId, nowName, Number(id)]
    } else if (step === 'reject') {
      // 中间环节只写意见通过往下走；只有总经理助理能驳回终结
      if (row.status !== 'ren_review') writeFail('只有总经理助理能驳回终结，中间环节请写明意见后通过')
      sql = `UPDATE tk_sample_test SET approver_opinion = ?, approver_by = ?, approver_by_id = ?, approver_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion || '驳回', nowName, nowId, 'rejected', nowId, nowName, Number(id)]
    } else {
      writeFail('签批步骤不合法')
    }
    await connection.query(mysqlQueryOptions(sql), params)
    await insertOperationLog(event, connection, session, '样品测试签批', 2, { id: Number(id), step, opinion })
    return apiSuccess(undefined, '签批成功')
  }, '签批失败')
}
