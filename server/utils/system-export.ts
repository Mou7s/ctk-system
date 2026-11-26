import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getXlsxSync } from './lazy-deps'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { dataScopeFragment, queryNumber, queryText, withReadSession } from './read'

type Query = Record<string, unknown>

export type SystemExportKind = 'user' | 'role' | 'post' | 'config' | 'dict-data' | 'dict-type'

const EXPORT_PAGE_SIZE = 5_000

function mergeRequestValue(query: Query, key: string, value: unknown) {
  const paramsMatch = /^params\[(.+)\]$/.exec(key)
  query[paramsMatch?.[1] || key] = value
}

async function requestQuery(event: H3Event): Promise<Query> {
  const query: Query = { ...(getQuery(event) as Query) }
  const body = await readBody(event)
  if (typeof body === 'string') {
    for (const [key, value] of new URLSearchParams(body).entries()) mergeRequestValue(query, key, value)
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (key === 'params' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [paramKey, paramValue] of Object.entries(value as Record<string, unknown>)) mergeRequestValue(query, paramKey, paramValue)
      } else {
        mergeRequestValue(query, key, value)
      }
    }
  }
  return query
}

function where(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
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

async function readAll(
  pool: Pool,
  countSql: string,
  selectSql: string,
  params: unknown[],
): Promise<RowDataPacket[]> {
  const [countRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(countSql), params)
  const total = Number(countRows[0]?.total || 0)
  const rows: RowDataPacket[] = []
  for (let offset = 0; offset < total; offset += EXPORT_PAGE_SIZE) {
    const [page] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(selectSql), [...params, offset, EXPORT_PAGE_SIZE])
    rows.push(...page)
    if (page.length === 0) break
  }
  return rows
}

function cellValue(input: unknown) {
  return input == null ? '' : input
}

function translated(input: unknown, labels: Record<string, string>) {
  const raw = input == null ? '' : String(input)
  return labels[raw] || cellValue(input)
}

function sendExcel(
  event: H3Event,
  fileName: string,
  sheetName: string,
  headers: string[],
  rows: unknown[][],
) {
  const XLSX = getXlsxSync()
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

async function exportUser(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemUserExport', async (session, pool) => {
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
    const scope = await dataScopeFragment(pool, session, 'system:user:list', 'd', 'u')
    const sqlWhere = `${where(conditions)}${scope.sql}`
    const base = ` FROM sys_user u LEFT JOIN sys_dept d ON u.dept_id = d.dept_id${sqlWhere}`
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total${base}`,
      `SELECT u.user_id, u.user_name, u.nick_name, u.email, u.phonenumber, u.sex, u.status, u.login_ip, u.login_date, d.dept_name, d.leader${base} LIMIT ?, ?`,
      [...params, ...scope.params],
    )
    const data = rows.map((row) => [
      cellValue(row.user_id), cellValue(row.user_name), cellValue(row.nick_name), cellValue(row.email), cellValue(row.phonenumber),
      translated(row.sex, { '0': '男', '1': '女', '2': '未知' }), translated(row.status, { '0': '正常', '1': '停用' }),
      cellValue(row.login_ip), cellValue(row.login_date), cellValue(row.dept_name), cellValue(row.leader),
    ])
    return sendExcel(event, '用户数据.xlsx', '用户数据', ['用户序号', '登录名称', '用户名称', '用户邮箱', '手机号码', '用户性别', '帐号状态', '最后登录IP', '最后登录时间', '部门名称', '部门负责人'], data)
  }, '导出用户数据失败')
}

async function exportRole(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemRoleExport', async (session, pool) => {
    const conditions = ["r.del_flag = '0'"]
    const params: unknown[] = []
    const roleId = queryNumber(query.roleId)
    if (roleId) { conditions.push('r.role_id = ?'); params.push(roleId) }
    like(conditions, params, 'r.role_name', query.roleName)
    equal(conditions, params, 'r.status', query.status)
    like(conditions, params, 'r.role_key', query.roleKey)
    dateBound(conditions, params, 'r.create_time', query.beginTime, query.endTime)
    const scope = await dataScopeFragment(pool, session, 'system:role:list', 'd')
    const sqlWhere = `${where(conditions)}${scope.sql}`
    const base = ` FROM sys_role r LEFT JOIN sys_user_role ur ON ur.role_id = r.role_id LEFT JOIN sys_user u ON u.user_id = ur.user_id LEFT JOIN sys_dept d ON u.dept_id = d.dept_id${sqlWhere}`
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM (SELECT DISTINCT r.role_id${base}) scoped_roles`,
      `SELECT DISTINCT r.role_id, r.role_name, r.role_key, r.role_sort, r.data_scope, r.status${base} ORDER BY r.role_sort LIMIT ?, ?`,
      [...params, ...scope.params],
    )
    const data = rows.map((row) => [
      cellValue(row.role_id), cellValue(row.role_name), cellValue(row.role_key), cellValue(row.role_sort),
      translated(row.data_scope, { '1': '所有数据权限', '2': '自定义数据权限', '3': '本部门数据权限', '4': '本部门及以下数据权限', '5': '仅本人数据权限' }),
      translated(row.status, { '0': '正常', '1': '停用' }),
    ])
    return sendExcel(event, '角色数据.xlsx', '角色数据', ['角色序号', '角色名称', '角色权限', '角色排序', '数据范围', '角色状态'], data)
  }, '导出角色数据失败')
}

async function exportPost(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemPostExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'post_code', query.postCode)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'post_name', query.postName)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_post${sqlWhere}`,
      `SELECT post_id, post_code, post_name, post_sort, status FROM sys_post${sqlWhere} LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [cellValue(row.post_id), cellValue(row.post_code), cellValue(row.post_name), cellValue(row.post_sort), translated(row.status, { '0': '正常', '1': '停用' })])
    return sendExcel(event, '岗位数据.xlsx', '岗位数据', ['岗位序号', '岗位编码', '岗位名称', '岗位排序', '状态'], data)
  }, '导出岗位数据失败')
}

async function exportConfig(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemConfigExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'config_name', query.configName)
    equal(conditions, params, 'config_type', query.configType)
    like(conditions, params, 'config_key', query.configKey)
    dateBound(conditions, params, 'create_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_config${sqlWhere}`,
      `SELECT config_id, config_name, config_key, config_value, config_type FROM sys_config${sqlWhere} LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [cellValue(row.config_id), cellValue(row.config_name), cellValue(row.config_key), cellValue(row.config_value), translated(row.config_type, { Y: '是', N: '否' })])
    return sendExcel(event, '参数数据.xlsx', '参数数据', ['参数主键', '参数名称', '参数键名', '参数键值', '系统内置'], data)
  }, '导出参数数据失败')
}

async function exportDictData(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemDictDataExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    equal(conditions, params, 'dict_type', query.dictType)
    like(conditions, params, 'dict_label', query.dictLabel)
    equal(conditions, params, 'status', query.status)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_dict_data${sqlWhere}`,
      `SELECT dict_code, dict_sort, dict_label, dict_value, dict_type, is_default, status FROM sys_dict_data${sqlWhere} ORDER BY dict_sort ASC LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [
      cellValue(row.dict_code), cellValue(row.dict_sort), cellValue(row.dict_label), cellValue(row.dict_value), cellValue(row.dict_type),
      translated(row.is_default, { Y: '是', N: '否' }), translated(row.status, { '0': '正常', '1': '停用' }),
    ])
    return sendExcel(event, '字典数据.xlsx', '字典数据', ['字典编码', '字典排序', '字典标签', '字典键值', '字典类型', '是否默认', '状态'], data)
  }, '导出字典数据失败')
}

async function exportDictType(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'SystemDictTypeExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'dict_name', query.dictName)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'dict_type', query.dictType)
    dateBound(conditions, params, 'create_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_dict_type${sqlWhere}`,
      `SELECT dict_id, dict_name, dict_type, status FROM sys_dict_type${sqlWhere} LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [cellValue(row.dict_id), cellValue(row.dict_name), cellValue(row.dict_type), translated(row.status, { '0': '正常', '1': '停用' })])
    return sendExcel(event, '字典类型.xlsx', '字典类型', ['字典主键', '字典名称', '字典类型', '状态'], data)
  }, '导出字典类型失败')
}

export function createSystemExportHandler(kind: SystemExportKind) {
  return async (event: H3Event) => {
    switch (kind) {
      case 'user': return exportUser(event)
      case 'role': return exportRole(event)
      case 'post': return exportPost(event)
      case 'config': return exportConfig(event)
      case 'dict-data': return exportDictData(event)
      case 'dict-type': return exportDictType(event)
    }
  }
}
