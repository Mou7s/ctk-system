import type { RowDataPacket } from 'mysql2/promise'
import { getAuthSession } from '../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../utils/mysql'
import { WIRE_BOND_ALLOWED_USERIDS } from '../../../../utils/pinyin-initials'
import { apiError, apiSuccessFields, errorMessage } from '../../../../utils/response'

interface WireBondUserRow extends RowDataPacket {
  userid: string
  name: string | null
  dept: string | null
  position: string | null
  password: string | null
  credential_status: string | null
  credential_updated_at: string | null
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const { session } = authenticated
  if (session.userName !== 'admin' && Number(session.userId) !== 1) {
    return apiError('无权访问此功能，仅限管理员操作', 403)
  }

  try {
    const pool = getMysqlPool()
    const placeholders = WIRE_BOND_ALLOWED_USERIDS.map(() => '?').join(', ')
    const [rows] = await pool.query<WireBondUserRow[]>(mysqlQueryOptions(`
      SELECT 
        LOWER(w.userid) AS userid,
        w.name,
        w.dept,
        w.position,
        c.password,
        c.status AS credential_status,
        c.updated_at AS credential_updated_at
      FROM wxuser w
      LEFT JOIN tk_machine_credential c 
        ON LOWER(c.userid) = LOWER(w.userid) AND c.machine_type = 'wire_bond'
      WHERE LOWER(w.userid) IN (${placeholders})
      ORDER BY FIELD(LOWER(w.userid), ${placeholders})
    `), [...WIRE_BOND_ALLOWED_USERIDS, ...WIRE_BOND_ALLOWED_USERIDS])

    const list = rows.map((row) => ({
      userid: String(row.userid || '').toLowerCase(),
      name: row.name || '',
      dept: row.dept || '焊线部',
      position: row.position || '',
      password: row.password || '',
      hasPassword: Boolean(row.password),
      updatedAt: row.credential_updated_at,
    }))

    return apiSuccessFields({
      rows: list,
      total: list.length,
    }, '查询成功')
  } catch (error) {
    console.error('[WireBondCard] list users failed:', errorMessage(error, 'unknown error'))
    return apiError('查询焊线部员工失败', 500)
  }
})
