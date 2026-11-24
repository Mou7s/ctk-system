import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import type { Pool } from 'mysql2/promise'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import { getAttendanceMysqlPool, attendanceQueryOptions } from './attendance-mysql'
import { queryText, queryInteger, pageRequest, tableResult, dataResult } from './read'
import { apiError, errorMessage } from './response'

const PERM_QUERY = 'tk_custom:attendance:query'
const MIN_RECORD_YEAR = 2021
const MAX_PAGE_SIZE = 200

async function withAttendanceSession<T>(
  event: H3Event,
  label: string,
  work: (session: AuthSession, pool: Pool) => Promise<T>,
  failureMessage = '查询失败',
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, PERM_QUERY)) return apiError('没有权限访问该接口', 403)

  try {
    return await work(authenticated.session, getAttendanceMysqlPool())
  } catch (error) {
    console.error(`[NitroRead:${label}] failed:`, errorMessage(error, 'unknown error'))
    return apiError(failureMessage, 500)
  }
}

function recordTable(year: number): string {
  const nowYear = new Date().getFullYear()
  const valid = Number.isInteger(year) && year >= MIN_RECORD_YEAR && year <= nowYear + 1 ? year : nowYear
  return `device_record${valid}`
}

function currentYear(): number {
  return new Date().getFullYear()
}

function todayYmd(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function dateOr(value: unknown, fallback: string): string {
  const text = queryText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

const recordColumns = `
  id, cardID,
  DATE_FORMAT(\`date\`, '%Y-%m-%d %H:%i:%s') AS \`date\`,
  deptID, deptName, deviceID, enTranceOrExit, position, testResult, userID, userName
`

export async function listAttendanceRecords(event: H3Event) {
  return withAttendanceSession(event, 'AttendanceRecords', async (_session, pool: Pool) => {
    const q: Record<string, unknown> = getQuery(event) as Record<string, unknown>
    const table = recordTable(queryInteger(q.year, currentYear()))
    const today = todayYmd()
    const dateFrom = dateOr(q.dateFrom, today)
    const dateTo = dateOr(q.dateTo, today)
    const { pageSize, offset } = pageRequest({ ...q, pageSize: Math.min(queryInteger(q.pageSize, 20), MAX_PAGE_SIZE) })

    const conditions = ['`date` >= ?', '`date` < DATE_ADD(?, INTERVAL 1 DAY)']
    const params: unknown[] = [dateFrom, dateTo]
    const keyword = queryText(q.keyword)
    if (keyword) {
      conditions.push('(userName LIKE CONCAT(\'%\', ?, \'%\') OR userID LIKE CONCAT(\'%\', ?, \'%\') OR cardID LIKE CONCAT(\'%\', ?, \'%\'))')
      params.push(keyword, keyword, keyword)
    }
    const deviceId = queryText(q.deviceId)
    if (deviceId) {
      conditions.push('deviceID = ?')
      params.push(deviceId)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const [rows]: any = await pool.query(
      attendanceQueryOptions(`SELECT ${recordColumns} FROM ${table} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`),
      [...params, pageSize, offset],
    )
    const [countRows]: any = await pool.query(
      attendanceQueryOptions(`SELECT COUNT(*) AS total FROM ${table} ${where}`),
      params,
    )
    return tableResult(rows, countRows[0]?.total || 0)
  }, '查询考勤记录失败')
}

export async function getAttendanceSummary(event: H3Event) {
  return withAttendanceSession(event, 'AttendanceSummary', async (_session, pool: Pool) => {
    const table = recordTable(currentYear())
    const [[punchRows]]: any = await pool.query(
      attendanceQueryOptions(`SELECT COUNT(*) AS c FROM ${table} WHERE \`date\` >= CURDATE() AND \`date\` < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`),
    )
    const [[headRows]]: any = await pool.query(
      attendanceQueryOptions(`SELECT COUNT(DISTINCT userID) AS c FROM ${table} WHERE \`date\` >= CURDATE() AND \`date\` < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`),
    )
    const [[staffRows]]: any = await pool.query(attendanceQueryOptions('SELECT COUNT(*) AS c FROM userinfo'))
    return dataResult({
      year: currentYear(),
      punchToday: Number(punchRows?.c || 0),
      headsToday: Number(headRows?.c || 0),
      staffTotal: Number(staffRows?.c || 0),
    })
  }, '查询考勤汇总失败')
}
