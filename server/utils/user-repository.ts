import type { RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import type { AuthRole, AuthUser } from './auth'

export interface AuthDbUser extends AuthUser {
  password: string
}

interface UserRow extends RowDataPacket {
  user_id: number
  dept_id: number | null
  user_name: string
  nick_name: string
  email: string | null
  phonenumber: string | null
  sex: string | null
  avatar: string | null
  password: string
  status: string
  del_flag: string
}

interface RoleRow extends RowDataPacket {
  role_id: number
  role_name: string
  role_key: string
  data_scope: string
  status: string
}

export async function findUserByUsername(username: string): Promise<AuthDbUser | null> {
  const pool = getMysqlPool()
  const [rows] = await pool.query<UserRow[]>(mysqlQueryOptions(`
    SELECT user_id, dept_id, user_name, nick_name, email, phonenumber, sex,
           avatar, password, status, del_flag
    FROM sys_user
    WHERE user_name = ? AND del_flag = '0'
    LIMIT 1
  `), [username])

  const row = rows[0]
  if (!row) return null

  const [roleRows] = await pool.query<RoleRow[]>(mysqlQueryOptions(`
    SELECT r.role_id, r.role_name, r.role_key, r.data_scope, r.status
    FROM sys_role r
    INNER JOIN sys_user_role ur ON ur.role_id = r.role_id
    WHERE ur.user_id = ? AND r.del_flag = '0'
    ORDER BY r.role_sort, r.role_id
  `), [row.user_id])

  const roles: AuthRole[] = roleRows
    .filter((role) => role.status === '0')
    .map((role) => ({
      roleId: role.role_id,
      roleName: role.role_name,
      roleKey: role.role_key,
      dataScope: role.data_scope,
      status: role.status,
    }))

  return {
    userId: row.user_id,
    deptId: row.dept_id,
    userName: row.user_name,
    nickName: row.nick_name,
    email: row.email,
    phonenumber: row.phonenumber,
    sex: row.sex,
    avatar: row.avatar,
    status: row.status,
    delFlag: row.del_flag,
    roles,
    password: row.password,
  }
}

export async function getUserPermissions(userId: number, isAdmin = userId === 1): Promise<string[]> {
  if (isAdmin) return ['*:*:*']

  const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT DISTINCT m.perms
    FROM sys_menu m
    INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
    INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
    INNER JOIN sys_role r ON r.role_id = ur.role_id
    WHERE m.status = '0' AND r.status = '0' AND ur.user_id = ?
      AND m.menu_type IN ('M', 'C', 'F') AND m.perms IS NOT NULL AND m.perms <> ''
  `), [userId])

  return rows.map((row) => String(row.perms)).filter(Boolean)
}

export async function getUserMenuIds(userId: number, isAdmin = userId === 1): Promise<number[]> {
  const pool = getMysqlPool()
  const [rows] = isAdmin
    ? await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT m.menu_id
        FROM sys_menu m
        WHERE m.status = '0' AND m.menu_type IN ('M', 'C')
        ORDER BY m.menu_id
      `))
    : await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
        SELECT DISTINCT m.menu_id
        FROM sys_menu m
        INNER JOIN sys_role_menu rm ON rm.menu_id = m.menu_id
        INNER JOIN sys_user_role ur ON ur.role_id = rm.role_id
        INNER JOIN sys_role r ON r.role_id = ur.role_id
        WHERE m.status = '0' AND m.menu_type IN ('M', 'C')
          AND r.status = '0' AND r.del_flag = '0' AND ur.user_id = ?
        ORDER BY m.menu_id
      `), [userId])

  return rows.map((row) => Number(row.menu_id)).filter(Number.isInteger)
}

export async function getUserRoleKeys(user: AuthUser): Promise<string[]> {
  if (user.userId === 1) return ['admin']
  return user.roles.map((role) => role.roleKey).filter(Boolean)
}

export async function getConfigValue(key: string): Promise<string | null> {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1
  `), [key])
  return rows[0]?.config_value == null ? null : String(rows[0].config_value)
}

export async function recordUserLogin(userId: number, ip: string): Promise<void> {
  const safeIp = String(ip || '').slice(0, 128)
  await getMysqlPool().execute(mysqlQueryOptions(
    'UPDATE sys_user SET login_ip = ?, login_date = NOW() WHERE user_id = ?',
  ),
    [safeIp, userId],
  )
}

export async function recordLoginInfo(username: string, status: '0' | '1', message: string, ip: string, userAgent: string): Promise<void> {
  const safeUser = String(username || '').slice(0, 50)
  const safeIp = String(ip || '').slice(0, 128)
  const safeMsg = String(message || '').slice(0, 255)
  const browser = String(userAgent || '').slice(0, 50)
  await getMysqlPool().execute(mysqlQueryOptions(`
    INSERT INTO sys_logininfor (user_name, ipaddr, login_location, browser, os, status, msg, login_time)
    VALUES (?, ?, '', ?, '', ?, ?, NOW())
  `), [safeUser, safeIp, browser, status, safeMsg])
}
