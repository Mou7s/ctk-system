import { createReadStream } from 'node:fs'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import type { H3Event } from 'h3'
import { getQuery, getRouterParam, readBody, sendStream, setHeader } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { pageRequest, queryPage, queryText, withOptionalReadSession } from './read'

type Query = Record<string, unknown>
const COLUMNS = 'sp_no, sp_name, sp_status, template_id, apply_time, applyer_userid, applyer_partyid, apply_data_contents, outtime, backtime, auditerid'

function mapRow(row: RowDataPacket, names: Map<string, string>) {
  const result = { ...row }
  const applyer = String(row.applyer_userid || '')
  result.applyer_userid = names.get(applyer) || applyer
  result.auditerid = String(row.auditerid || '').split(',').map((value) => names.get(value.trim()) || value.trim()).filter(Boolean).join(' → ')
  return result
}

async function names(pool: Pool, rows: RowDataPacket[]) {
  const ids = [...new Set(rows.flatMap((row) => [String(row.applyer_userid || ''), ...String(row.auditerid || '').split(',')]).map((value) => value.trim()).filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const [userRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT userid, name FROM wxuser WHERE (status IS NULL OR status = 'active') AND userid IN (${ids.map(() => '?').join(', ')})`), ids)
  return new Map(userRows.map((row) => [String(row.userid), String(row.name || row.userid)]))
}

function baseFilter(kind: string, query: Query): { sql: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  if (kind === 'list') conditions.push("sp_name = '外出放行条'", '(outtime IS NULL OR backtime IS NULL)')
  if (kind === 'out') conditions.push("sp_name = '物品放行'", 'outtime IS NULL')
  if (kind === 'back') conditions.push("sp_name = '物品放行'", 'backtime IS NULL', 'outtime IS NOT NULL')
  if (kind === 'out1') conditions.push("sp_name = '外出'", 'outtime IS NULL')
  if (kind === 'back1') conditions.push("sp_name = '外出'", 'backtime IS NULL', 'outtime IS NOT NULL')
  for (const [field, column] of [['spName', 'sp_name'], ['spStatus', 'sp_status'], ['templateId', 'template_id'], ['applyerUserid', 'applyer_userid'], ['applyerPartyid', 'applyer_partyid'], ['auditerid', 'auditerid']] as const) {
    const value = queryText(query[field])
    if (value) {
      conditions.push(`${column} = ?`)
      params.push(value)
    }
  }
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params }
}

export async function listWxApprove(event: H3Event, kind = 'list') {
  return withOptionalReadSession(event, 'WxApproveList', async (_, pool: Pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const filter = baseFilter(kind, query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM wx_approve${filter.sql}`,
      `SELECT ${COLUMNS} FROM wx_approve${filter.sql} ORDER BY apply_time DESC LIMIT ?, ?`,
      filter.params,
      [...filter.params, page.offset, page.pageSize],
    )
    const userNames = await names(pool, result.rows)
    return apiSuccessFields({ rows: result.rows.map((row) => mapRow(row, userNames)), total: result.total }, '查询成功')
  }, '获取微信审批列表失败')
}

export async function getWxApprove(event: H3Event) {
  return withOptionalReadSession(event, 'WxApproveDetail', async (_, pool: Pool) => {
    const spNo = queryText(getRouterParam(event, 'spNo'))
    if (!spNo) return apiError('审批编号不能为空')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${COLUMNS} FROM wx_approve WHERE sp_no = ? LIMIT 1`), [spNo])
    const userNames = await names(pool, rows)
    return apiSuccess(rows[0] ? mapRow(rows[0], userNames) : null)
  }, '获取微信审批详情失败')
}

export async function queryBa(event: H3Event) {
  return withOptionalReadSession(event, 'WxApproveBa', async (_, pool: Pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions("SELECT name FROM wxuser WHERE (status IS NULL OR status = 'active') AND dept = '1' ORDER BY name"))
    return apiSuccessFields({ rows: rows.map((row) => String(row.name || '')), total: rows.length }, '查询成功')
  }, '获取保安名单失败')
}

export async function queryCardNumbers(event: H3Event) {
  return withOptionalReadSession(event, 'WxApproveCardNumber', async (_, pool: Pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(apply_data_contents, '$.carNumber')) AS car_number
      FROM wx_approve
      WHERE DATE(apply_time) = CURRENT_DATE() AND JSON_EXTRACT(apply_data_contents, '$.carNumber') IS NOT NULL
    `))
    const values = rows.map((row) => String(row.car_number || '').trim()).filter(Boolean)
    return apiSuccessFields({ rows: values, total: values.length }, '查询成功')
  }, '获取车牌列表失败')
}

function safeImagePath(folder: string, id: string) {
  if (!id || /[\\/\r\n\0]/.test(id)) return null
  const root = resolve(getNitroServerConfig().profilePath)
  const file = resolve(root, folder, `${id}.png`)
  const rel = relative(root, file)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) return null
  return file
}

export async function getWxApproveImage(event: H3Event, folder: 'wx_pic' | 'pic_zip') {
  const file = safeImagePath(folder, queryText(getRouterParam(event, 'id')))
  if (!file) return apiError('图片参数不符合规范')
  try {
    setHeader(event, 'content-type', 'image/png')
    setHeader(event, 'content-disposition', `inline; filename="${basename(file)}"`)
    return sendStream(event, createReadStream(file))
  } catch {
    return apiError('图片不存在', 404)
  }
}

export async function updateWxApproveTime(event: H3Event, type: 'out' | 'back') {
  const spNo = queryText(getRouterParam(event, 'spno'))
  if (!spNo) return apiError('审批编号不能为空')
  const pool = getMysqlPool()
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT sp_no, apply_data_contents, outtime, backtime FROM wx_approve WHERE sp_no = ? LIMIT 1`), [spNo])
  const row = rows[0]
  if (!row) return apiError('审批记录不存在', 404)
  if (type === 'back') {
    const [result]: any = await pool.execute(mysqlQueryOptions('UPDATE wx_approve SET backtime = NOW() WHERE sp_no = ?'), [spNo])
    return result.affectedRows ? apiSuccess() : apiError('操作失败')
  }
  let content: Record<string, unknown> = {}
  try { content = JSON.parse(String(row.apply_data_contents || '{}')) } catch { /* preserve malformed source content */ }
  const params = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
  if (params.carNumber) content.carNumber = params.carNumber
  if (params.baoan) content.baoan = params.baoan
  const needBack = String(content.needBack || '') === '是'
  const [result]: any = await pool.execute(mysqlQueryOptions(`UPDATE wx_approve SET apply_data_contents = ?, outtime = NOW()${needBack ? '' : ', backtime = NOW()'} WHERE sp_no = ?`), [JSON.stringify(content), spNo])
  return result.affectedRows ? apiSuccess() : apiError('操作失败')
}
