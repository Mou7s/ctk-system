import type { H3Event } from 'h3'
import { getHeader, getQuery, readBody, readMultipartFormData, setHeader } from 'h3'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { getAuthSession, hasPermission } from './auth'
import { getMysqlPool } from './mysql'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { customerCardFields, customerKeys } from '../../app/packages/shared/customerCard.js'
import { recognizeCustomerCard } from './customer-card-ocr'

const permission = (action: string) => `tk_custom:customerCard:${({ create: 'add', review: 'approve', followup: 'weekly' } as Record<string, string>)[action] || action}`
const fieldColumns: Record<string, string> = { country: 'country', nature: 'customer_nature', company: 'company_name', shortName: 'short_name', website: 'website', address: 'address', contact: 'contact_name', position: 'job_title', phone: 'phone', email: 'email', whatsapp: 'whatsapp', remark: 'remark' }
const selectCard = `SELECT c.*, c.created_by_id owner_id, c.review_status status, c.review_comment review_note, w.reviewer_id, w.conflicts, w.request_id, (w.photo_data IS NOT NULL) has_photo FROM tk_customer_card c LEFT JOIN tk_customer_card_workflow w ON w.customer_id = c.id`
function fail(message: string, code = 400): never { throw Object.assign(new Error(message), { code }) }
function decode(value: any) { return typeof value === 'string' ? JSON.parse(value) : value }
function positiveId(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) fail('客户编号无效'); return id }
function requestId(value: unknown) { if (!/^[a-f0-9-]{36}$/i.test(String(value))) fail('请求标识无效'); return String(value) }
function fields(body: any) {
  const result: Record<string, string> = {}
  for (const [key] of customerCardFields) {
    if (body[key] != null && typeof body[key] !== 'string') fail('客户字段格式错误')
    result[key] = String(body[key] || '').trim()
    const limits: Record<string, number> = { country: 50, nature: 50, company: 255, shortName: 100, website: 255, address: 500, contact: 100, position: 100, phone: 64, email: 255, whatsapp: 100, remark: 2000 }
    if (result[key].length > limits[key]) fail('客户字段内容过长')
  }
  if (!result.company) fail('请填写公司名称')
  return result
}
async function conflicts(db: any, data: any) {
  const keys = customerKeys(data)
  if (!Object.values(keys).some(Boolean)) return []
  // Normalize historical rows too: older *_norm values may use another convention.
  const [rows] = await db.query("SELECT id, salesperson, company_name, website, email, phone FROM tk_customer_card WHERE review_status IN ('active','pending') ORDER BY id")
  const labels: Record<string, string> = { company: '公司名称', website: '公司网址', email: '邮箱', phone: '电话号码' }
  // Do not expose another salesperson's contact information in conflict results.
  return rows.map((row: any) => {
    const saved = customerKeys({ company: row.company_name, website: row.website, email: row.email, phone: row.phone })
    return { id: row.id, salesperson: row.salesperson, matches: Object.entries(keys).filter(([key, value]) => value && value === saved[key]).map(([key]) => labels[key]) }
  }).filter((row: any) => row.matches.length)
}
export async function resolveCardReviewer(db: any, deptId: number | null, ownerId: number) {
  const [rows] = await db.query(`WITH RECURSIVE department_chain AS (
    SELECT dept_id, parent_id, leader, 0 depth FROM sys_dept
    WHERE dept_id = ? AND status = '0' AND del_flag = '0'
    UNION ALL
    SELECT p.dept_id, p.parent_id, p.leader, d.depth + 1 FROM sys_dept p
    JOIN department_chain d ON p.dept_id = d.parent_id
    WHERE p.status = '0' AND p.del_flag = '0' AND d.depth < 20
  ) SELECT u.user_id FROM (
    SELECT dept_id, leader FROM department_chain WHERE TRIM(COALESCE(leader,'')) <> '' ORDER BY depth LIMIT 1
  ) d JOIN sys_user u ON (u.user_name = d.leader OR u.nick_name = d.leader)
    AND u.dept_id = d.dept_id AND u.status = '0' AND u.del_flag = '0'`, [deptId])
  const ids = [...new Set(rows.map((r: any) => Number(r.user_id)))]
  if (ids.length !== 1 || ids[0] === ownerId) fail('所属部门负责人未配置、存在同名或为本人，请管理员核对部门负责人')
  return ids[0]
}
function serialize(row: any) { return { ...row, payload: row.payload ? decode(row.payload) : Object.fromEntries(Object.entries(fieldColumns).map(([key, column]) => [key, row[column] || ''])), conflicts: decode(row.conflicts) || [] } }

export async function customerCardAction(event: H3Event, action: string) {
  const auth = await getAuthSession(event)
  if (!auth) return apiError('登录状态已过期', 401)
  const session = auth.session
  const needed = action === 'ocr' || action === 'check' ? 'create' : action === 'detail' || action === 'photo' ? 'list' : action
  if (!hasPermission(session, permission(needed))) return apiError('没有权限访问该接口', 403)
  const pool = getMysqlPool()
  try {
    if (action === 'photo') {
      const id = positiveId(getQuery(event).id)
      const [rows]: any = await pool.query(`SELECT w.photo_data, w.photo_type FROM tk_customer_card c JOIN tk_customer_card_workflow w ON w.customer_id=c.id WHERE c.id=? AND c.review_status <> 'deleted' AND (c.created_by_id=? OR w.reviewer_id=?)`, [id, session.userId, session.userId])
      if (!rows.length || !rows[0].photo_data) fail('名片图片不存在或无权访问', 404)
      setHeader(event, 'Content-Type', rows[0].photo_type)
      setHeader(event, 'Cache-Control', 'private, no-store')
      setHeader(event, 'X-Content-Type-Options', 'nosniff')
      return rows[0].photo_data
    }
    if (action === 'ocr') {
      const parts = await readMultipartFormData(event)
      const photo = parts?.find(p => p.name === 'photo')
      if (!photo || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type || '') || photo.data.length > 10 * 1024 * 1024) fail('请选择不超过 10MB 的 JPG、PNG 或 WebP 名片照片')
      try { return apiSuccess(await recognizeCustomerCard(photo.data)) }
      catch { return apiError('名片识别失败，请确认服务器已安装 Windows OCR 中英文语言包，或换一张清晰照片', 502) }
    }
    if (action === 'list') {
      const query = getQuery(event)
      const page = Math.min(1_000_000, Math.max(1, Math.floor(Number(query.pageNum)) || 1))
      const size = Math.min(50, Math.max(1, Math.floor(Number(query.pageSize)) || 10))
      const args: any[] = [session.userId, session.userId]
      let where = "c.review_status <> 'deleted' AND (c.created_by_id = ? OR w.reviewer_id = ?)"
      if (query.keyword) { where += ' AND c.company_name LIKE ?'; args.push(`%${String(query.keyword).slice(0, 100)}%`) }
      if (query.status && ['active', 'pending', 'rejected'].includes(String(query.status))) { where += ' AND c.review_status = ?'; args.push(query.status) }
      const [rows]: any = await pool.query(`${selectCard} WHERE ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size])
      const [counts]: any = await pool.query(`SELECT COUNT(*) total FROM tk_customer_card c LEFT JOIN tk_customer_card_workflow w ON w.customer_id=c.id WHERE ${where}`, args)
      return apiSuccessFields({ rows: rows.map(serialize), total: Number(counts[0].total) })
    }
    if (action === 'detail') {
      const id = positiveId(getQuery(event).id)
      const [rows]: any = await pool.query(`${selectCard} WHERE c.id = ? AND c.review_status <> 'deleted' AND (c.created_by_id = ? OR w.reviewer_id = ?)`, [id, session.userId, session.userId])
      if (!rows.length) fail('客户不存在或无权访问', 404)
      const [followups] = await pool.query("SELECT f.id, f.customer_id, f.created_by_id author_id, f.created_by_name author_name, DATE_FORMAT(f.week_start, '%Y-%m-%d') week_start, f.content, m.next_plan, f.created_at FROM tk_customer_weekly f LEFT JOIN tk_customer_weekly_meta m ON m.weekly_id=f.id WHERE f.customer_id = ? ORDER BY f.week_start DESC, f.created_at DESC, f.id DESC", [id])
      return apiSuccess({ ...serialize(rows[0]), followups, canReview: rows[0].status === 'pending' && Number(rows[0].reviewer_id) === session.userId && Number(rows[0].owner_id) !== session.userId && hasPermission(session, permission('review')) })
    }
    let photo: { data: Buffer; type: string } | null = null
    let body: any
    if (action === 'create' && getHeader(event, 'content-type')?.startsWith('multipart/form-data')) {
      const parts = await readMultipartFormData(event)
      const record = parts?.find(p => p.name === 'record')
      try { body = JSON.parse(record?.data.toString('utf8') || '') } catch { fail('客户数据格式错误') }
      const image = parts?.find(p => p.name === 'photo')
      if (image) {
        if (!image.data.length || image.data.length > 10 * 1024 * 1024) fail('照片不能超过10MB且不能为空')
        let format: string | undefined
        try { format = (await sharp(image.data, { limitInputPixels: 40_000_000 }).metadata()).format } catch { fail('名片图片无效') }
        const type = ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[format || '']
        if (!type || type !== image.type) fail('请选择真实的 JPG、PNG 或 WebP 名片照片')
        photo = { data: image.data, type }
      }
    } else body = await readBody(event)
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求格式错误')
    if (action === 'check') return apiSuccess(await conflicts(pool, fields(body)))
    const db = await pool.getConnection()
    let locked = false
    try {
      if (action === 'create') {
        const [lock]: any = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':customer-card-create'), 5) acquired")
        if (Number(lock[0].acquired) !== 1) fail('其他客户正在录入，请稍后重试', 409)
        locked = true
      }
      await db.beginTransaction()
      let response: any
      if (action === 'create') {
        const payload = fields(body), token = requestId(body.requestId)
        const [existing]: any = await db.query(`${selectCard} WHERE w.request_id = ?`, [token])
        if (existing.length) {
          if (Number(existing[0].owner_id) !== session.userId) fail('请求标识已被使用', 409)
          if (existing[0].status === 'deleted') fail('该客户已删除，请重新打开录入窗口', 409)
          const saved = serialize(existing[0]).payload
          if (customerCardFields.some(([key]) => saved[key] !== payload[key])) fail('上次请求已保存不同内容，请刷新后重新录入', 409)
          const [photos]: any = await db.query('SELECT photo_data FROM tk_customer_card_workflow WHERE customer_id=?', [existing[0].id])
          const samePhoto = photo ? photos[0]?.photo_data && createHash('sha256').update(photos[0].photo_data).digest('hex') === createHash('sha256').update(photo.data).digest('hex') : !photos[0]?.photo_data
          if (!samePhoto) fail('上次请求已保存不同照片，请刷新后重新录入', 409)
          response = { id: existing[0].id, status: existing[0].status, conflicts: decode(existing[0].conflicts) }
        } else {
          const matches = await conflicts(db, payload)
          const reviewer = matches.length ? await resolveCardReviewer(db, session.deptId, session.userId) : null
          const keys = customerKeys(payload), status = matches.length ? 'pending' : 'active'
          const name = session.user.nickName || session.userName
          const columns = Object.values(fieldColumns)
          const [insert]: any = await db.query(`INSERT INTO tk_customer_card (${columns.join(',')}, salesperson, company_norm, website_norm, email_norm, phone_norm, review_status, created_by_id, created_by_name) VALUES (${Array(columns.length + 8).fill('?').join(',')})`, [...Object.keys(fieldColumns).map(key => payload[key]), name, keys.company, keys.website, keys.email, keys.phone, status, session.userId, name])
          await db.query('INSERT INTO tk_customer_card_workflow (customer_id, dept_id, reviewer_id, conflicts, request_id, photo_data, photo_type) VALUES (?,?,?,?,?,?,?)', [insert.insertId, session.deptId, reviewer, JSON.stringify(matches), token, photo?.data || null, photo?.type || null])
          response = { id: insert.insertId, status, conflicts: matches }
        }
      } else {
        const id = positiveId(body.id)
        const [rows]: any = await db.query(`${selectCard} WHERE c.id = ? FOR UPDATE`, [id])
        if (!rows.length) fail('客户不存在', 404)
        const row = rows[0]
        if (action === 'remove') {
          if (Number(row.owner_id) !== session.userId && session.userId !== 1) fail('仅能删除本人录入的客户', 403)
          if (row.status !== 'deleted') await db.query("UPDATE tk_customer_card SET review_status='deleted' WHERE id=?", [id])
          response = { id }
        } else if (row.status === 'deleted') fail('客户已删除', 404)
        else if (action === 'review') {
          if (Number(row.reviewer_id) !== session.userId || Number(row.owner_id) === session.userId) fail('仅指定的部门负责人可审核，不能审核本人客户', 403)
          if (row.status !== 'pending') fail('该客户已审核，请刷新页面', 409)
          if (!['approve', 'reject'].includes(body.decision)) fail('审核决定无效')
          const note = String(body.note || '').trim()
          if (!note || note.length > 2000) fail('请填写不超过2000字的审核意见')
          await db.query('UPDATE tk_customer_card SET review_status = ?, review_comment = ?, review_by_id = ?, review_by_name = ?, review_at = NOW() WHERE id = ?', [body.decision === 'approve' ? 'active' : 'rejected', note, session.userId, session.user.nickName || session.userName, id])
          response = { id }
        } else if (action === 'followup') {
          if (Number(row.owner_id) !== session.userId) fail('仅客户所属业务员可填写周动态', 403)
          if (row.status !== 'active') fail('客户审核通过后才能填写周动态', 409)
          const week = String(body.weekStart || ''), date = new Date(`${week}T00:00:00Z`)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== week || date.getUTCDay() !== 1) fail('请选择对应周的周一日期')
          const content = String(body.content || '').trim(), plan = String(body.nextPlan || '').trim(), token = requestId(body.requestId)
          if (!content || content.length > 2000 || plan.length > 2000) fail('请填写跟进动态，每项不超过2000字')
          const [old]: any = await db.query('SELECT f.customer_id, f.created_by_id author_id, r.content, r.next_plan, r.week_start FROM tk_customer_weekly_request r JOIN tk_customer_weekly f ON f.id=r.weekly_id WHERE r.request_id = ?', [token])
          if (old.length && (Number(old[0].customer_id) !== id || Number(old[0].author_id) !== session.userId)) fail('请求标识已被使用', 409)
          if (old.length && (old[0].content !== content || old[0].next_plan !== plan || String(old[0].week_start) !== week)) fail('上次请求已保存不同内容，请刷新后重新填写', 409)
          if (!old.length) {
            const [previous]: any = await db.query('SELECT id, created_by_id FROM tk_customer_weekly WHERE customer_id=? AND week_start=? FOR UPDATE', [id, week])
            let weeklyId: number
            if (previous.length) {
              if (Number(previous[0].created_by_id) !== session.userId) fail('该周已有其他业务员的记录，请联系管理员核对', 409)
              weeklyId = previous[0].id
              await db.query('UPDATE tk_customer_weekly SET content=?, updated_by_id=?, updated_by_name=?, updated_at=NOW() WHERE id=?', [content, session.userId, session.user.nickName || session.userName, weeklyId])
            } else {
              const [insert]: any = await db.query('INSERT INTO tk_customer_weekly (customer_id, created_by_id, created_by_name, week_start, week_no, content) VALUES (?,?,?,?,WEEK(?,3),?)', [id, session.userId, session.user.nickName || session.userName, week, week, content])
              weeklyId = insert.insertId
            }
            await db.query('INSERT INTO tk_customer_weekly_meta (weekly_id, next_plan, request_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE next_plan=VALUES(next_plan),request_id=VALUES(request_id)', [weeklyId, plan, token])
            await db.query('INSERT INTO tk_customer_weekly_request (request_id, weekly_id, week_start, content, next_plan) VALUES (?,?,?,?,?)', [token, weeklyId, week, content, plan])
          }
          response = { id }
        } else fail('接口不存在', 404)
      }
      await db.commit()
      return apiSuccess(response)
    } catch (error) { await db.rollback(); throw error }
    finally {
      if (locked) {
        try { await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':customer-card-create'))") }
        catch { db.destroy() }
      }
      db.release()
    }
  } catch (error: any) {
    if ([400, 403, 404, 409].includes(error.code)) return apiError(error.message, error.code)
    return apiError('客户操作失败，请检查数据库迁移或稍后重试', 500)
  }
}
