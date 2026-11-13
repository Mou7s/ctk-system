import { readBody } from 'h3'
import { getAuthSession } from '../../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../../utils/mysql'
import { WIRE_BOND_ALLOWED_USERIDS } from '../../../../../utils/pinyin-initials'
import { apiError, apiSuccess, errorMessage } from '../../../../../utils/response'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const { session } = authenticated
  if (session.userName !== 'admin' && Number(session.userId) !== 1) {
    return apiError('无权访问此功能，仅限管理员操作', 403)
  }

  const body = await readBody(event).catch(() => ({}))
  const userid = String(body?.userid || '').trim().toLowerCase()
  const password = String(body?.password || '').trim()

  if (!userid) {
    return apiError('员工UserID不能为空', 400)
  }
  if (!WIRE_BOND_ALLOWED_USERIDS.includes(userid as typeof WIRE_BOND_ALLOWED_USERIDS[number])) {
    return apiError('该账号不在当前焊线机工卡打印名单内', 400)
  }
  if (!password) {
    return apiError('密码不能为空', 400)
  }

  try {
    const pool = getMysqlPool()
    await pool.query(mysqlQueryOptions(`
      INSERT INTO tk_machine_credential (userid, password, machine_type, created_by, updated_at)
      VALUES (?, ?, 'wire_bond', ?, NOW())
      ON DUPLICATE KEY UPDATE
        userid = VALUES(userid),
        password = VALUES(password),
        updated_at = NOW()
    `), [userid, password, session.userName])

    return apiSuccess({ userid, password }, '密码更新成功')
  } catch (error) {
    console.error('[WireBondCard] update password failed:', errorMessage(error, 'unknown error'))
    return apiError('更新密码失败', 500)
  }
})
