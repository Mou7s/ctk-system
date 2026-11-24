import type { H3Event } from 'h3'
import { getQuery, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import { hashSync } from 'bcryptjs'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { apiError, apiSuccess } from './response'
import {
  affectedRows,
  assertExists,
  bodyOf,
  decimal,
  idList,
  insertOperationLog,
  javaAjax,
  nullableText,
  optionalId,
  positiveId,
  queryOne,
  requiredText,
  sqlPlaceholders,
  text,
  withWriteSession,
  writeFail,
  refreshNitroSessions,
} from './write'
import { mysqlQueryOptions } from './mysql'
import { dataScopeFragment } from './read'

type Kind =
  | 'config-add' | 'config-edit' | 'config-delete' | 'config-refresh'
  | 'dept-add' | 'dept-edit' | 'dept-delete'
  | 'dict-data-add' | 'dict-data-edit' | 'dict-data-delete'
  | 'dict-type-add' | 'dict-type-edit' | 'dict-type-delete' | 'dict-type-refresh'
  | 'menu-add' | 'menu-edit' | 'menu-delete'
  | 'notice-add' | 'notice-edit' | 'notice-delete'
  | 'post-add' | 'post-edit' | 'post-delete'
  | 'role-add' | 'role-edit' | 'role-data-scope' | 'role-status' | 'role-delete'
  | 'role-auth-cancel' | 'role-auth-cancel-all' | 'role-auth-select-all'
  | 'user-add' | 'user-edit' | 'user-delete' | 'user-reset-password' | 'user-status' | 'user-auth-role'

function routeId(event: H3Event, name: string): string {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return text(direct)
  const params = getRouterParams(event) as Record<string, unknown>
  const named = params?.[name]
  if (named != null && text(named)) return text(named)
  // Some reverse-proxy combinations preserve the dynamic path but omit the
  // named router parameter. Keep the route address compatible with Java by
  // falling back to its final path segment.
  const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
  return text(segments.at(-1))
}

function parentIdValue(value: unknown): number {
  if (value == null || text(value) === '') return 0
  const id = Number(text(value))
  if (!Number.isSafeInteger(id) || id < 0) writeFail('上级部门或菜单ID不符合规范')
  return id
}

async function queryAndBody(event: H3Event): Promise<Record<string, any>> {
  const body = await readBody(event)
  const query = getQuery(event) as Record<string, any>
  return { ...(query || {}), ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}) }
}

function optionalIds(value: unknown): number[] {
  if (value == null || (Array.isArray(value) && value.length === 0) || text(value) === '') return []
  return idList(value)
}

function roleRelationIds(body: Record<string, any>, key: 'menuIds' | 'deptIds' | 'roleIds' | 'postIds'): number[] {
  return optionalIds(body[key])
}

function ajaxError(message: string) {
  return apiError(message, 500)
}

async function unique(
  connection: PoolConnection,
  sql: string,
  params: unknown[],
  currentId: number | null,
  duplicateMessage: string,
) {
  const row = await queryOne(connection, sql, params)
  if (row && (currentId == null || Number(Object.values(row)[0]) !== currentId)) writeFail(duplicateMessage)
}

async function assertDeptScope(connection: PoolConnection, session: AuthSession, deptId: number | null) {
  if (deptId == null || session.userId === 1) return
  const scope = await dataScopeFragment(connection as any, session, 'system:dept:list', 'd')
  const row = await queryOne(connection, `SELECT d.dept_id FROM sys_dept d WHERE d.dept_id = ? AND d.del_flag = '0'${scope.sql}`, [deptId, ...scope.params])
  if (!row) writeFail('没有权限访问部门数据！')
}

async function assertUserScope(connection: PoolConnection, session: AuthSession, userId: number) {
  if (session.userId === 1) return
  const scope = await dataScopeFragment(connection as any, session, 'system:user:list', 'd', 'u')
  const row = await queryOne(connection, `
    SELECT u.user_id FROM sys_user u LEFT JOIN sys_dept d ON d.dept_id = u.dept_id
    WHERE u.user_id = ? AND u.del_flag = '0'${scope.sql}
  `, [userId, ...scope.params])
  if (!row) writeFail('没有权限访问用户数据！')
}

async function assertRoleScope(connection: PoolConnection, session: AuthSession, roleId: number) {
  if (session.userId === 1) return
  const scope = await dataScopeFragment(connection as any, session, 'system:role:list', 'd')
  const row = await queryOne(connection, `
    SELECT DISTINCT r.role_id
    FROM sys_role r
    LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id
    LEFT JOIN sys_user u ON u.user_id = ur.user_id
    LEFT JOIN sys_dept d ON d.dept_id = u.dept_id
    WHERE r.role_id = ? AND r.del_flag = '0'${scope.sql}
  `, [roleId, ...scope.params])
  if (!row) writeFail('没有权限访问角色数据！')
}

async function configAdd(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const configName = requiredText(body.configName, '参数名称', 100)
  const configKey = requiredText(body.configKey, '参数键名', 100)
  await unique(connection, 'SELECT config_id FROM sys_config WHERE config_key = ? LIMIT 1', [configKey], null, `新增参数配置'${configName}'失败，参数键名已存在`)
  const fields = ['config_name', 'config_key', 'config_value', 'config_type', 'create_by', 'remark']
  const values = [configName, configKey, text(body.configValue), text(body.configType) || 'Y', session.userName, nullableText(body.remark)]
  const result: any = await connection.query(mysqlQueryOptions(`INSERT INTO sys_config (${fields.join(', ')}, create_time) VALUES (${sqlPlaceholders(values)}, NOW())`), values)
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '参数配置', 1, body)
  return javaAjax(rows)
}

async function configEdit(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const configId = positiveId(body.configId, '参数配置ID')
  await assertExists(connection, 'SELECT config_id FROM sys_config WHERE config_id = ?', [configId], '参数配置不存在')
  const configName = requiredText(body.configName, '参数名称', 100)
  const configKey = requiredText(body.configKey, '参数键名', 100)
  await unique(connection, 'SELECT config_id FROM sys_config WHERE config_key = ? LIMIT 1', [configKey], configId, `修改参数配置'${configName}'失败，参数键名已存在`)
  const result: any = await connection.query(mysqlQueryOptions(`
    UPDATE sys_config SET config_name = ?, config_key = ?, config_value = ?, config_type = ?, update_by = ?, remark = ?, update_time = NOW()
    WHERE config_id = ?
  `), [configName, configKey, text(body.configValue), text(body.configType) || 'Y', session.userName, nullableText(body.remark), configId])
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '参数配置', 2, body)
  return javaAjax(rows)
}

async function configDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(routeId(event, 'configIds'), '参数配置ID')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM sys_config WHERE config_id IN (${sqlPlaceholders(ids)})`), ids)
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '参数配置', 3, { configIds: ids })
  return apiSuccess(undefined, '操作成功')
}

async function deptAdd(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const parentId = parentIdValue(body.parentId)
  const deptName = requiredText(body.deptName, '部门名称', 30)
  await assertDeptScope(connection, session, parentId || null)
  await unique(connection, 'SELECT dept_id FROM sys_dept WHERE dept_name = ? AND parent_id = ? AND del_flag = \'0\' LIMIT 1', [deptName, parentId], null, `新增部门'${deptName}'失败，部门名称已存在`)
  const parent = parentId === 0
    ? { ancestors: '0', status: '0' }
    : await assertExists(connection, 'SELECT dept_id, ancestors, status FROM sys_dept WHERE dept_id = ? AND del_flag = \'0\'', [parentId], '父部门不存在')
  if (String(parent.status) !== '0') writeFail('部门停用，不允许新增')
  const fields = ['parent_id', 'ancestors', 'dept_name', 'order_num', 'leader', 'phone', 'email', 'status', 'create_by', 'del_flag']
  const values = [parentId, parentId === 0 ? '0' : `${parent.ancestors || '0'},${parentId}`, deptName, Number(body.orderNum ?? 0), nullableText(body.leader), nullableText(body.phone), nullableText(body.email), text(body.status) || '0', session.userName, '0']
  const result: any = await connection.query(mysqlQueryOptions(`INSERT INTO sys_dept (${fields.join(', ')}, create_time) VALUES (${sqlPlaceholders(values)}, NOW())`), values)
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '部门管理', 1, body)
  return javaAjax(rows)
}

async function deptEdit(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const deptId = positiveId(body.deptId, '部门ID')
  await assertDeptScope(connection, session, deptId)
  const oldDept = await assertExists(connection, 'SELECT dept_id, parent_id, ancestors, status FROM sys_dept WHERE dept_id = ? AND del_flag = \'0\'', [deptId], '部门不存在')
  const parentId = parentIdValue(body.parentId)
  if (parentId === deptId) writeFail('修改部门失败，上级部门不能是自己')
  await assertDeptScope(connection, session, parentId || null)
  await unique(connection, 'SELECT dept_id FROM sys_dept WHERE dept_name = ? AND parent_id = ? AND del_flag = \'0\' LIMIT 1', [requiredText(body.deptName, '部门名称', 30), parentId], deptId, '修改部门失败，部门名称已存在')
  const parent = parentId === 0
    ? { ancestors: '0', status: '0' }
    : await assertExists(connection, 'SELECT dept_id, ancestors, status FROM sys_dept WHERE dept_id = ? AND del_flag = \'0\'', [parentId], '父部门不存在')
  if (text(body.status) === '1' && await queryOne(connection, 'SELECT dept_id FROM sys_dept WHERE parent_id = ? AND del_flag = \'0\' AND status = \'0\' LIMIT 1', [deptId])) {
    writeFail('该部门包含未停用的子部门！')
  }
  const newAncestors = parentId === 0 ? '0' : `${parent.ancestors || '0'},${parentId}`
  const oldAncestors = String(oldDept.ancestors || '')
  const result: any = await connection.query(mysqlQueryOptions(`
    UPDATE sys_dept SET parent_id = ?, ancestors = ?, dept_name = ?, order_num = ?, leader = ?, phone = ?, email = ?, status = ?, update_by = ?, update_time = NOW()
    WHERE dept_id = ? AND del_flag = '0'
  `), [parentId, newAncestors, text(body.deptName), Number(body.orderNum ?? 0), nullableText(body.leader), nullableText(body.phone), nullableText(body.email), text(body.status) || '0', session.userName, deptId])
  if (oldAncestors !== newAncestors) {
    await connection.query(mysqlQueryOptions(`UPDATE sys_dept SET ancestors = REPLACE(ancestors, ?, ?) WHERE FIND_IN_SET(?, ancestors)`), [oldAncestors, newAncestors, deptId])
  }
  if (text(body.status) === '0' && newAncestors !== '0') {
    const ancestors = newAncestors.split(',').filter(Boolean).map(Number)
    if (ancestors.length) await connection.query(mysqlQueryOptions(`UPDATE sys_dept SET status = '0' WHERE dept_id IN (${sqlPlaceholders(ancestors)})`), ancestors)
  }
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '部门管理', 2, body)
  return javaAjax(rows)
}

async function deptDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const deptId = positiveId(routeId(event, 'deptId'), '部门ID')
  await assertDeptScope(connection, session, deptId)
  const dept = await assertExists(connection, 'SELECT dept_id FROM sys_dept WHERE dept_id = ? AND del_flag = \'0\'', [deptId], '部门不存在')
  const child = await queryOne(connection, 'SELECT dept_id FROM sys_dept WHERE parent_id = ? AND del_flag = \'0\' LIMIT 1', [deptId])
  if (child) writeFail('存在下级部门,不允许删除')
  const user = await queryOne(connection, 'SELECT user_id FROM sys_user WHERE dept_id = ? AND del_flag = \'0\' LIMIT 1', [dept.dept_id])
  if (user) writeFail('部门存在用户,不允许删除')
  const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_dept SET del_flag = \'2\' WHERE dept_id = ? AND del_flag = \'0\''), [deptId])
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '部门管理', 3, { deptId })
  return javaAjax(rows)
}

async function dictDataWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const dictType = requiredText(body.dictType, '字典类型', 100)
  const dictLabel = requiredText(body.dictLabel, '字典标签', 100)
  const dictValue = requiredText(body.dictValue, '字典键值', 100)
  await assertExists(connection, 'SELECT dict_id FROM sys_dict_type WHERE dict_type = ? LIMIT 1', [dictType], '字典类型不存在')
  const dictCode = editing ? positiveId(body.dictCode, '字典编码') : null
  if (editing) await assertExists(connection, 'SELECT dict_code FROM sys_dict_data WHERE dict_code = ?', [dictCode], '字典数据不存在')
  const fields = ['dict_sort', 'dict_label', 'dict_value', 'dict_type', 'css_class', 'list_class', 'is_default', 'status', 'remark']
  const values = [Number(body.dictSort ?? 0), dictLabel, dictValue, dictType, nullableText(body.cssClass), nullableText(body.listClass), text(body.isDefault) || 'N', text(body.status) || '0', nullableText(body.remark)]
  let result: any
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`UPDATE sys_dict_data SET ${fields.map((field) => `${field} = ?`).join(', ')}, update_by = ?, update_time = NOW() WHERE dict_code = ?`), [...values, session.userName, dictCode])
  } else {
    result = await connection.query(mysqlQueryOptions(`INSERT INTO sys_dict_data (${fields.join(', ')}, create_by, create_time) VALUES (${sqlPlaceholders(values)}, ?, NOW())`), [...values, session.userName])
  }
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '字典数据', editing ? 2 : 1, body)
  return javaAjax(rows)
}

async function dictDataDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(routeId(event, 'dictCodes'), '字典编码')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM sys_dict_data WHERE dict_code IN (${sqlPlaceholders(ids)})`), ids)
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '字典数据', 3, { dictCodes: ids })
  return apiSuccess(undefined, '操作成功')
}

async function dictTypeWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const dictName = requiredText(body.dictName, '字典名称', 100)
  const dictType = requiredText(body.dictType, '字典类型', 100)
  const dictId = editing ? positiveId(body.dictId, '字典类型ID') : null
  if (editing) await assertExists(connection, 'SELECT dict_id FROM sys_dict_type WHERE dict_id = ?', [dictId], '字典类型不存在')
  await unique(connection, 'SELECT dict_id FROM sys_dict_type WHERE dict_type = ? LIMIT 1', [dictType], dictId, `修改字典类型'${dictName}'失败，字典类型已存在`)
  const values = [dictName, dictType, text(body.status) || '0', nullableText(body.remark)]
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions('UPDATE sys_dict_type SET dict_name = ?, dict_type = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE dict_id = ?'), [...values, session.userName, dictId])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO sys_dict_type (dict_name, dict_type, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, NOW())'), [...values, session.userName])
  const rows = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '字典类型', editing ? 2 : 1, body)
  return javaAjax(rows)
}

async function dictTypeDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(routeId(event, 'dictIds'), '字典类型ID')
  const types: RowDataPacket[] = []
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT dict_id, dict_type FROM sys_dict_type WHERE dict_id IN (${sqlPlaceholders(ids)})`), ids)
  types.push(...rows)
  for (const type of types) {
    const data = await queryOne(connection, 'SELECT dict_code FROM sys_dict_data WHERE dict_type = ? LIMIT 1', [type.dict_type])
    if (data) writeFail(`字典类型'${type.dict_type}'已分配,不能删除`)
  }
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM sys_dict_type WHERE dict_id IN (${sqlPlaceholders(ids)})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '字典类型', 3, { dictIds: ids })
  return apiSuccess(undefined, '操作成功')
}

function menuValues(body: Record<string, any>) {
  const parentId = parentIdValue(body.parentId)
  const menuName = requiredText(body.menuName, '菜单名称', 50)
  const menuType = text(body.menuType) || 'M'
  const isFrame = text(body.isFrame) || '1'
  const path = nullableText(body.path) || ''
  if (isFrame === '0' && path && !/^https?:\/\//i.test(path)) writeFail('外链地址必须以http(s)://开头')
  return { parentId, menuName, values: [parentId, Number(body.orderNum ?? 0), menuName, path, nullableText(body.component), nullableText(body.query), nullableText(body.routeName), isFrame, text(body.isCache) || '0', menuType, text(body.visible) || '0', text(body.status) || '0', nullableText(body.perms), text(body.icon) || '#', nullableText(body.remark)] }
}

async function menuWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const menuId = editing ? positiveId(body.menuId, '菜单ID') : null
  const { parentId, menuName, values } = menuValues(body)
  if (editing) {
    await assertExists(connection, 'SELECT menu_id FROM sys_menu WHERE menu_id = ?', [menuId], '菜单不存在')
    if (parentId === menuId) writeFail('修改菜单失败，上级菜单不能选择自己')
  }
  await unique(connection, 'SELECT menu_id FROM sys_menu WHERE menu_name = ? AND parent_id = ? LIMIT 1', [menuName, parentId], menuId, `菜单名称'${menuName}'已存在`)
  let result: any
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`UPDATE sys_menu SET parent_id = ?, order_num = ?, menu_name = ?, path = ?, component = ?, query = ?, route_name = ?, is_frame = ?, is_cache = ?, menu_type = ?, visible = ?, status = ?, perms = ?, icon = ?, remark = ?, update_by = ?, update_time = NOW() WHERE menu_id = ?`), [...values, session.userName, menuId])
  } else {
    result = await connection.query(mysqlQueryOptions(`INSERT INTO sys_menu (parent_id, order_num, menu_name, path, component, query, route_name, is_frame, is_cache, menu_type, visible, status, perms, icon, remark, create_by, create_time) VALUES (${sqlPlaceholders(values)}, ?, NOW())`), [...values, session.userName])
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '菜单管理', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function menuDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const menuId = positiveId(routeId(event, 'menuId'), '菜单ID')
  await assertExists(connection, 'SELECT menu_id FROM sys_menu WHERE menu_id = ?', [menuId], '菜单不存在')
  if (await queryOne(connection, 'SELECT menu_id FROM sys_menu WHERE parent_id = ? LIMIT 1', [menuId])) writeFail('存在子菜单,不允许删除')
  if (await queryOne(connection, 'SELECT role_id FROM sys_role_menu WHERE menu_id = ? LIMIT 1', [menuId])) writeFail('菜单已分配,不允许删除')
  const result: any = await connection.query(mysqlQueryOptions('DELETE FROM sys_menu WHERE menu_id = ?'), [menuId])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '菜单管理', 3, { menuId })
  return javaAjax(count)
}

async function noticeWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const noticeId = editing ? positiveId(body.noticeId, '公告ID') : null
  const title = requiredText(body.noticeTitle, '公告标题', 50)
  if (editing) await assertExists(connection, 'SELECT notice_id FROM sys_notice WHERE notice_id = ?', [noticeId], '公告不存在')
  const values = [title, text(body.noticeType) || '1', text(body.noticeContent), text(body.status) || '0', nullableText(body.remark)]
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions('UPDATE sys_notice SET notice_title = ?, notice_type = ?, notice_content = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE notice_id = ?'), [...values, session.userName, noticeId])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO sys_notice (notice_title, notice_type, notice_content, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, NOW())'), [...values, session.userName])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '通知公告', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function postWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const postId = editing ? positiveId(body.postId, '岗位ID') : null
  const postCode = requiredText(body.postCode, '岗位编码', 64)
  const postName = requiredText(body.postName, '岗位名称', 50)
  if (editing) await assertExists(connection, 'SELECT post_id FROM sys_post WHERE post_id = ?', [postId], '岗位不存在')
  await unique(connection, 'SELECT post_id FROM sys_post WHERE post_name = ? LIMIT 1', [postName], postId, `修改岗位'${postName}'失败，岗位名称已存在`)
  await unique(connection, 'SELECT post_id FROM sys_post WHERE post_code = ? LIMIT 1', [postCode], postId, `修改岗位'${postName}'失败，岗位编码已存在`)
  const values = [postCode, postName, Number(body.postSort ?? 0), text(body.status) || '0', nullableText(body.remark)]
  let result: any
  if (editing) result = await connection.query(mysqlQueryOptions('UPDATE sys_post SET post_code = ?, post_name = ?, post_sort = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE post_id = ?'), [...values, session.userName, postId])
  else result = await connection.query(mysqlQueryOptions('INSERT INTO sys_post (post_code, post_name, post_sort, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, NOW())'), [...values, session.userName])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '岗位管理', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function postDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const ids = idList(routeId(event, 'postIds'), '岗位ID')
  const inSql = sqlPlaceholders(ids)
  const assigned = await queryOne(connection, `SELECT post_id FROM sys_user_post WHERE post_id IN (${inSql}) LIMIT 1`, ids)
  if (assigned) writeFail('岗位已分配,不能删除')
  const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM sys_post WHERE post_id IN (${inSql})`), ids)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '岗位管理', 3, { postIds: ids })
  return javaAjax(count)
}

function numberFlag(value: unknown, fallback: number | null = null): number | null {
  if (value == null || text(value) === '') return fallback
  if (value === true || text(value).toLowerCase() === 'true') return 1
  if (value === false || text(value).toLowerCase() === 'false') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || (parsed !== 0 && parsed !== 1)) writeFail('布尔参数不符合规范')
  return parsed
}

async function assertRoleIds(connection: PoolConnection, session: AuthSession, roleIds: number[]) {
  if (!roleIds.length) return
  if (session.userId !== 1) {
    for (const roleId of roleIds) await assertRoleScope(connection, session, roleId)
  }
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT role_id FROM sys_role WHERE role_id IN (${sqlPlaceholders(roleIds)}) AND del_flag = '0'`), roleIds)
  if (rows.length !== roleIds.length) writeFail('角色数据不存在')
}

async function assertPostIds(connection: PoolConnection, postIds: number[]) {
  if (!postIds.length) return
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT post_id FROM sys_post WHERE post_id IN (${sqlPlaceholders(postIds)})`), postIds)
  if (rows.length !== postIds.length) writeFail('岗位数据不存在')
}

async function assertMenuIds(connection: PoolConnection, menuIds: number[]) {
  if (!menuIds.length) return
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT menu_id FROM sys_menu WHERE menu_id IN (${sqlPlaceholders(menuIds)})`), menuIds)
  if (rows.length !== menuIds.length) writeFail('菜单数据不存在')
}

async function assertDeptIds(connection: PoolConnection, deptIds: number[]) {
  if (!deptIds.length) return
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT dept_id FROM sys_dept WHERE dept_id IN (${sqlPlaceholders(deptIds)}) AND del_flag = '0'`), deptIds)
  if (rows.length !== deptIds.length) writeFail('部门数据不存在')
}

async function insertRoleMenus(connection: PoolConnection, roleId: number, menuIds: number[]) {
  if (!menuIds.length) return
  const [menus] = await connection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT menu_id, parent_id FROM sys_menu'), [])
  const parentById = new Map<number, number>()
  for (const menu of menus) parentById.set(Number(menu.menu_id), Number(menu.parent_id || 0))
  const allIds = new Set(menuIds)
  for (const menuId of menuIds) {
    let parentId = parentById.get(menuId) || 0
    const seen = new Set<number>()
    while (parentId && seen.add(parentId)) {
      allIds.add(parentId)
      parentId = parentById.get(parentId) || 0
    }
  }
  const values: unknown[] = []
  for (const menuId of allIds) values.push(roleId, menuId)
  await connection.query(mysqlQueryOptions(`INSERT INTO sys_role_menu (role_id, menu_id) VALUES ${Array.from(allIds).map(() => '(?, ?)').join(', ')}`), values)
}

async function insertRoleDepts(connection: PoolConnection, roleId: number, deptIds: number[]) {
  if (!deptIds.length) return
  const values: unknown[] = []
  for (const deptId of deptIds) values.push(roleId, deptId)
  await connection.query(mysqlQueryOptions(`INSERT INTO sys_role_dept (role_id, dept_id) VALUES ${deptIds.map(() => '(?, ?)').join(', ')}`), values)
}

async function roleWrite(event: H3Event, session: AuthSession, connection: PoolConnection, editing: boolean) {
  const body = await bodyOf(event)
  const roleId = editing ? positiveId(body.roleId, '角色ID') : null
  if (editing) {
    if (roleId === 1) writeFail('不允许操作超级管理员角色')
    await assertRoleScope(connection, session, roleId)
    await assertExists(connection, 'SELECT role_id FROM sys_role WHERE role_id = ? AND del_flag = \'0\'', [roleId], '角色不存在')
  }
  const roleName = requiredText(body.roleName, '角色名称', 30)
  const roleKey = requiredText(body.roleKey, '角色权限', 100)
  await unique(connection, 'SELECT role_id FROM sys_role WHERE role_name = ? AND del_flag = \'0\' LIMIT 1', [roleName], roleId, `新增角色'${roleName}'失败，角色名称已存在`)
  await unique(connection, 'SELECT role_id FROM sys_role WHERE role_key = ? AND del_flag = \'0\' LIMIT 1', [roleKey], roleId, `新增角色'${roleName}'失败，角色权限已存在`)
  const menuIds = roleRelationIds(body, 'menuIds')
  const deptIds = roleRelationIds(body, 'deptIds')
  await assertMenuIds(connection, menuIds)
  await assertDeptIds(connection, deptIds)
  const values = [roleName, roleKey, Number(body.roleSort ?? 0), text(body.dataScope) || '1', numberFlag(body.menuCheckStrictly, 1), numberFlag(body.deptCheckStrictly, 1), text(body.status) || '0', nullableText(body.remark)]
  let result: any
  let actualRoleId = roleId
  if (editing) {
    result = await connection.query(mysqlQueryOptions(`UPDATE sys_role SET role_name = ?, role_key = ?, role_sort = ?, data_scope = ?, menu_check_strictly = ?, dept_check_strictly = ?, status = ?, remark = ?, update_by = ?, update_time = NOW() WHERE role_id = ?`), [...values, session.userName, roleId])
    await connection.query(mysqlQueryOptions('DELETE FROM sys_role_menu WHERE role_id = ?'), [roleId])
    await connection.query(mysqlQueryOptions('DELETE FROM sys_role_dept WHERE role_id = ?'), [roleId])
  } else {
    result = await connection.query(mysqlQueryOptions(`INSERT INTO sys_role (role_name, role_key, role_sort, data_scope, menu_check_strictly, dept_check_strictly, status, remark, create_by, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`), [...values, session.userName])
    actualRoleId = Number(result[0]?.insertId)
  }
  if (!actualRoleId) writeFail('角色ID生成失败')
  await insertRoleMenus(connection, actualRoleId, menuIds)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '角色管理', editing ? 2 : 1, body)
  return javaAjax(count)
}

async function roleDataScope(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const roleId = positiveId(body.roleId, '角色ID')
  if (roleId === 1) writeFail('不允许操作超级管理员角色')
  await assertRoleScope(connection, session, roleId)
  const deptIds = roleRelationIds(body, 'deptIds')
  const dataScope = text(body.dataScope) || '1'
  if (!['1', '2', '3', '4', '5'].includes(dataScope)) writeFail('数据范围不符合规范')
  if (dataScope === '2' && !deptIds.length) writeFail('自定义数据范围至少选择一个部门')
  await assertDeptIds(connection, deptIds)
  if (deptIds.length) for (const deptId of deptIds) await assertDeptScope(connection, session, deptId)
  const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_role SET data_scope = ?, update_by = ?, update_time = NOW() WHERE role_id = ?'), [dataScope, session.userName, roleId])
  await connection.query(mysqlQueryOptions('DELETE FROM sys_role_dept WHERE role_id = ?'), [roleId])
  await insertRoleDepts(connection, roleId, deptIds)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '角色管理', 2, body)
  return javaAjax(count)
}

async function roleStatus(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const roleId = positiveId(body.roleId, '角色ID')
  if (roleId === 1) writeFail('不允许操作超级管理员角色')
  await assertRoleScope(connection, session, roleId)
  const status = text(body.status)
  if (!['0', '1'].includes(status)) writeFail('角色状态不符合规范')
  const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_role SET status = ?, update_by = ?, update_time = NOW() WHERE role_id = ?'), [status, session.userName, roleId])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '角色管理', 2, body)
  return javaAjax(count)
}

async function roleDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const roleIds = idList(routeId(event, 'roleIds'), '角色ID')
  for (const roleId of roleIds) {
    if (roleId === 1) writeFail('不允许操作超级管理员角色')
    await assertRoleScope(connection, session, roleId)
    const role = await assertExists(connection, 'SELECT role_id, role_name FROM sys_role WHERE role_id = ? AND del_flag = \'0\'', [roleId], '角色不存在')
    if (await queryOne(connection, 'SELECT user_id FROM sys_user_role WHERE role_id = ? LIMIT 1', [roleId])) writeFail(`${role.role_name}已分配,不能删除`)
  }
  const placeholders = sqlPlaceholders(roleIds)
  await connection.query(mysqlQueryOptions(`DELETE FROM sys_role_menu WHERE role_id IN (${placeholders})`), roleIds)
  await connection.query(mysqlQueryOptions(`DELETE FROM sys_role_dept WHERE role_id IN (${placeholders})`), roleIds)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE sys_role SET del_flag = '2' WHERE role_id IN (${placeholders}) AND del_flag = '0'`), roleIds)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '角色管理', 3, { roleIds })
  return javaAjax(count)
}

async function roleAuthCancel(event: H3Event, session: AuthSession, connection: PoolConnection, all: boolean, select: boolean) {
  const body = await queryAndBody(event)
  const roleId = positiveId(body.roleId, '角色ID')
  await assertRoleScope(connection, session, roleId)
  const userIds = idList(body.userIds ?? body.userId, '用户ID')
  for (const userId of userIds) await assertUserScope(connection, session, userId)
  let result: any
  if (select) {
    await assertExists(connection, 'SELECT role_id FROM sys_role WHERE role_id = ? AND del_flag = \'0\'', [roleId], '角色不存在')
    const values: unknown[] = []
    for (const userId of userIds) values.push(userId, roleId)
    result = await connection.query(mysqlQueryOptions(`INSERT IGNORE INTO sys_user_role (user_id, role_id) VALUES ${userIds.map(() => '(?, ?)').join(', ')}`), values)
    if (!affectedRows(result[0])) return apiSuccess(undefined, '操作成功')
  } else {
    result = all
      ? await connection.query(mysqlQueryOptions(`DELETE FROM sys_user_role WHERE role_id = ? AND user_id IN (${sqlPlaceholders(userIds)})`), [roleId, ...userIds])
      : await connection.query(mysqlQueryOptions('DELETE FROM sys_user_role WHERE role_id = ? AND user_id = ?'), [roleId, userIds[0]])
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '角色管理', 8, { roleId, userIds })
  return javaAjax(count)
}

function passwordValue(value: unknown): string {
  const password = requiredText(value, '密码')
  if (password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$')) return password
  return hashSync(password, 10)
}

async function userAdd(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const userName = requiredText(body.userName, '登录账号', 30)
  const nickName = requiredText(body.nickName, '用户昵称', 30)
  await unique(connection, 'SELECT user_id FROM sys_user WHERE user_name = ? AND del_flag = \'0\' LIMIT 1', [userName], null, `新增用户'${userName}'失败，登录账号已存在`)
  if (text(body.phonenumber)) await unique(connection, 'SELECT user_id FROM sys_user WHERE phonenumber = ? AND del_flag = \'0\' LIMIT 1', [text(body.phonenumber)], null, `新增用户'${userName}'失败，手机号码已存在`)
  if (text(body.email)) await unique(connection, 'SELECT user_id FROM sys_user WHERE email = ? AND del_flag = \'0\' LIMIT 1', [text(body.email)], null, `新增用户'${userName}'失败，邮箱账号已存在`)
  const deptId = optionalId(body.deptId)
  await assertDeptScope(connection, session, deptId)
  const roleIds = roleRelationIds(body, 'roleIds')
  const postIds = roleRelationIds(body, 'postIds')
  await assertRoleIds(connection, session, roleIds)
  await assertPostIds(connection, postIds)
  const result: any = await connection.query(mysqlQueryOptions(`
    INSERT INTO sys_user (dept_id, user_name, nick_name, email, phonenumber, sex, password, status, remark, create_by, create_time, del_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), '0')
  `), [deptId, userName, nickName, nullableText(body.email), nullableText(body.phonenumber), text(body.sex) || '0', passwordValue(body.password), text(body.status) || '0', nullableText(body.remark), session.userName])
  const userId = Number(result[0]?.insertId || 0)
  if (!userId) writeFail('用户ID生成失败')
  if (roleIds.length) {
    const values: unknown[] = []
    for (const roleId of roleIds) values.push(userId, roleId)
    await connection.query(mysqlQueryOptions(`INSERT INTO sys_user_role (user_id, role_id) VALUES ${roleIds.map(() => '(?, ?)').join(', ')}`), values)
  }
  if (postIds.length) {
    const values: unknown[] = []
    for (const postId of postIds) values.push(userId, postId)
    await connection.query(mysqlQueryOptions(`INSERT INTO sys_user_post (user_id, post_id) VALUES ${postIds.map(() => '(?, ?)').join(', ')}`), values)
  }
  await insertOperationLog(event, connection, session, '用户管理', 1, { ...body, password: '[redacted]' })
  return javaAjax(affectedRows(result[0]))
}

async function userEdit(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const userId = positiveId(body.userId, '用户ID')
  if (userId === 1) writeFail('不允许操作超级管理员用户')
  await assertUserScope(connection, session, userId)
  const user = await assertExists(connection, 'SELECT user_id, user_name FROM sys_user WHERE user_id = ? AND del_flag = \'0\'', [userId], '用户不存在')
  const userName = requiredText(body.userName, '登录账号', 30)
  const nickName = requiredText(body.nickName, '用户昵称', 30)
  await unique(connection, 'SELECT user_id FROM sys_user WHERE user_name = ? AND del_flag = \'0\' LIMIT 1', [userName], userId, `修改用户'${userName}'失败，登录账号已存在`)
  if (text(body.phonenumber)) await unique(connection, 'SELECT user_id FROM sys_user WHERE phonenumber = ? AND del_flag = \'0\' LIMIT 1', [text(body.phonenumber)], userId, `修改用户'${userName}'失败，手机号码已存在`)
  if (text(body.email)) await unique(connection, 'SELECT user_id FROM sys_user WHERE email = ? AND del_flag = \'0\' LIMIT 1', [text(body.email)], userId, `修改用户'${userName}'失败，邮箱账号已存在`)
  const deptId = optionalId(body.deptId)
  await assertDeptScope(connection, session, deptId)
  const roleIds = roleRelationIds(body, 'roleIds')
  const postIds = roleRelationIds(body, 'postIds')
  await assertRoleIds(connection, session, roleIds)
  await assertPostIds(connection, postIds)
  const fields = ['dept_id = ?', 'user_name = ?', 'nick_name = ?', 'email = ?', 'phonenumber = ?', 'sex = ?', 'status = ?', 'remark = ?', 'update_by = ?', 'update_time = NOW()']
  const values: unknown[] = [deptId, userName, nickName, nullableText(body.email), nullableText(body.phonenumber), text(body.sex) || '0', text(body.status) || '0', nullableText(body.remark), session.userName]
  if (body.password != null && text(body.password)) {
    fields.splice(6, 0, 'password = ?')
    values.splice(6, 0, passwordValue(body.password))
  }
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE sys_user SET ${fields.join(', ')} WHERE user_id = ? AND del_flag = '0'`), [...values, userId])
  await connection.query(mysqlQueryOptions('DELETE FROM sys_user_role WHERE user_id = ?'), [userId])
  await connection.query(mysqlQueryOptions('DELETE FROM sys_user_post WHERE user_id = ?'), [userId])
  if (roleIds.length) {
    const relationValues: unknown[] = []
    for (const roleId of roleIds) relationValues.push(userId, roleId)
    await connection.query(mysqlQueryOptions(`INSERT INTO sys_user_role (user_id, role_id) VALUES ${roleIds.map(() => '(?, ?)').join(', ')}`), relationValues)
  }
  if (postIds.length) {
    const relationValues: unknown[] = []
    for (const postId of postIds) relationValues.push(userId, postId)
    await connection.query(mysqlQueryOptions(`INSERT INTO sys_user_post (user_id, post_id) VALUES ${postIds.map(() => '(?, ?)').join(', ')}`), relationValues)
  }
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '用户管理', 2, { ...body, password: body.password ? '[redacted]' : undefined })
  void user
  return javaAjax(count)
}

async function userDelete(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const userIds = idList(routeId(event, 'userIds'), '用户ID')
  if (userIds.includes(session.userId)) return apiError('当前用户不能删除', 500)
  for (const userId of userIds) {
    if (userId === 1) writeFail('不允许操作超级管理员用户')
    await assertUserScope(connection, session, userId)
  }
  const placeholders = sqlPlaceholders(userIds)
  await connection.query(mysqlQueryOptions(`DELETE FROM sys_user_role WHERE user_id IN (${placeholders})`), userIds)
  await connection.query(mysqlQueryOptions(`DELETE FROM sys_user_post WHERE user_id IN (${placeholders})`), userIds)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE sys_user SET del_flag = '2' WHERE user_id IN (${placeholders}) AND del_flag = '0'`), userIds)
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '用户管理', 3, { userIds })
  return javaAjax(count)
}

async function userPassword(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const userId = positiveId(body.userId, '用户ID')
  if (userId === 1) writeFail('不允许操作超级管理员用户')
  await assertUserScope(connection, session, userId)
  const targetUser = await queryOne(connection, 'SELECT user_name FROM sys_user WHERE user_id = ? AND del_flag = \'0\'', [userId])
  const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_user SET password = ?, update_by = ?, update_time = NOW() WHERE user_id = ? AND del_flag = \'0\''), [passwordValue(body.password), session.userName, userId])
  const count = affectedRows(result[0])
  const targetUserName = text((targetUser as any)?.user_name)
  if (count > 0 && targetUserName) {
    await connection.query(mysqlQueryOptions('DELETE FROM sys_cache WHERE cache_key = ?'), [
      `pwd_err_cnt:${targetUserName}`,
    ])
  }
  await insertOperationLog(event, connection, session, '用户管理', 2, { userId, password: '[redacted]' })
  return javaAjax(count)
}

async function userStatus(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await bodyOf(event)
  const userId = positiveId(body.userId, '用户ID')
  if (userId === 1) writeFail('不允许操作超级管理员用户')
  await assertUserScope(connection, session, userId)
  const status = text(body.status)
  if (!['0', '1'].includes(status)) writeFail('用户状态不符合规范')
  const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_user SET status = ?, update_by = ?, update_time = NOW() WHERE user_id = ? AND del_flag = \'0\''), [status, session.userName, userId])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '用户管理', 2, body)
  return javaAjax(count)
}

async function userAuthRole(event: H3Event, session: AuthSession, connection: PoolConnection) {
  const body = await queryAndBody(event)
  const userId = positiveId(body.userId, '用户ID')
  if (userId === 1) writeFail('不允许操作超级管理员用户')
  await assertUserScope(connection, session, userId)
  const roleIds = roleRelationIds(body, 'roleIds')
  await assertRoleIds(connection, session, roleIds)
  await connection.query(mysqlQueryOptions('DELETE FROM sys_user_role WHERE user_id = ?'), [userId])
  if (roleIds.length) {
    const values: unknown[] = []
    for (const roleId of roleIds) values.push(userId, roleId)
    await connection.query(mysqlQueryOptions(`INSERT INTO sys_user_role (user_id, role_id) VALUES ${roleIds.map(() => '(?, ?)').join(', ')}`), values)
  }
  await insertOperationLog(event, connection, session, '用户管理', 4, { userId, roleIds })
  return apiSuccess(undefined, '操作成功')
}

export function createSystemWriteHandler(kind: Kind, options: { refreshSessions?: boolean } = {}) {
  return (event: H3Event) => withWriteSession(event, `System:${kind}`, null, async (session, connection) => {
    switch (kind) {
      case 'config-add': return configAdd(event, session, connection)
      case 'config-edit': return configEdit(event, session, connection)
      case 'config-delete': return configDelete(event, session, connection)
      case 'config-refresh': return apiSuccess(undefined, '刷新成功')
      case 'dept-add': return deptAdd(event, session, connection)
      case 'dept-edit': return deptEdit(event, session, connection)
      case 'dept-delete': return deptDelete(event, session, connection)
      case 'dict-data-add': return dictDataWrite(event, session, connection, false)
      case 'dict-data-edit': return dictDataWrite(event, session, connection, true)
      case 'dict-data-delete': return dictDataDelete(event, session, connection)
      case 'dict-type-add': return dictTypeWrite(event, session, connection, false)
      case 'dict-type-edit': return dictTypeWrite(event, session, connection, true)
      case 'dict-type-delete': return dictTypeDelete(event, session, connection)
      case 'dict-type-refresh': return apiSuccess(undefined, '刷新成功')
      case 'menu-add': return menuWrite(event, session, connection, false)
      case 'menu-edit': return menuWrite(event, session, connection, true)
      case 'menu-delete': return menuDelete(event, session, connection)
      case 'notice-add': return noticeWrite(event, session, connection, false)
      case 'notice-edit': return noticeWrite(event, session, connection, true)
      case 'notice-delete': {
        const ids = idList(routeId(event, 'noticeIds'), '公告ID')
        const result: any = await connection.query(mysqlQueryOptions(`DELETE FROM sys_notice WHERE notice_id IN (${sqlPlaceholders(ids)})`), ids)
        const count = affectedRows(result[0])
        await insertOperationLog(event, connection, session, '通知公告', 3, { noticeIds: ids })
        return javaAjax(count)
      }
      case 'post-add': return postWrite(event, session, connection, false)
      case 'post-edit': return postWrite(event, session, connection, true)
      case 'post-delete': return postDelete(event, session, connection)
      case 'role-add': return roleWrite(event, session, connection, false)
      case 'role-edit': return roleWrite(event, session, connection, true)
      case 'role-data-scope': return roleDataScope(event, session, connection)
      case 'role-status': return roleStatus(event, session, connection)
      case 'role-delete': return roleDelete(event, session, connection)
      case 'role-auth-cancel': return roleAuthCancel(event, session, connection, false, false)
      case 'role-auth-cancel-all': return roleAuthCancel(event, session, connection, true, false)
      case 'role-auth-select-all': return roleAuthCancel(event, session, connection, false, true)
      case 'user-add': return userAdd(event, session, connection)
      case 'user-edit': return userEdit(event, session, connection)
      case 'user-delete': return userDelete(event, session, connection)
      case 'user-reset-password': return userPassword(event, session, connection)
      case 'user-status': return userStatus(event, session, connection)
      case 'user-auth-role': return userAuthRole(event, session, connection)
      default: return ajaxError('接口尚未迁移')
    }
  }, '操作失败', options.refreshSessions ? refreshNitroSessions : undefined)
}
