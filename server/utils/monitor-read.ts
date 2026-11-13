import type { H3Event } from 'h3'
import { getQuery, getRouterParam } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { apiError } from './response'
import {
  camelizeRows,
  dataResult,
  pageRequest,
  queryPage,
  queryNumber,
  queryText,
  tableResult,
  withReadSession,
} from './read'

export type MonitorReadKind =
  | 'logininfor-list' | 'operlog-list' | 'operlog-detail'
  | 'job-list' | 'job-detail' | 'job-log-list' | 'job-log-detail'

type Query = Record<string, unknown>

function q(event: H3Event) {
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

function date(conditions: string[], params: unknown[], column: string, begin: unknown, end: unknown) {
  const beginText = queryText(begin)
  const endText = queryText(end)
  if (beginText) { conditions.push(`${column} >= ?`); params.push(beginText) }
  if (endText) { conditions.push(`${column} <= ?`); params.push(endText) }
}

function listValues(value: unknown) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return values.map((item) => queryText(item)).filter(Boolean)
}

function pathNumber(event: H3Event, name: string) {
  const id = queryNumber(getRouterParam(event, name))
  return Number.isInteger(id) && id > 0 ? id : null
}

async function logininforList(event: H3Event) {
  return withReadSession(event, 'MonitorLogininforList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'ipaddr', query.ipaddr)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'user_name', query.userName)
    date(conditions, params, 'login_time', query.beginTime, query.endTime)
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_logininfor${where}`,
      `SELECT info_id, user_name, ipaddr, login_location, browser, os, status, msg, login_time FROM sys_logininfor${where} ORDER BY info_id DESC LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取登录日志列表失败')
}

async function operlogList(event: H3Event) {
  return withReadSession(event, 'MonitorOperlogList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'oper_ip', query.operIp)
    like(conditions, params, 'title', query.title)
    const businessTypes = listValues(query.businessTypes)
    if (businessTypes.length) {
      conditions.push(`business_type IN (${businessTypes.map(() => '?').join(', ')})`)
      params.push(...businessTypes)
    } else equal(conditions, params, 'business_type', query.businessType)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'oper_name', query.operName)
    date(conditions, params, 'oper_time', query.beginTime, query.endTime)
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_oper_log${where}`,
      `SELECT oper_id, title, business_type, method, request_method, operator_type, oper_name, dept_name, oper_url, oper_ip, oper_location, oper_param, json_result, status, error_msg, oper_time, cost_time FROM sys_oper_log${where} ORDER BY oper_id DESC LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取操作日志列表失败')
}

async function operlogDetail(event: H3Event) {
  return withReadSession(event, 'MonitorOperlogDetail', async (_, pool) => {
    const id = pathNumber(event, 'operId')
    if (!id) return apiError('参数不符合规范，不能进行查询', 500)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT oper_id, title, business_type, method, request_method, operator_type, oper_name, dept_name, oper_url, oper_ip, oper_location, oper_param, json_result, status, error_msg, oper_time, cost_time FROM sys_oper_log WHERE oper_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取操作日志详情失败')
}

async function jobList(event: H3Event) {
  return withReadSession(event, 'MonitorJobList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'job_name', query.jobName)
    equal(conditions, params, 'job_group', query.jobGroup)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'invoke_target', query.invokeTarget)
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM sys_job${where}`,
      `SELECT job_id, job_name, job_group, invoke_target, cron_expression, misfire_policy, concurrent, status, create_by, create_time, remark FROM sys_job${where} LIMIT ?, ?`,
      params,
      [...params, page.offset, page.pageSize],
    )
    return tableResult(result.rows, result.total)
  }, '获取定时任务列表失败')
}

async function jobDetail(event: H3Event) {
  return withReadSession(event, 'MonitorJobDetail', async (_, pool) => {
    const id = pathNumber(event, 'jobId')
    if (!id) return apiError('参数不符合规范，不能进行查询', 500)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT job_id, job_name, job_group, invoke_target, cron_expression, misfire_policy, concurrent, status, create_by, create_time, remark FROM sys_job WHERE job_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取定时任务详情失败')
}

async function jobLogList(event: H3Event) {
  return withReadSession(event, 'MonitorJobLogList', async (_, pool) => {
    const query = q(event)
    const page = pageRequest(query)
    const conditions: string[] = []
    const params: unknown[] = []
    like(conditions, params, 'job_name', query.jobName)
    equal(conditions, params, 'job_group', query.jobGroup)
    equal(conditions, params, 'status', query.status)
    like(conditions, params, 'invoke_target', query.invokeTarget)
    date(conditions, params, 'create_time', query.beginTime, query.endTime)
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    // sys_job_log is a high-volume table in the test environment. Keep the
    // Java-compatible exact total, but allow the count query more time than
    // the normal read timeout so a large log table does not fail by default.
    const timeout = 30000
    const [countRows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT COUNT(*) AS total FROM sys_job_log${where}`,
      timeout,
    }, params)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: `SELECT job_log_id, job_name, job_group, invoke_target, job_message, status, exception_info, create_time FROM sys_job_log${where} ORDER BY create_time DESC LIMIT ?, ?`,
      timeout,
    }, [...params, page.offset, page.pageSize])
    return tableResult(rows, Number(countRows[0]?.total || 0))
  }, '获取调度日志列表失败')
}

async function jobLogDetail(event: H3Event) {
  return withReadSession(event, 'MonitorJobLogDetail', async (_, pool) => {
    const id = pathNumber(event, 'jobLogId')
    if (!id) return apiError('参数不符合规范，不能进行查询', 500)
    const [rows] = await pool.query<RowDataPacket[]>({
      sql: 'SELECT job_log_id, job_name, job_group, invoke_target, job_message, status, exception_info, create_time FROM sys_job_log WHERE job_log_id = ?',
      timeout: 10000,
    }, [id])
    return dataResult(camelizeRows(rows)[0] ?? null)
  }, '获取调度日志详情失败')
}

export function createMonitorReadHandler(kind: MonitorReadKind) {
  return (event: H3Event) => {
    switch (kind) {
      case 'logininfor-list': return logininforList(event)
      case 'operlog-list': return operlogList(event)
      case 'operlog-detail': return operlogDetail(event)
      case 'job-list': return jobList(event)
      case 'job-detail': return jobDetail(event)
      case 'job-log-list': return jobLogList(event)
      case 'job-log-detail': return jobLogDetail(event)
      default: return apiError('接口尚未迁移', 501)
    }
  }
}
