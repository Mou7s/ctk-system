import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { apiError } from './response'
import {
  camelizeRows,
  dataResult,
  dataScopeFragment,
  fieldsResult,
  pageRequest,
  queryPage,
  queryText,
  safeOrderBy,
  tableResult,
  withOptionalReadSession,
  withReadSession,
} from './read'

export type SystemReadKind =
  | 'config-list' | 'config-detail'
  | 'dept-list' | 'dept-exclude' | 'dept-detail'
  | 'dict-data-list' | 'dict-data-detail' | 'dict-data-type'
  | 'dict-type-list' | 'dict-type-detail' | 'dict-type-options'
  | 'menu-list' | 'menu-detail' | 'menu-tree' | 'menu-role-tree'
  | 'notice-list' | 'notice-detail'
  | 'post-list' | 'post-detail' | 'post-options'
  | 'role-list' | 'role-detail' | 'role-options' | 'role-allocated' | 'role-unallocated' | 'role-dept-tree'
  | 'user-list' | 'user-detail' | 'user-auth-role' | 'user-dept-tree'

type Query = Record<string, unknown>

const configColumns = {
  configId: 'config_id', configName: 'config_name', configKey: 'config_key', configType: 'config_type',
  createTime: 'create_time', updateTime: 'update_time',
}

function q(event: H3Event): Query {
  return getQuery(event) as Query
}

function like(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} LIKE CONCAT('%', ?, '%')`)
    params.push(text)
  }
}

function equal(conditions: string[], params: unknown[], column: string, value: unknown) {
  const text = queryText(value)
  if (text) {
    conditions.push(`${column} = ?`)
    params.push(text)
  }
}

function dateBound(conditions: string[], params: unknown[], column: string, begin: unknown, end: unknown) {
  const beginText = queryText(begin)
  const endText = queryText(end)
  if (beginText) {
    conditions.push(`DATE_FORMAT(${column}, '%y%m%d') >= DATE_FORMAT(?, '%y%m%d')`)
    params.push(beginText)
  }
  if (endText) {
    conditions.push(`DATE_FORMAT(${column}, '%y%m%d') <= DATE_FORMAT(?, '%y%m%d')`)
    params.push(endText)
  }
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
}

function pathNumber(event: H3Event, name: string): number | null {
  const raw = queryText(getRouterParam(event, name))
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

function invalidParameter() {
  return apiError('参数不符合规范，不能进行查询', 500)
}

async function configList(event: H3Event) {
  return withReadSession(event, 'SystemConfigList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'config_name', query.configName)
    equal(conditions, params, 'config_type', query.configType)
    like(conditions, params, 'config_key', query.configKey)
    dateBound(conditions, params, 'create_time', query.beginTime, query.endTime)
    const order = safeOrderBy(query.orderByColumn, query.isAsc, configColumns)
    if (order === null) return invalidParameter()
    const sqlWhere = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_config${sqlWhere}`,
      `SELECT config_id, config_name, config_key, config_value, config_type, create_by, create_time, update_by, update_time, remark
       FROM sys_config${sqlWhere} ${order} LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取参数配置列表失败')
}

async function configDetail(event: H3Event) {
  return withReadSession(event, 'SystemConfigDetail', async (_, pool) => {
    const id = pathNumber(event, 'configId')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>(
      { sql: 'SELECT config_id, config_name, config_key, config_value, config_type, create_by, create_time, update_by, update_time, remark FROM sys_config WHERE config_id = ?', timeout: 10000 },
      [id],
    )
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取参数配置详情失败')
}

export async function getConfigByKey(event: H3Event) {
  return withReadSession(event, 'SystemConfigByKey', async (_, pool) => {
    const key = queryText(getRouterParam(event, 'configKey'))
    if (!key) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      'SELECT config_id, config_name, config_key, config_value, config_type, create_by, create_time, update_by, update_time, remark FROM sys_config WHERE config_key = ? LIMIT 1',
    ), [key])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取参数配置失败')
}

async function deptRows(pool: Pool, session: AuthSession, query: Query) {
  const conditions = ['d.del_flag = \'0\'']
  const params: unknown[] = []
  const deptId = queryText(query.deptId)
  const parentId = queryText(query.parentId)
  if (deptId && Number(deptId)) { conditions.push('d.dept_id = ?'); params.push(Number(deptId)) }
  if (parentId && Number(parentId)) { conditions.push('d.parent_id = ?'); params.push(Number(parentId)) }
  like(conditions, params, 'd.dept_name', query.deptName)
  equal(conditions, params, 'd.status', query.status)
  const scope = await dataScopeFragment(pool, session, 'system:dept:list', 'd')
  return {
    params: [...params, ...scope.params],
    sql: `SELECT d.dept_id, d.parent_id, d.ancestors, d.dept_name, d.order_num, d.leader, d.phone, d.email, d.status, d.del_flag, d.create_by, d.create_time
          FROM sys_dept d${where(conditions)}${scope.sql} ORDER BY d.parent_id, d.order_num`,
  }
}

async function deptList(event: H3Event) {
  return withReadSession(event, 'SystemDeptList', async (session, pool) => {
    const result = await deptRows(pool, session, q(event))
    const [rows] = await pool.query<RowDataPacket[]>({ sql: result.sql, timeout: 10000 }, result.params)
    return dataResult(camelizeRows(rows))
  }, '获取部门列表失败')
}

async function deptExclude(event: H3Event) {
  return withReadSession(event, 'SystemDeptExclude', async (session, pool) => {
    const result = await deptRows(pool, session, {})
    const [rows] = await pool.query<RowDataPacket[]>({ sql: result.sql, timeout: 10000 }, result.params)
    const excluded = queryText(getRouterParam(event, 'deptId'))
    const filtered = rows.filter((row) => {
      if (!excluded) return true
      const ancestors = String(row.ancestors ?? '').split(',')
      return String(row.dept_id) !== excluded && !ancestors.includes(excluded)
    })
    return dataResult(camelizeRows(filtered))
  }, '获取部门列表失败')
}

async function deptDetail(event: H3Event) {
  return withReadSession(event, 'SystemDeptDetail', async (session, pool) => {
    const id = pathNumber(event, 'deptId')
    if (!id) return invalidParameter()
    const scope = await dataScopeFragment(pool, session, 'system:dept:list', 'd')
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT d.dept_id, d.parent_id, d.ancestors, d.dept_name, d.order_num, d.leader, d.phone, d.email, d.status,
                   (SELECT dept_name FROM sys_dept WHERE dept_id = d.parent_id) AS parent_name
            FROM sys_dept d WHERE d.dept_id = ?${scope.sql}`,
      timeout: 10000,
    }, [id, ...scope.params])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取部门详情失败')
}

async function dictDataList(event: H3Event) {
  return withReadSession(event, 'SystemDictDataList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    equal(conditions, params, 'dict_type', query.dictType)
    like(conditions, params, 'dict_label', query.dictLabel)
    equal(conditions, params, 'status', query.status)
    const sqlWhere = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_dict_data${sqlWhere}`,
      `SELECT dict_code, dict_sort, dict_label, dict_value, dict_type, css_class, list_class, is_default, status, create_by, create_time, update_by, update_time, remark
       FROM sys_dict_data${sqlWhere} ORDER BY dict_sort ASC LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取字典数据列表失败')
}

async function dictDataDetail(event: H3Event) {
  return withReadSession(event, 'SystemDictDataDetail', async (_, pool) => {
    const id = pathNumber(event, 'dictCode')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT dict_code, dict_sort, dict_label, dict_value, dict_type, css_class, list_class, is_default, status, create_by, create_time, update_by, update_time, remark FROM sys_dict_data WHERE dict_code = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取字典数据详情失败')
}

async function dictDataType(event: H3Event) {
  return withOptionalReadSession(event, 'SystemDictDataType', async (_, pool) => {
    const dictType = queryText(getRouterParam(event, 'dictType'))
    if (!dictType) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT dict_code, dict_sort, dict_label, dict_value, dict_type, css_class, list_class, is_default, status, create_by, create_time, update_by, update_time, remark
            FROM sys_dict_data WHERE status = '0' AND dict_type = ? ORDER BY dict_sort ASC`,
      timeout: 10000,
    }, [dictType])
    return dataResult(camelizeRows(rows))
  }, '获取字典数据失败')
}

async function dictTypeList(event: H3Event) {
  return withReadSession(event, 'SystemDictTypeList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'dict_name', query.dictName)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'dict_type', query.dictType)
    dateBound(conditions, params, 'create_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_dict_type${sqlWhere}`,
      `SELECT dict_id, dict_name, dict_type, status, create_by, create_time, update_by, update_time, remark
       FROM sys_dict_type${sqlWhere} LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取字典类型列表失败')
}

async function dictTypeDetail(event: H3Event) {
  return withReadSession(event, 'SystemDictTypeDetail', async (_, pool) => {
    const id = pathNumber(event, 'dictId')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT dict_id, dict_name, dict_type, status, create_by, create_time, update_by, update_time, remark FROM sys_dict_type WHERE dict_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取字典类型详情失败')
}

async function dictTypeOptions(event: H3Event) {
  return withOptionalReadSession(event, 'SystemDictTypeOptions', async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT dict_id, dict_name, dict_type, status, create_by, create_time, update_by, update_time, remark FROM sys_dict_type',
      timeout: 10000,
    })
    return dataResult(camelizeRows(rows))
  }, '获取字典类型选项失败')
}

async function menuList(event: H3Event) {
  return withReadSession(event, 'SystemMenuList', async (session, pool) => {
    const query = q(event)
    const conditions = ["m.menu_type IN ('M', 'C')"]
    const params: unknown[] = []
    like(conditions, params, 'm.menu_name', query.menuName)
    equal(conditions, params, 'm.visible', query.visible)
    equal(conditions, params, 'm.status', query.status)
    const userJoin = session.userId === 1
      ? ''
      : ' LEFT JOIN sys_role_menu rm ON rm.menu_id = m.menu_id LEFT JOIN sys_user_role ur ON ur.role_id = rm.role_id LEFT JOIN sys_role ro ON ro.role_id = ur.role_id'
    const userFilter = session.userId === 1 ? '' : ' AND ur.user_id = ?'
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT DISTINCT m.menu_id, m.menu_name, m.parent_id, m.order_num, m.path, m.component, m.query, m.route_name, m.is_frame, m.is_cache, m.menu_type, m.visible, m.status, IFNULL(m.perms, '') AS perms, m.icon, m.create_time
            FROM sys_menu m${userJoin} WHERE ${conditions.join(' AND ')}${userFilter} ORDER BY m.parent_id, m.order_num`,
      timeout: 10000,
    }, session.userId === 1 ? params : [...params, session.userId])
    return dataResult(camelizeRows(rows))
  }, '获取菜单列表失败')
}

async function menuDetail(event: H3Event) {
  return withReadSession(event, 'SystemMenuDetail', async (_, pool) => {
    const id = pathNumber(event, 'menuId')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT m.menu_id, m.menu_name, m.parent_id, m.order_num, m.path, m.component, m.query, m.route_name, m.is_frame, m.is_cache, m.menu_type, m.visible, m.status, IFNULL(m.perms, '') AS perms, m.icon, m.create_time
            FROM sys_menu m WHERE m.menu_id = ?`,
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取菜单详情失败')
}

async function menuTree(event: H3Event) {
  return withReadSession(event, 'SystemMenuTree', async (session, pool) => {
    const admin = session.userId === 1
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: admin
        ? `SELECT DISTINCT m.menu_id, m.parent_id, m.menu_name, m.path, m.component, m.query, m.route_name, m.visible, m.status, IFNULL(m.perms, '') AS perms, m.is_frame, m.is_cache, m.menu_type, m.icon, m.order_num, m.create_time
             FROM sys_menu m
             WHERE m.menu_type IN ('M', 'C') AND m.status = '0'
             ORDER BY m.parent_id, m.order_num`
        : `SELECT DISTINCT m.menu_id, m.parent_id, m.menu_name, m.path, m.component, m.query, m.route_name, m.visible, m.status, IFNULL(m.perms, '') AS perms, m.is_frame, m.is_cache, m.menu_type, m.icon, m.order_num, m.create_time
             FROM sys_menu m
             LEFT JOIN sys_role_menu rm ON m.menu_id = rm.menu_id
             LEFT JOIN sys_user_role ur ON rm.role_id = ur.role_id
             LEFT JOIN sys_role ro ON ur.role_id = ro.role_id
             LEFT JOIN sys_user u ON ur.user_id = u.user_id
             WHERE u.user_id = ? AND m.menu_type IN ('M', 'C') AND m.status = '0' AND ro.status = '0'
             ORDER BY m.parent_id, m.order_num`,
      timeout: 10000,
    }, admin ? [] : [session.userId])
    return dataResult(treeSelectRows(camelizeRows(rows), 'menuId', 'parentId', 'menuName', 'menuType'))
  }, '获取菜单树失败')
}

async function menuRoleTree(event: H3Event) {
  return withReadSession(event, 'SystemMenuRoleTree', async (_, pool) => {
    const roleId = pathNumber(event, 'roleId')
    if (!roleId) return invalidParameter()
    const [menus, checked] = await Promise.all([
      pool.query<RowDataPacket[]>({
        sql: `SELECT m.menu_id, m.parent_id, m.menu_name, m.path, m.component, m.query, m.route_name, m.visible, m.status, IFNULL(m.perms, '') AS perms, m.is_frame, m.is_cache, m.menu_type, m.icon, m.order_num, m.create_time
              FROM sys_menu m WHERE m.menu_type IN ('M', 'C', 'F') ORDER BY m.parent_id, m.order_num`,
        timeout: 10000,
      }),
      pool.query<RowDataPacket[]>({
        sql: `SELECT m.menu_id FROM sys_menu m INNER JOIN sys_role_menu rm ON m.menu_id = rm.menu_id WHERE rm.role_id = ? AND m.menu_type IN ('M', 'C', 'F') ORDER BY m.parent_id, m.order_num`,
        timeout: 10000,
      }, [roleId]),
    ])
    return fieldsResult({ menus: treeSelectRows(camelizeRows(menus[0]), 'menuId', 'parentId', 'menuName', 'menuType'), checkedKeys: checked[0].map((row) => row.menu_id) })
  }, '获取角色菜单树失败')
}

async function noticeList(event: H3Event) {
  return withReadSession(event, 'SystemNoticeList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'notice_title', query.noticeTitle)
    equal(conditions, params, 'notice_type', query.noticeType)
    like(conditions, params, 'create_by', query.createBy)
    equal(conditions, params, 'status', query.status)
    const sqlWhere = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_notice${sqlWhere}`,
      `SELECT notice_id, notice_title, notice_type, CAST(notice_content AS CHAR) AS notice_content, status, create_by, create_time, update_by, update_time, remark
       FROM sys_notice${sqlWhere} LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取通知公告列表失败')
}

async function noticeDetail(event: H3Event) {
  return withReadSession(event, 'SystemNoticeDetail', async (_, pool) => {
    const id = pathNumber(event, 'noticeId')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT notice_id, notice_title, notice_type, CAST(notice_content AS CHAR) AS notice_content, status, create_by, create_time, update_by, update_time, remark FROM sys_notice WHERE notice_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取通知公告详情失败')
}

async function postList(event: H3Event) {
  return withReadSession(event, 'SystemPostList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'post_code', query.postCode)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'post_name', query.postName)
    const sqlWhere = where(conditions)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_post${sqlWhere}`,
      `SELECT post_id, post_code, post_name, post_sort, status, create_by, create_time, remark FROM sys_post${sqlWhere} LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取岗位列表失败')
}

async function postDetail(event: H3Event) {
  return withReadSession(event, 'SystemPostDetail', async (_, pool) => {
    const id = pathNumber(event, 'postId')
    if (!id) return invalidParameter()
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT post_id, post_code, post_name, post_sort, status, create_by, create_time, remark FROM sys_post WHERE post_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取岗位详情失败')
}

async function postOptions(event: H3Event) {
  return withReadSession(event, 'SystemPostOptions', async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT post_id, post_code, post_name, post_sort, status, create_by, create_time, remark FROM sys_post',
      timeout: 10000,
    })
    return dataResult(camelizeRows(rows))
  }, '获取岗位选项失败')
}

const roleColumns = {
  roleId: 'r.role_id', roleName: 'r.role_name', roleKey: 'r.role_key', roleSort: 'r.role_sort',
  dataScope: 'r.data_scope', status: 'r.status', createTime: 'r.create_time',
}

const userColumns = {
  userId: 'u.user_id', userName: 'u.user_name', nickName: 'u.nick_name', status: 'u.status',
  phonenumber: 'u.phonenumber', createTime: 'u.create_time', loginDate: 'u.login_date',
}

function treeSelectRows(rows: Record<string, unknown>[], idKey: string, parentKey: string, labelKey: string, menuTypeKey = '') {
  const byParent = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const parent = String(row[parentKey] ?? 0)
    const children = byParent.get(parent) || []
    children.push(row)
    byParent.set(parent, children)
  }
  const visit = (row: Record<string, unknown>): Record<string, unknown> => {
    const id = row[idKey]
    const result: Record<string, unknown> = { id, label: row[labelKey] }
    if (menuTypeKey) result.menuType = row[menuTypeKey]
    const children = byParent.get(String(id)) || []
    if (children.length) result.children = children.map(visit)
    return result
  }
  return (byParent.get('0') || rows.filter((row) => !byParent.has(String(row[idKey])))).map(visit)
}

async function roleList(event: H3Event) {
  return withReadSession(event, 'SystemRoleList', async (session, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions = ["r.del_flag = '0'"]
    const params: unknown[] = []
    const roleId = queryNumber(query.roleId)
    if (roleId) { conditions.push('r.role_id = ?'); params.push(roleId) }
    like(conditions, params, 'r.role_name', query.roleName)
    equal(conditions, params, 'r.status', query.status)
    like(conditions, params, 'r.role_key', query.roleKey)
    dateBound(conditions, params, 'r.create_time', query.beginTime, query.endTime)
    const scope = await dataScopeFragment(pool, session, 'system:role:list', 'd')
    const sqlWhere = ` WHERE ${conditions.join(' AND ')}${scope.sql}`
    const order = safeOrderBy(query.orderByColumn, query.isAsc, roleColumns)
    if (order === null) return invalidParameter()
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM (SELECT DISTINCT r.role_id FROM sys_role r LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id LEFT JOIN sys_user u ON u.user_id = ur.user_id LEFT JOIN sys_dept d ON u.dept_id = d.dept_id${sqlWhere}) scoped_roles`,
      `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.menu_check_strictly, r.dept_check_strictly, r.status, r.del_flag, r.create_time, r.remark
       FROM sys_role r LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id LEFT JOIN sys_user u ON u.user_id = ur.user_id LEFT JOIN sys_dept d ON u.dept_id = d.dept_id${sqlWhere} ${order} LIMIT ?, ?`,
      [...params, ...scope.params],
      [...params, ...scope.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取角色列表失败')
}

async function roleDetail(event: H3Event) {
  return withReadSession(event, 'SystemRoleDetail', async (session, pool) => {
    const id = pathNumber(event, 'roleId')
    if (!id) return invalidParameter()
    const scope = await dataScopeFragment(pool, session, 'system:role:list', 'd')
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.menu_check_strictly, r.dept_check_strictly, r.status, r.del_flag, r.create_time, r.remark
            FROM sys_role r LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id LEFT JOIN sys_user u ON u.user_id = ur.user_id LEFT JOIN sys_dept d ON u.dept_id = d.dept_id
            WHERE r.role_id = ? AND r.del_flag = '0'${scope.sql}`,
      timeout: 10000,
    }, [id, ...scope.params])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取角色详情失败')
}

async function roleOptions(event: H3Event) {
  return withReadSession(event, 'SystemRoleOptions', async (_, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.menu_check_strictly, r.dept_check_strictly, r.status, r.del_flag, r.create_time, r.remark
            FROM sys_role r WHERE r.del_flag = '0' ORDER BY r.role_sort`,
      timeout: 10000,
    })
    return dataResult(camelizeRows(rows))
  }, '获取角色选项失败')
}

async function roleUsers(event: H3Event, allocated: boolean) {
  return withReadSession(event, allocated ? 'SystemRoleAllocatedUsers' : 'SystemRoleUnallocatedUsers', async (session, pool) => {
    const roleId = queryNumber(q(event).roleId)
    if (!roleId) return invalidParameter()
    const query = q(event)
    const page = pageRequest(query)
    const conditions = allocated
      ? ["u.del_flag = '0'", 'r.role_id = ?']
      : ["u.del_flag = '0'", '(r.role_id != ? OR r.role_id IS NULL)', 'u.user_id NOT IN (SELECT ur2.user_id FROM sys_user_role ur2 WHERE ur2.role_id = ?)']
    const params: unknown[] = allocated ? [roleId] : [roleId, roleId]
    like(conditions, params, 'u.user_name', query.userName)
    like(conditions, params, 'u.phonenumber', query.phonenumber)
    const scope = await dataScopeFragment(pool, session, 'system:user:list', 'd', 'u')
    const sqlWhere = ` WHERE ${conditions.join(' AND ')}${scope.sql}`
    const order = safeOrderBy(query.orderByColumn, query.isAsc, userColumns)
    if (order === null) return invalidParameter()
    const base = ` FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id LEFT JOIN sys_user_role ur ON u.user_id = ur.user_id LEFT JOIN sys_role r ON r.role_id = ur.role_id${sqlWhere}`
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM (SELECT DISTINCT u.user_id${base}) scoped_users`,
      `SELECT DISTINCT u.user_id, u.dept_id, u.user_name, u.nick_name, u.email, u.phonenumber, u.status, u.create_time${base} ${order} LIMIT ?, ?`,
      [...params, ...scope.params],
      [...params, ...scope.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, allocated ? '获取已分配用户列表失败' : '获取未分配用户列表失败')
}

async function roleDeptTree(event: H3Event) {
  return withReadSession(event, 'SystemRoleDeptTree', async (session, pool) => {
    const roleId = pathNumber(event, 'roleId')
    if (!roleId) return invalidParameter()
    const [checkedRows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT d.dept_id FROM sys_dept d INNER JOIN sys_role_dept rd ON rd.dept_id = d.dept_id WHERE rd.role_id = ? ORDER BY d.parent_id, d.order_num',
      timeout: 10000,
    }, [roleId])
    const result = await deptRows(pool, session, {})
    const [deptRowsResult] = await pool.query<RowDataPacket[]>({ sql: result.sql, timeout: 10000 }, result.params)
    const depts = treeSelectRows(camelizeRows(deptRowsResult), 'deptId', 'parentId', 'deptName')
    return fieldsResult({ checkedKeys: checkedRows.map((row) => row.dept_id), depts })
  }, '获取角色部门树失败')
}

function userListSql(query: Query, scopeSql: string) {
  const conditions = ["u.del_flag = '0'"]
  const params: unknown[] = []
  const userId = queryNumber(query.userId)
  if (userId) { conditions.push('u.user_id = ?'); params.push(userId) }
  like(conditions, params, 'u.user_name', query.userName)
  equal(conditions, params, 'u.status', query.status)
  like(conditions, params, 'u.phonenumber', query.phonenumber)
  dateBound(conditions, params, 'u.create_time', query.beginTime, query.endTime)
  const deptId = queryNumber(query.deptId)
  if (deptId) {
    conditions.push('(u.dept_id = ? OR u.dept_id IN (SELECT t.dept_id FROM sys_dept t WHERE FIND_IN_SET(?, t.ancestors)))')
    params.push(deptId, deptId)
  }
  return { sql: ` WHERE ${conditions.join(' AND ')}${scopeSql}`, params }
}

async function userList(event: H3Event) {
  return withReadSession(event, 'SystemUserList', async (session, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const scope = await dataScopeFragment(pool, session, 'system:user:list', 'd', 'u')
    const built = userListSql(query, scope.sql)
    const order = safeOrderBy(query.orderByColumn, query.isAsc, userColumns)
    if (order === null) return invalidParameter()
    const base = ` FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id${built.sql}`
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total${base}`,
      `SELECT u.user_id, u.dept_id, u.nick_name, u.user_name, u.email, u.avatar, u.phonenumber, u.sex, u.status, u.del_flag, u.login_ip, u.login_date, u.create_by, u.create_time, u.remark, d.dept_name, d.leader${base} ${order} LIMIT ?, ?`,
      [...built.params, ...scope.params],
      [...built.params, ...scope.params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取用户列表失败')
}

async function userDetail(event: H3Event, userIdOverride?: number) {
  return withReadSession(event, 'SystemUserDetail', async (session, pool) => {
    const id = userIdOverride ?? pathNumber(event, 'userId')
    if (userIdOverride === undefined && getRouterParam(event, 'userId') === undefined) {
      return userInfoPayload(pool, session, null)
    }
    if (!id) return invalidParameter()
    const scope = await dataScopeFragment(pool, session, 'system:user:list', 'd', 'u')
    return userInfoPayload(pool, session, id, scope)
  }, '获取用户详情失败')
}

export async function getProfile(event: H3Event) {
  return withReadSession(event, 'SystemProfile', async (session, pool) => {
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      'SELECT user_id, user_name, nick_name, email, phonenumber, sex, avatar, login_ip, login_date, create_time, remark, dept_id FROM sys_user WHERE user_id = ? AND del_flag = \'0\' LIMIT 1',
    ), [session.userId])
    const user = camelizeRows(rows)[0] as Record<string, unknown> | undefined
    if (!user) return dataResult(null)
    const [[deptRows], [roleRows], [postRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(mysqlQueryOptions('SELECT dept_name FROM sys_dept WHERE dept_id = ? LIMIT 1'), [user.deptId]),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(
        `SELECT r.role_name FROM sys_role r INNER JOIN sys_user_role ur ON ur.role_id = r.role_id
         WHERE ur.user_id = ? AND r.del_flag = '0' ORDER BY r.role_sort`), [session.userId]),
      pool.query<RowDataPacket[]>(mysqlQueryOptions(
        `SELECT p.post_name FROM sys_post p INNER JOIN sys_user_post up ON up.post_id = p.post_id
         WHERE up.user_id = ? ORDER BY p.post_sort`), [session.userId]),
    ])
    const roleGroup = roleRows.map((row) => String(row.role_name || '')).filter(Boolean).join('，')
    const postGroup = postRows.map((row) => String(row.post_name || '')).filter(Boolean).join('，')
    return dataResult({
      ...user,
      dept: deptRows[0] ? { deptName: String(deptRows[0].dept_name || '') } : null,
      roleGroup,
      postGroup,
    })
  }, '获取个人资料失败')
}

async function userInfoPayload(pool: Pool, session: AuthSession, id: number | null, existingScope?: { sql: string; params: unknown[] }) {
  const scope = existingScope || await dataScopeFragment(pool, session, 'system:user:list', 'd', 'u')
  const [roleRows, postRows] = await Promise.all([
    pool.query<RowDataPacket[]>({ sql: `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.status, r.del_flag, r.create_time, r.remark FROM sys_role r WHERE r.del_flag = '0' ORDER BY r.role_sort`, timeout: 10000 }),
    pool.query<RowDataPacket[]>({ sql: 'SELECT post_id, post_code, post_name, post_sort, status, create_by, create_time, remark FROM sys_post ORDER BY post_sort', timeout: 10000 }),
  ])
  const payload: Record<string, unknown> = {
    roles: camelizeRows(roleRows[0]).filter((role) => id !== 1 ? role.roleKey !== 'admin' : true),
    posts: camelizeRows(postRows[0]),
  }
  if (id == null) return fieldsResult(payload)
  const [rows] = await pool.query<RowDataPacket[]>({
    sql: `SELECT u.user_id, u.dept_id, u.user_name, u.nick_name, u.email, u.phonenumber, u.avatar, u.sex, u.status, u.del_flag, u.login_ip, u.login_date, u.create_by, u.create_time, u.remark,
                 d.dept_id AS dept_id, d.parent_id, d.ancestors, d.dept_name, d.order_num, d.leader, d.status AS dept_status,
                 r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.status AS role_status
          FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id LEFT JOIN sys_user_role ur ON u.user_id = ur.user_id LEFT JOIN sys_role r ON r.role_id = ur.role_id
          WHERE u.user_id = ? AND u.del_flag = '0'${scope.sql}`,
    timeout: 10000,
  }, [id, ...scope.params])
  const first = rows[0]
  if (!first) return fieldsResult(payload)
  const user: Record<string, unknown> = {
    userId: first.user_id, deptId: first.dept_id, userName: first.user_name, nickName: first.nick_name,
    email: first.email, phonenumber: first.phonenumber, avatar: first.avatar, sex: first.sex, status: first.status,
    delFlag: first.del_flag, loginIp: first.login_ip, loginDate: first.login_date, createBy: first.create_by,
    createTime: first.create_time, remark: first.remark,
    dept: first.dept_id == null ? null : { deptId: first.dept_id, parentId: first.parent_id, ancestors: first.ancestors, deptName: first.dept_name, orderNum: first.order_num, leader: first.leader, status: first.dept_status },
    roles: camelizeRows(rows.filter((row) => row.role_id != null).map((row) => ({ role_id: row.role_id, role_name: row.role_name, role_key: row.role_key, role_sort: row.role_sort, data_scope: row.data_scope, status: row.role_status }))),
  }
  const [postIds, roleIds] = await Promise.all([
    pool.query<RowDataPacket[]>({ sql: 'SELECT post_id FROM sys_user_post WHERE user_id = ?', timeout: 10000 }, [id]),
    pool.query<RowDataPacket[]>({ sql: 'SELECT role_id FROM sys_user_role WHERE user_id = ?', timeout: 10000 }, [id]),
  ])
  payload.data = user
  payload.postIds = postIds[0].map((row) => row.post_id)
  payload.roleIds = roleIds[0].map((row) => row.role_id)
  return fieldsResult(payload)
}

async function userAuthRole(event: H3Event) {
  return withReadSession(event, 'SystemUserAuthRole', async (session, pool) => {
    const id = pathNumber(event, 'userId')
    if (!id) return invalidParameter()
    const [userRows, roleRows] = await Promise.all([
      pool.query<RowDataPacket[]>({ sql: `SELECT u.user_id, u.dept_id, u.user_name, u.nick_name, u.email, u.phonenumber, u.avatar, u.sex, u.status, u.del_flag, u.login_ip, u.login_date, u.create_by, u.create_time, u.remark FROM sys_user u WHERE u.user_id = ? AND u.del_flag = '0'`, timeout: 10000 }, [id]),
      pool.query<RowDataPacket[]>({ sql: `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.status, r.del_flag, r.create_time, r.remark FROM sys_role r INNER JOIN sys_user_role ur ON ur.role_id = r.role_id WHERE ur.user_id = ? AND r.del_flag = '0'`, timeout: 10000 }, [id]),
    ])
    const roles = camelizeRows(roleRows[0]).filter((role) => id !== 1 ? role.roleKey !== 'admin' : true)
    void session
    return fieldsResult({ user: camelizeRows(userRows[0])[0] ?? null, roles })
  }, '获取用户授权角色失败')
}

async function userDeptTree(event: H3Event) {
  return withReadSession(event, 'SystemUserDeptTree', async (session, pool) => {
    const result = await deptRows(pool, session, q(event))
    const [rows] = await pool.query<RowDataPacket[]>({ sql: result.sql, timeout: 10000 }, result.params)
    return dataResult(treeSelectRows(camelizeRows(rows), 'deptId', 'parentId', 'deptName'))
  }, '获取用户部门树失败')
}

export function createSystemReadHandler(kind: SystemReadKind) {
  return async (event: H3Event) => {
    switch (kind) {
      case 'config-list': return configList(event)
      case 'config-detail': return configDetail(event)
      case 'dept-list': return deptList(event)
      case 'dept-exclude': return deptExclude(event)
      case 'dept-detail': return deptDetail(event)
      case 'dict-data-list': return dictDataList(event)
      case 'dict-data-detail': return dictDataDetail(event)
      case 'dict-data-type': return dictDataType(event)
      case 'dict-type-list': return dictTypeList(event)
      case 'dict-type-detail': return dictTypeDetail(event)
      case 'dict-type-options': return dictTypeOptions(event)
      case 'menu-list': return menuList(event)
      case 'menu-detail': return menuDetail(event)
      case 'menu-tree': return menuTree(event)
      case 'menu-role-tree': return menuRoleTree(event)
      case 'notice-list': return noticeList(event)
      case 'notice-detail': return noticeDetail(event)
      case 'post-list': return postList(event)
      case 'post-detail': return postDetail(event)
      case 'post-options': return postOptions(event)
      case 'role-list': return roleList(event)
      case 'role-detail': return roleDetail(event)
      case 'role-options': return roleOptions(event)
      case 'role-allocated': return roleUsers(event, true)
      case 'role-unallocated': return roleUsers(event, false)
      case 'role-dept-tree': return roleDeptTree(event)
      case 'user-list': return userList(event)
      case 'user-detail': return userDetail(event)
      case 'user-auth-role': return userAuthRole(event)
      case 'user-dept-tree': return userDeptTree(event)
      default: return apiError('接口尚未迁移', 501)
    }
  }
}
