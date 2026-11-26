import { getQuery, readBody, setResponseHeader, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getXlsxSync } from './lazy-deps'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { queryText, withReadSession } from './read'

type Query = Record<string, unknown>
export type MonitorExportKind = 'logininfor' | 'operlog' | 'job' | 'jobLog'

const EXPORT_PAGE_SIZE = 5_000
const EXPORT_SHEET_SIZE = 65_536
const LARGE_EXPORT_TIMEOUT_MS = 120_000

function mergeQuery(query: Query, key: string, value: unknown) {
  const arrayMatch = /^businessTypes\[(\d+)\]$/.exec(key)
  if (arrayMatch) {
    const list = Array.isArray(query.businessTypes) ? query.businessTypes : []
    list[Number(arrayMatch[1])] = value
    query.businessTypes = list
    return
  }
  const paramsMatch = /^params\[(.+)\]$/.exec(key)
  query[paramsMatch?.[1] || key] = value
}

async function requestQuery(event: H3Event): Promise<Query> {
  const query: Query = { ...(getQuery(event) as Query) }
  const body = await readBody(event)
  if (typeof body === 'string') {
    for (const [key, value] of new URLSearchParams(body).entries()) mergeQuery(query, key, value)
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) mergeQuery(query, key, value)
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

function date(conditions: string[], params: unknown[], column: string, begin: unknown, end: unknown) {
  const beginText = queryText(begin)
  const endText = queryText(end)
  if (beginText) { conditions.push(`${column} >= ?`); params.push(beginText) }
  if (endText) { conditions.push(`${column} <= ?`); params.push(endText) }
}

function dateOnly(conditions: string[], params: unknown[], column: string, begin: unknown, end: unknown) {
  const beginText = queryText(begin)
  const endText = queryText(end)
  if (beginText) { conditions.push(`${column} >= DATE(?)`); params.push(beginText) }
  if (endText) { conditions.push(`${column} < DATE_ADD(DATE(?), INTERVAL 1 DAY)`); params.push(endText) }
}

async function readAll(pool: Pool, countSql: string, selectSql: string, params: unknown[], timeoutMs?: number, singleQuery = false) {
  const options = (sql: string) => {
    const result = mysqlQueryOptions(sql)
    if (timeoutMs) result.timeout = timeoutMs
    return result
  }
  const [countRows] = await pool.query<RowDataPacket[]>(options(countSql), params)
  const total = Number(countRows[0]?.total || 0)
  if (singleQuery) {
    const [allRows] = await pool.query<RowDataPacket[]>(options(selectSql), params)
    return allRows
  }
  const rows: RowDataPacket[] = []
  for (let offset = 0; offset < total; offset += EXPORT_PAGE_SIZE) {
    const [page] = await pool.query<RowDataPacket[]>(options(selectSql), [...params, offset, EXPORT_PAGE_SIZE])
    rows.push(...page)
    if (!page.length) break
  }
  return rows
}

function cellValue(input: unknown) {
  return input == null ? '' : input
}

function dateTimeValue(input: unknown) {
  if (input == null || input === '') return ''
  if (input instanceof Date) {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())} ${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}`
  }
  const text = String(input).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text) ? text.slice(0, 19) : text
}

function translated(input: unknown, labels: Record<string, string>) {
  const raw = input == null ? '' : String(input)
  return labels[raw] || cellValue(input)
}

function sendExcel(event: H3Event, fileName: string, sheetName: string, headers: string[], rows: unknown[][]) {
  const XLSX = getXlsxSync()
  const workbook = XLSX.utils.book_new()
  const sheetCount = Math.max(1, Math.ceil(rows.length / EXPORT_SHEET_SIZE))
  for (let index = 0; index < sheetCount; index += 1) {
    const start = index * EXPORT_SHEET_SIZE
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.slice(start, start + EXPORT_SHEET_SIZE)])
    XLSX.utils.book_append_sheet(workbook, worksheet, index === 0 ? sheetName : `${sheetName}${index}`)
  }
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}

async function exportLogininfor(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'MonitorLogininforExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'ipaddr', query.ipaddr)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'user_name', query.userName)
    date(conditions, params, 'login_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_logininfor${sqlWhere}`,
      `SELECT info_id, user_name, status, ipaddr, login_location, browser, os, msg, login_time FROM sys_logininfor${sqlWhere} ORDER BY info_id DESC LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [
      cellValue(row.info_id), cellValue(row.user_name), translated(row.status, { '0': '成功', '1': '失败' }),
      cellValue(row.ipaddr), cellValue(row.login_location), cellValue(row.browser), cellValue(row.os), cellValue(row.msg), dateTimeValue(row.login_time),
    ])
    return sendExcel(event, '登录日志.xlsx', '登录日志', ['序号', '用户账号', '登录状态', '登录地址', '登录地点', '浏览器', '操作系统', '提示消息', '访问时间'], data)
  }, '导出登录日志失败')
}

async function exportOperlog(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'MonitorOperlogExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'oper_ip', query.operIp)
    like(conditions, params, 'title', query.title)
    const businessTypes = Array.isArray(query.businessTypes) ? query.businessTypes.map(queryText).filter(Boolean) : []
    if (businessTypes.length) {
      conditions.push(`business_type IN (${businessTypes.map(() => '?').join(', ')})`)
      params.push(...businessTypes)
    } else equal(conditions, params, 'business_type', query.businessType)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'oper_name', query.operName)
    date(conditions, params, 'oper_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_oper_log${sqlWhere}`,
      `SELECT oper_id, title, business_type, method, request_method, operator_type, oper_name, dept_name, oper_url, oper_ip, oper_location, oper_param, json_result, status, error_msg, oper_time, cost_time FROM sys_oper_log${sqlWhere} ORDER BY oper_id DESC LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [
      cellValue(row.oper_id), cellValue(row.title), translated(row.business_type, { '0': '其它', '1': '新增', '2': '修改', '3': '删除', '4': '授权', '5': '导出', '6': '导入', '7': '强退', '8': '生成代码', '9': '清空数据' }),
      cellValue(row.method), cellValue(row.request_method), translated(row.operator_type, { '0': '其它', '1': '后台用户', '2': '手机端用户' }),
      cellValue(row.oper_name), cellValue(row.dept_name), cellValue(row.oper_url), cellValue(row.oper_ip), cellValue(row.oper_location), cellValue(row.oper_param), cellValue(row.json_result),
      translated(row.status, { '0': '正常', '1': '异常' }), cellValue(row.error_msg), dateTimeValue(row.oper_time), `${cellValue(row.cost_time)}毫秒`,
    ])
    return sendExcel(event, '操作日志.xlsx', '操作日志', ['操作序号', '操作模块', '业务类型', '请求方法', '请求方式', '操作类别', '操作人员', '部门名称', '请求地址', '操作地址', '操作地点', '请求参数', '返回参数', '状态', '错误消息', '操作时间', '消耗时间'], data)
  }, '导出操作日志失败')
}

async function exportJob(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'MonitorJobExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'job_name', query.jobName)
    equal(conditions, params, 'job_group', query.jobGroup)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'invoke_target', query.invokeTarget)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_job${sqlWhere}`,
      `SELECT job_id, job_name, job_group, invoke_target, cron_expression, misfire_policy, concurrent, status FROM sys_job${sqlWhere} LIMIT ?, ?`,
      params,
    )
    const data = rows.map((row) => [
      cellValue(row.job_id), cellValue(row.job_name), cellValue(row.job_group), cellValue(row.invoke_target),
      cellValue(row.cron_expression), translated(row.misfire_policy, { '0': '默认', '1': '立即触发执行', '2': '触发一次执行', '3': '不触发立即执行' }),
      translated(row.concurrent, { '0': '允许', '1': '禁止' }), translated(row.status, { '0': '正常', '1': '暂停' }),
    ])
    return sendExcel(event, '定时任务.xlsx', '定时任务', ['任务序号', '任务名称', '任务组名', '调用目标字符串', '执行表达式 ', '计划策略 ', '并发执行', '任务状态'], data)
  }, '导出定时任务失败')
}

async function exportJobLog(event: H3Event) {
  const query = await requestQuery(event)
  return withReadSession(event, 'MonitorJobLogExport', async (_, pool) => {
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'job_name', query.jobName)
    equal(conditions, params, 'job_group', query.jobGroup)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'invoke_target', query.invokeTarget)
    dateOnly(conditions, params, 'create_time', query.beginTime, query.endTime)
    const sqlWhere = where(conditions)
    const rows = await readAll(
      pool,
      `SELECT COUNT(*) AS total FROM sys_job_log${sqlWhere}`,
      `SELECT job_log_id, job_name, job_group, invoke_target, job_message, status, exception_info FROM sys_job_log${sqlWhere} ORDER BY create_time DESC`,
      params,
      LARGE_EXPORT_TIMEOUT_MS,
      true,
    )
    const data = rows.map((row) => [
      cellValue(row.job_log_id), cellValue(row.job_name), cellValue(row.job_group), cellValue(row.invoke_target),
      cellValue(row.job_message), translated(row.status, { '0': '正常', '1': '失败' }), cellValue(row.exception_info),
    ])
    return sendExcel(event, '调度日志.xlsx', '调度日志', ['日志序号', '任务名称', '任务组名', '调用目标字符串', '日志信息', '执行状态', '异常信息'], data)
  }, '导出调度日志失败')
}

export function createMonitorExportHandler(kind: MonitorExportKind) {
  return (event: H3Event) => {
    if (kind === 'logininfor') return exportLogininfor(event)
    if (kind === 'operlog') return exportOperlog(event)
    if (kind === 'job') return exportJob(event)
    return exportJobLog(event)
  }
}
