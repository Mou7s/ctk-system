import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { resolveMaterialById } from './material-read'
import { affectedRows, bodyOf, idList, insertOperationLog, text, withIdempotentWriteSession, withWriteSession, writeFail } from './write'

// NPI 统一链：采购提交 → 测试员 → IPQC → 组长 → 主管 → 总经理助理 → 总经理终审（定准入结论）
const statusSet = new Set(['draft', 'testing', 'ipqc_review', 'leader_review', 'supervisor_review', 'assistant_review', 'manager_review', 'approved', 'rejected'])
const accessResultSet = new Set(['准入', '有条件准入', '不准入', ''])

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

async function generateNpiNo(connection: PoolConnection): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `NPI-${dateStr}-`
  const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT npi_no FROM tk_npi WHERE npi_no LIKE CONCAT(?, '%') ORDER BY npi_no DESC LIMIT 1`), [prefix])
  let seq = 1
  if (rows[0]?.npi_no) {
    const last = String(rows[0].npi_no).slice(prefix.length)
    const num = parseInt(last, 10)
    if (!Number.isNaN(num)) seq = num + 1
  }
  return `${prefix}${String(seq).padStart(3, '0')}`
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

async function requireK3Material(body: Record<string, unknown>) {
  const materialId = Number(body.materialId)
  if (!Number.isSafeInteger(materialId) || materialId <= 0) writeFail('请选择金蝶已审核、已启用的物料')
  const material = await resolveMaterialById(materialId)
  if (!material?.number) writeFail('所选金蝶物料不存在、未审核或已禁用，请重新选择')
  return material
}

export async function addNpi(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'NpiAdd', 'tk_custom:npi:add', requestId(event, body), body,
    async (session, connection, claim) => {
      const npiNo = text(body.npiNo) || await generateNpiNo(connection)
      if (npiNo.length > 32) writeFail('单号过长')
      // 新供应商无需预先准入：供应商名称自由填写，准入结论由总经理终审一次定
      const supplierName = nullableText(body.supplierName, 255)
      if (!supplierName) writeFail('供应商名称不能为空')
      const material = await requireK3Material(body)
      // 产品名称已下线：统一用金蝶物料名（兼容旧查询口径）
      const productName = nullableText(body.productName, 255) || material.name
      const materialNameSpec = `${material.name}${material.spec ? ` ${material.spec}` : ''}`.trim()
      // 建单即提交送测：直接进待测试，省掉二次 update 留孤儿草稿
      const initStatus = body.submit ? 'testing' : 'draft'
      const result: any = await connection.query(mysqlQueryOptions(`
        INSERT INTO tk_npi
          (npi_no, supplier_name, contact_name, contact_phone, contact_email, main_materials, address, business_license_no, certificates, supply_capacity,
           product_name, material_name_spec, material_id, material_number, material_name, material_spec, material_model,
           test_qty, test_qty_unit, test_dept, apply_date, reply_date, applicant,
           tester_name, tester_target_qty, tester_actual_qty, tester_usage, tester_remark,
           status, attachments, remark, created_by_id, created_by_name, updated_by_id, updated_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `), [
        npiNo, supplierName, nullableText(body.contactName, 100), nullableText(body.contactPhone, 100), nullableText(body.contactEmail, 255),
        nullableText(body.mainMaterials, 500), nullableText(body.address, 500), nullableText(body.businessLicenseNo, 100), nullableText(body.certificates, 1000), nullableText(body.supplyCapacity, 500),
        productName, materialNameSpec || null, material.id, material.number, material.name || null, material.spec || null, material.number,
        nullableText(body.testQty, 100), nullableText(body.testQtyUnit, 32) || 'KG', nullableText(body.testDept, 100),
        dateText(body.applyDate), dateText(body.replyDate), nullableText(body.applicant, 100) || displayName(session),
        nullableText(body.testerName, 100), nullableText(body.testerTargetQty, 100), nullableText(body.testerActualQty, 100), nullableText(body.testerUsage, 100), nullableText(body.testerRemark, 2000),
        initStatus, nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), session.userId, displayName(session),
      ])
      await insertOperationLog(event, connection, session, 'NPI申请', 1, { id: result[0]?.insertId, npiNo, submit: !!body.submit, requestId: claim.requestId })
      return apiSuccess({ id: result[0]?.insertId, npiNo }, body.submit ? 'NPI申请已提交送测' : 'NPI申请已新增')
    }, '新增NPI失败')
}

export async function updateNpi(event: H3Event) {
  const body: any = await bodyOf(event)
  return withIdempotentWriteSession(event, 'NpiEdit', 'tk_custom:npi:edit', requestId(event, body), body,
    async (session, connection, claim) => {
      const id = text(body.id)
      if (!/^\d+$/.test(id)) writeFail('ID不合法')
      const [exist]: any = await connection.query(mysqlQueryOptions(`SELECT status FROM tk_npi WHERE id = ?`), [Number(id)])
      if (!exist[0]) writeFail('记录不存在')
      if (['approved', 'rejected'].includes(exist[0].status)) writeFail('已准入/已驳回的单据不能通过编辑修改，请重新发起')
      if (exist[0].status !== 'draft') writeFail('已提交送测的单据只能走签批流转，不能再编辑')
      const supplierName = nullableText(body.supplierName, 255)
      if (!supplierName) writeFail('供应商名称不能为空')
      const material = await requireK3Material(body)
      const productName = nullableText(body.productName, 255) || material.name
      const materialNameSpec = `${material.name}${material.spec ? ` ${material.spec}` : ''}`.trim()
      // 采购提交送测：草稿 → 待测试，进入测试链
      const nextStatus = body.submit ? 'testing' : 'draft'
      const result: any = await connection.query(mysqlQueryOptions(`
        UPDATE tk_npi SET
          supplier_name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, main_materials = ?, address = ?, business_license_no = ?, certificates = ?, supply_capacity = ?,
          product_name = ?, material_name_spec = ?, material_id = ?, material_number = ?, material_name = ?, material_spec = ?, material_model = ?,
          test_qty = ?, test_qty_unit = ?, test_dept = ?, apply_date = ?, reply_date = ?, applicant = ?, tester_name = ?,
          tester_target_qty = ?, tester_actual_qty = ?, tester_usage = ?, tester_remark = ?,
          status = ?, attachments = ?, remark = ?,
          updated_by_id = ?, updated_by_name = ?, updated_at = NOW()
        WHERE id = ?
      `), [
        supplierName, nullableText(body.contactName, 100), nullableText(body.contactPhone, 100), nullableText(body.contactEmail, 255),
        nullableText(body.mainMaterials, 500), nullableText(body.address, 500), nullableText(body.businessLicenseNo, 100), nullableText(body.certificates, 1000), nullableText(body.supplyCapacity, 500),
        productName, materialNameSpec || null, material.id, material.number, material.name || null, material.spec || null, material.number,
        nullableText(body.testQty, 100), nullableText(body.testQtyUnit, 32) || 'KG', nullableText(body.testDept, 100),
        dateText(body.applyDate), dateText(body.replyDate), nullableText(body.applicant, 100), nullableText(body.testerName, 100),
        nullableText(body.testerTargetQty, 100), nullableText(body.testerActualQty, 100), nullableText(body.testerUsage, 100), nullableText(body.testerRemark, 2000),
        nextStatus, nullableText(body.attachments, 2000), nullableText(body.remark, 2000),
        session.userId, displayName(session), Number(id),
      ])
      if (!affectedRows(result[0])) writeFail('更新失败')
      await insertOperationLog(event, connection, session, 'NPI申请', 2, { id: Number(id), submit: !!body.submit, requestId: claim.requestId })
      return apiSuccess(undefined, body.submit ? '已提交送测' : 'NPI申请已更新')
    }, '更新NPI失败')
}

export async function deleteNpi(event: H3Event) {
  const raw = getRouterParam(event, 'ids') || (event.context.params as any)?.ids || event.path?.split('/').pop()?.split('?')[0] || ''
  const ids = idList(raw, 'NPI ID')
  const body: any = { ids }
  return withIdempotentWriteSession(event, 'NpiDelete', 'tk_custom:npi:remove', requestId(event, body), body,
    async (session, connection, claim) => {
      const placeholders = ids.map(() => '?').join(',')
      const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT id, status FROM tk_npi WHERE id IN (${placeholders})`), ids)
      if (!rows.length) writeFail('记录不存在')
      for (const r of rows) {
        if (['approved', 'rejected'].includes(r.status)) writeFail(`已终审单据不能删除 ID=${r.id}`)
      }
      const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM tk_npi WHERE id IN (${placeholders})`), ids)
      await insertOperationLog(event, connection, session, 'NPI申请', 3, { ids, requestId: claim.requestId })
      return apiSuccess(undefined, `已删除 ${affectedRows(result[0])} 条`)
    }, '删除NPI失败')
}

export async function signNpi(event: H3Event) {
  const body: any = await bodyOf(event)
  return withWriteSession(event, 'NpiSign', 'tk_custom:npi:approve', async (session, connection) => {
    const id = text(body.id)
    const step = text(body.step) // tester | ipqc | leader | supervisor | assistant | approve | reject
    const opinion = nullableText(body.opinion, 2000)
    if (!/^\d+$/.test(id)) writeFail('ID不合法')
    if (!opinion) writeFail('请输入意见')
    const [rows]: any = await connection.query(mysqlQueryOptions(`SELECT * FROM tk_npi WHERE id = ?`), [Number(id)])
    const row = rows[0]
    if (!row) writeFail('记录不存在')
    if (['approved', 'rejected'].includes(row.status)) writeFail('已终审单据不能再签批，请重新发起')
    const nowName = displayName(session)
    const nowId = session.userId
    let sql = ''
    let params: unknown[] = []
    // 各环节严格按状态推进，不跳步
    if (step === 'tester') {
      if (row.status !== 'testing') writeFail('当前不在待测试环节')
      sql = `UPDATE tk_npi SET tester_name = ?, tester_remark = ?, tester_by = ?, tester_by_id = ?, tester_at = NOW(), tester_target_qty = ?, tester_actual_qty = ?, tester_usage = ?, status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [nullableText(body.testerName, 100) || nowName, opinion, nowName, nowId, nullableText(body.testerTargetQty, 100) || row.tester_target_qty, nullableText(body.testerActualQty, 100) || row.tester_actual_qty, nullableText(body.testerUsage, 100) || row.tester_usage, 'ipqc_review', nowId, nowName, Number(id)]
    } else if (step === 'ipqc') {
      if (row.status !== 'ipqc_review') writeFail('当前不在待IPQC环节')
      sql = `UPDATE tk_npi SET ipqc_opinion = ?, ipqc_by = ?, ipqc_by_id = ?, ipqc_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'leader_review', nowId, nowName, Number(id)]
    } else if (step === 'leader') {
      if (row.status !== 'leader_review') writeFail('当前不在待组长环节')
      sql = `UPDATE tk_npi SET team_leader_opinion = ?, team_leader_by = ?, team_leader_by_id = ?, team_leader_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'supervisor_review', nowId, nowName, Number(id)]
    } else if (step === 'supervisor') {
      if (row.status !== 'supervisor_review') writeFail('当前不在待主管环节')
      sql = `UPDATE tk_npi SET supervisor_opinion = ?, supervisor_by = ?, supervisor_by_id = ?, supervisor_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'assistant_review', nowId, nowName, Number(id)]
    } else if (step === 'assistant') {
      if (row.status !== 'assistant_review') writeFail('当前不在待总经理助理环节')
      sql = `UPDATE tk_npi SET assistant_opinion = ?, assistant_by = ?, assistant_by_id = ?, assistant_at = NOW(), status = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'manager_review', nowId, nowName, Number(id)]
    } else if (step === 'approve') {
      if (row.status !== 'manager_review') writeFail('当前不在待总经理环节')
      // 总经理定准入结论：通过只允许 准入/有条件准入，不准入请走驳回
      const ar = text(body.accessResult)
      if (ar !== '准入' && ar !== '有条件准入') writeFail('通过只允许准入/有条件准入，不准入请走驳回')
      // 终审通过：同名供应商已有 AVL 档案则复用挂接，避免重复建档；没有才自动建档并纳入AVL
      const [avlExist]: any = await connection.query(mysqlQueryOptions(`SELECT id FROM tk_supplier_access WHERE supplier_name = ? AND status = 'approved' AND is_avl = 1 LIMIT 1`), [row.supplier_name])
      let accessId = avlExist[0]?.id ?? null
      if (!accessId) {
        const accessNo = await generateAccessNo(connection)
        const accessResult: any = await connection.query(mysqlQueryOptions(`
          INSERT INTO tk_supplier_access
            (access_no, supplier_name, contact_name, contact_phone, contact_email, main_materials, address, business_license_no, certificates, supply_capacity,
             apply_date, applicant, final_result, is_avl, status, attachments, remark, created_by_id, created_by_name, updated_by_id, updated_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'approved', ?, ?, ?, ?, ?, ?)
        `), [
          accessNo, row.supplier_name, row.contact_name, row.contact_phone, row.contact_email, row.main_materials, row.address,
          row.business_license_no, row.certificates, row.supply_capacity,
          row.apply_date, row.applicant || nowName, ar, row.attachments, `NPI终审自动建档（${row.npi_no}）`,
          nowId, nowName, nowId, nowName,
        ])
        accessId = accessResult[0]?.insertId
      }
      sql = `UPDATE tk_npi SET approver_opinion = ?, approver_by = ?, approver_by_id = ?, approver_at = NOW(), status = ?, access_result = ?, access_id = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion, nowName, nowId, 'approved', ar, accessId, nowId, nowName, Number(id)]
    } else if (step === 'reject') {
      // 只有总经理能终结单据：中间环节只能写明意见后通过往下游走
      if (row.status !== 'manager_review') writeFail('只有总经理能驳回终结，中间环节请写明意见后通过')
      const ar = text(body.accessResult)
      if (ar && !accessResultSet.has(ar)) writeFail('准入结论不合法')
      sql = `UPDATE tk_npi SET approver_opinion = ?, approver_by = ?, approver_by_id = ?, approver_at = NOW(), status = ?, access_result = ?, updated_by_id = ?, updated_by_name = ? WHERE id = ?`
      params = [opinion || '驳回', nowName, nowId, 'rejected', ar || row.access_result, nowId, nowName, Number(id)]
    } else {
      writeFail('签批步骤不合法')
    }
    await connection.query(mysqlQueryOptions(sql), params)
    await insertOperationLog(event, connection, session, 'NPI签批', 2, { id: Number(id), step, opinion })
    return apiSuccess(undefined, '签批成功')
  }, '签批失败')
}
