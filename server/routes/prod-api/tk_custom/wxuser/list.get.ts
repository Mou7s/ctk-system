import type { RowDataPacket } from 'mysql2/promise'
import { getQuery } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../utils/mysql'
import { apiError, apiSuccessFields, errorMessage } from '../../../../utils/response'

interface WxuserRow extends RowDataPacket {
  userid: string
  name: string | null
  dept: string | null
  position: string | null
}

function queryText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '')
}

function pageValue(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(queryText(value))
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

const sortableColumns: Record<string, string> = {
  userid: 'userid',
  name: 'name',
  dept: 'dept',
  position: 'position',
}

function orderByValue(value: unknown, direction: unknown): string | null {
  const column = queryText(value)
  if (!column) return ''

  const sqlColumn = sortableColumns[column]
  if (!sqlColumn) return null

  const rawDirection = queryText(direction).toLowerCase()
  if (rawDirection && !['asc', 'ascending', 'desc', 'descending'].includes(rawDirection)) return null

  const sqlDirection = rawDirection === 'desc' || rawDirection === 'descending' ? 'DESC' : 'ASC'
  return `ORDER BY ${sqlColumn} ${sqlDirection}`
}

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const query = getQuery(event)
  const pageNum = pageValue(query.pageNum, 1, 1000000)
  const pageSize = pageValue(query.pageSize, 10, 500)
  const name = queryText(query.name)
  const dept = queryText(query.dept)
  const position = queryText(query.position)
  const orderBy = orderByValue(query.orderByColumn, query.isAsc)

  if (orderBy === null) return apiError('参数不符合规范，不能进行查询', 500)

  const conditions: string[] = []
  const parameters: string[] = []
  if (name) {
    conditions.push('name LIKE CONCAT(\'%\', ?, \'%\')')
    parameters.push(name)
  }
  if (dept) {
    conditions.push('dept = ?')
    parameters.push(dept)
  }
  if (position) {
    conditions.push('position = ?')
    parameters.push(position)
  }

  conditions.unshift("(status IS NULL OR status = 'active')")
  const whereSql = `WHERE ${conditions.join(' AND ')}`
  const offset = (pageNum - 1) * pageSize

  try {
    const pool = getMysqlPool()
    const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT COUNT(*) AS total FROM wxuser ${whereSql}`,
    ),
      parameters,
    )
    const [rows] = await pool.query<WxuserRow[]>(mysqlQueryOptions(
      `SELECT userid, name, dept, position
       FROM wxuser
       ${whereSql}
       ${orderBy}
       LIMIT ?, ?`,
    ),
      [...parameters, offset, pageSize],
    )

    return apiSuccessFields({
      rows: rows.map(({ userid, name, dept, position }) => ({ userid, name, dept, position })),
      total: Number(countRows[0]?.total || 0),
    }, '查询成功')
  } catch (error) {
    console.error('[NitroWxuser] list failed:', errorMessage(error, 'unknown error'))
    return apiError('获取企业微信成员列表失败', 500)
  }
})
