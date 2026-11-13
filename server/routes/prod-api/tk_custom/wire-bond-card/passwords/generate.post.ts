import type { RowDataPacket } from 'mysql2/promise'
import { readBody } from 'h3'
import { getAuthSession } from '../../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../../utils/mysql'
import { apiError, apiSuccess, errorMessage } from '../../../../../utils/response'
import { generateRandomDigitPassword, WIRE_BOND_ALLOWED_USERIDS } from '../../../../../utils/pinyin-initials'

interface UserTargetRow extends RowDataPacket {
  userid: string
  name: string
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const { session } = authenticated
  if (session.userName !== 'admin' && Number(session.userId) !== 1) {
    return apiError('无权访问此功能，仅限管理员操作', 403)
  }

  const body = await readBody(event).catch(() => ({}))
  const pool = getMysqlPool()

  try {
    let targetRows: UserTargetRow[] = []

    const allowedSet = new Set<string>(WIRE_BOND_ALLOWED_USERIDS)
    const allowedPlaceholders = WIRE_BOND_ALLOWED_USERIDS.map(() => '?').join(', ')

    if (Array.isArray(body?.userids) && body.userids.length > 0) {
      const userids = body.userids
        .map((id: unknown) => String(id || '').trim().toLowerCase())
        .filter((id: string) => Boolean(id) && allowedSet.has(id))
      if (userids.length > 0) {
        const placeholders = userids.map(() => '?').join(', ')
        const [rows] = await pool.query<UserTargetRow[]>(mysqlQueryOptions(`
          SELECT LOWER(userid) AS userid, name
          FROM wxuser
          WHERE LOWER(userid) IN (${placeholders})
        `), userids)
        targetRows = rows
      }
    } else if (body?.forceAll) {
      // 批量重置指定 7 位焊线部员工为随机 6 位数字密码
      const [allRows] = await pool.query<UserTargetRow[]>(mysqlQueryOptions(`
        SELECT LOWER(userid) AS userid, name
        FROM wxuser
        WHERE LOWER(userid) IN (${allowedPlaceholders})
      `), [...WIRE_BOND_ALLOWED_USERIDS])
      targetRows = allRows
    } else {
      // 仅查询尚未设置密码的指定 7 位焊线部员工
      const [missingRows] = await pool.query<UserTargetRow[]>(mysqlQueryOptions(`
        SELECT LOWER(w.userid) AS userid, w.name
        FROM wxuser w
        LEFT JOIN tk_machine_credential c 
          ON LOWER(c.userid) = LOWER(w.userid) AND c.machine_type = 'wire_bond'
        WHERE LOWER(w.userid) IN (${allowedPlaceholders})
          AND (c.password IS NULL OR c.password = '')
      `), [...WIRE_BOND_ALLOWED_USERIDS])
      targetRows = missingRows
    }

    if (targetRows.length === 0) {
      return apiSuccess({ count: 0, generated: [] }, '没有需要生成密码的员工')
    }

    const generatedResults: Array<{ userid: string; password: string }> = []
    const usedBatchPasswords = new Set<string>()
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      for (const user of targetRows) {
        const normalizedUserid = String(user.userid || '').toLowerCase()
        // 生成无规律 6 位随机纯数字密码，且保证同一批次内不重号
        let password = generateRandomDigitPassword(6)
        for (let retry = 0; retry < 10 && usedBatchPasswords.has(password); retry++) {
          password = generateRandomDigitPassword(6)
        }
        usedBatchPasswords.add(password)

        await connection.query(mysqlQueryOptions(`
          INSERT INTO tk_machine_credential (userid, password, machine_type, created_by, updated_at)
          VALUES (?, ?, 'wire_bond', ?, NOW())
          ON DUPLICATE KEY UPDATE
            userid = VALUES(userid),
            password = VALUES(password),
            updated_at = NOW()
        `), [normalizedUserid, password, session.userName])

        generatedResults.push({ userid: normalizedUserid, password })
      }

      await connection.commit()
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }

    return apiSuccess({
      count: generatedResults.length,
      generated: generatedResults,
    }, `成功随机生成 6 位数字密码，已更新 ${generatedResults.length} 位员工`)
  } catch (error) {
    console.error('[WireBondCard] generate passwords failed:', errorMessage(error, 'unknown error'))
    return apiError('生成密码失败', 500)
  }
})
