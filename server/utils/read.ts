import type { H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getAuthSession, hasPermission, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess, apiSuccessFields, errorMessage } from './response'

export type QueryMap = Record<string, unknown>

export interface PageRequest {
  pageNum: number
  pageSize: number
  offset: number
}

export interface DataScopeFragment {
  sql: string
  params: unknown[]
}

export function queryText(value: unknown): string {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '')
}

export function queryNumber(value: unknown, fallback = 0): number {
  const parsed = Number(queryText(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function queryInteger(value: unknown, fallback: number): number {
  const parsed = Number(queryText(value))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function pageRequest(query: QueryMap): PageRequest {
  const pageNum = Math.max(1, queryInteger(query.pageNum, 1))
  const pageSize = Math.max(1, queryInteger(query.pageSize, 10))
  return {
    pageNum,
    pageSize,
    offset: (pageNum - 1) * pageSize,
  }
}

export function camelizeKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function camelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeValue)
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [camelizeKey(key), camelizeValue(item)]),
  )
}

export function camelizeRows<T = Record<string, unknown>>(rows: unknown[]): T[] {
  return rows.map((row) => camelizeValue(row) as T)
}

export function tableResult(rows: unknown[], total: number, msg = '查询成功') {
  return apiSuccessFields({ rows: camelizeRows(rows), total: Number(total || 0) }, msg)
}

export function dataResult(data: unknown, msg = '操作成功') {
  return apiSuccess(data, msg)
}

export function fieldsResult(fields: Record<string, unknown>, msg = '操作成功') {
  return apiSuccessFields(fields, msg)
}

export function safeOrderBy(
  value: unknown,
  direction: unknown,
  columns: Record<string, string>,
): string | null {
  const column = queryText(value)
  if (!column) return ''

  const sqlColumn = columns[column]
  if (!sqlColumn) return null

  const rawDirection = queryText(direction).toLowerCase()
  if (rawDirection && !['asc', 'ascending', 'desc', 'descending'].includes(rawDirection)) return null

  const sqlDirection = rawDirection === 'desc' || rawDirection === 'descending' ? 'DESC' : 'ASC'
  return `ORDER BY ${sqlColumn} ${sqlDirection}`
}

export async function withReadSession<T>(
  event: H3Event,
  label: string,
  work: (session: AuthSession, pool: Pool) => Promise<T>,
  failureMessage = '查询失败',
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  return withReadDatabase(label, failureMessage, (pool) => work(authenticated.session, pool))
}

export async function withReadPermissionSession<T>(
  event: H3Event,
  label: string,
  permission: string,
  work: (session: AuthSession, pool: Pool) => Promise<T>,
  failureMessage = '查询失败',
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, permission)) return apiError('没有权限访问该接口', 403)

  return withReadDatabase(label, failureMessage, (pool) => work(authenticated.session, pool))
}

export async function withOptionalReadSession<T>(
  event: H3Event,
  label: string,
  work: (session: AuthSession | null, pool: Pool) => Promise<T>,
  failureMessage = '查询失败',
): Promise<T | ReturnType<typeof apiError>> {
  const authenticated = await getAuthSession(event)
  return withReadDatabase(label, failureMessage, (pool) => work(authenticated?.session || null, pool))
}

export async function withReadDatabase<T>(
  label: string,
  failureMessage: string,
  work: (pool: Pool) => Promise<T>,
): Promise<T | ReturnType<typeof apiError>> {
  try {
    return await work(getMysqlPool())
  } catch (error) {
    console.error(`[NitroRead:${label}] failed:`, errorMessage(error, 'unknown error'))
    return apiError(failureMessage, 500)
  }
}

export async function queryPage(
  pool: Pool,
  countSql: string,
  selectSql: string,
  countParams: unknown[],
  selectParams: unknown[],
): Promise<{ rows: RowDataPacket[]; total: number }> {
  const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(countSql), countParams)
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(selectSql), selectParams)
  return {
    rows,
    total: Number(countRows[0]?.total || 0),
  }
}

export async function dataScopeFragment(
  pool: Pool,
  session: AuthSession,
  permission: string | string[],
  deptAlias: string,
  userAlias = '',
): Promise<DataScopeFragment> {
  if (session.userId === 1) return { sql: '', params: [] }

  const roles = session.user.roles
    .filter((role) => role.roleId != null && role.status !== '1')
    .map((role) => ({ ...role, roleId: Number(role.roleId) }))
  if (!roles.length) return { sql: ` AND ${deptAlias}.dept_id = 0`, params: [] }

  const rawPermissions = Array.isArray(permission) ? permission : [permission]
  const permissions = Array.from(new Set(
    rawPermissions.flatMap((p) => {
      const perms = [p]
      if (p.endsWith(':list')) perms.push(p.replace(/:list$/, ':query'))
      else if (p.endsWith(':query')) perms.push(p.replace(/:query$/, ':list'))
      return perms
    }),
  ))

  const rolePlaceholders = roles.map(() => '?').join(', ')
  const permPlaceholders = permissions.map(() => '?').join(', ')
  const [permissionRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT DISTINCT rm.role_id
    FROM sys_role_menu rm
    INNER JOIN sys_menu m ON m.menu_id = rm.menu_id
    WHERE rm.role_id IN (${rolePlaceholders}) AND m.perms IN (${permPlaceholders})
  `), [...roles.map((role) => role.roleId), ...permissions])
  const permittedRoleIds = new Set(permissionRows.map((row) => Number(row.role_id)))
  const scopedRoles = roles.filter((role) => permittedRoleIds.has(role.roleId))

  if (scopedRoles.some((role) => role.dataScope === '1')) return { sql: '', params: [] }

  const clauses: string[] = []
  const params: unknown[] = []
  for (const role of scopedRoles) {
    switch (role.dataScope) {
      case '2':
        clauses.push(`${deptAlias}.dept_id IN (SELECT dept_id FROM sys_role_dept WHERE role_id = ?)`)
        params.push(role.roleId)
        break
      case '3':
        clauses.push(`${deptAlias}.dept_id = ?`)
        params.push(session.deptId)
        break
      case '4':
        clauses.push(`${deptAlias}.dept_id IN (SELECT dept_id FROM sys_dept WHERE dept_id = ? OR FIND_IN_SET(?, ancestors))`)
        params.push(session.deptId, session.deptId)
        break
      case '5':
        if (userAlias) {
          clauses.push(`${userAlias}.user_id = ?`)
          params.push(session.userId)
        } else {
          clauses.push(`${deptAlias}.dept_id = 0`)
        }
        break
      default:
        break
    }
  }

  if (!clauses.length) return { sql: ` AND ${deptAlias}.dept_id = 0`, params: [] }
  return { sql: ` AND (${clauses.join(' OR ')})`, params }
}
