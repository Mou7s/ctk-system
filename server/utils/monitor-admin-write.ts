import type { H3Event } from 'h3'
import { getHeader, getRequestURL, getRouterParam, getRouterParams, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import { getGarnet } from './redis'
import { mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess } from './response'
import {
  affectedRows,
  idList,
  insertOperationLog,
  javaAjax,
  queryOne,
  requiredText,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Body = Record<string, any>
type Kind = 'login-delete' | 'login-clean' | 'login-unlock' | 'oper-delete' | 'oper-clean' | 'joblog-delete' | 'joblog-clean' | 'job-add' | 'job-edit' | 'job-status' | 'job-run' | 'job-delete'

function requestId(event: H3Event, body: Body) {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function decodePathSegment(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw
  }
}

function pathValue(event: H3Event, name: string) {
  const direct = getRouterParam(event, name)
  if (direct != null && text(direct)) return decodePathSegment(direct)
  const params = typeof getRouterParams === 'function' ? (getRouterParams(event) as Record<string, unknown>) : undefined
  const named = params?.[name]
  if (named != null && text(named)) return decodePathSegment(named)
  try {
    const segments = getRequestURL(event).pathname.split('/').filter(Boolean)
    return decodePathSegment(segments.at(-1))
  } catch {
    return ''
  }
}

async function readOptionalBody(event: H3Event): Promise<Body> {
  const method = String((event as any)?.method || (event as any)?.node?.req?.method || '').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return {}
  const rawBody = await readBody(event).catch(() => undefined)
  return rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
}

function asNullable(value: unknown) {
  const valueText = text(value)
  return valueText || null
}

function cronIsSafe(value: unknown) {
  const cron = requiredText(value, 'Cron表达式', 120)
  if (!/^[0-9*/?,\-#LW ]+$/.test(cron)) writeFail('Cron表达式不符合规范')
  return cron
}

function invokeTargetIsSafe(value: unknown) {
  const target = requiredText(value, '调用目标', 500)
  if (/(?:^|[^a-z])(?:rmi|ldap|ldaps|https?|javascript)(?:[^a-z]|$)/i.test(target)) {
    writeFail('目标字符串包含不允许的调用方式')
  }
  if (/[;|&<>`]/.test(target)) writeFail('目标字符串包含不允许的字符')
  return target
}

async function deleteRows(connection: PoolConnection, table: string, column: string, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ')
  const [result] = await connection.query(mysqlQueryOptions(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`), ids)
  return affectedRows(result)
}

async function cleanRows(connection: PoolConnection, table: string) {
  const [result] = await connection.query(mysqlQueryOptions(`DELETE FROM ${table}`))
  return affectedRows(result)
}

async function writeJob(connection: PoolConnection, session: any, body: Body, editing: boolean) {
  const cronExpression = cronIsSafe(body.cronExpression)
  const invokeTarget = invokeTargetIsSafe(body.invokeTarget)
  const jobName = requiredText(body.jobName, '任务名称', 64)
  const jobGroup = text(body.jobGroup) || 'DEFAULT'
  const status = ['0', '1'].includes(text(body.status)) ? text(body.status) : '1'
  const concurrent = ['0', '1'].includes(text(body.concurrent)) ? text(body.concurrent) : '1'
  const misfirePolicy = text(body.misfirePolicy) || '3'
  if (editing) {
    const jobId = Number(body.jobId)
    if (!Number.isSafeInteger(jobId) || jobId <= 0) writeFail('任务ID不符合规范')
    await queryOne(connection, 'SELECT job_id FROM sys_job WHERE job_id = ?', [jobId]) || writeFail('任务不存在')
    const [result] = await connection.query(mysqlQueryOptions(`
      UPDATE sys_job SET job_name = ?, job_group = ?, invoke_target = ?, cron_expression = ?,
        misfire_policy = ?, concurrent = ?, status = ?, update_by = ?, update_time = NOW(), remark = ?
      WHERE job_id = ?`), [jobName, jobGroup, invokeTarget, cronExpression, misfirePolicy, concurrent, status, session.user.userName, asNullable(body.remark), jobId])
    return affectedRows(result)
  }
  const [result] = await connection.query(mysqlQueryOptions(`
    INSERT INTO sys_job (job_name, job_group, invoke_target, cron_expression, misfire_policy, concurrent, status, create_by, create_time, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`), [jobName, jobGroup, invokeTarget, cronExpression, misfirePolicy, concurrent, status, session.user.userName, asNullable(body.remark)])
  return affectedRows(result)
}

export function createMonitorAdminWriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const body = await readOptionalBody(event)
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `monitor-admin:${kind}`,
      null,
      requestKey,
      { ...body, requestId: requestKey, path: pathValue(event, 'userName') || pathValue(event, 'jobIds') || pathValue(event, 'jobLogIds') || pathValue(event, 'infoIds') || pathValue(event, 'operIds') },
      async (session, connection) => {
        let result: any
        let title = '监控管理'
        let businessType = 3
        if (kind === 'login-delete' || kind === 'login-clean') {
          title = '登录日志'
          result = kind === 'login-clean'
            ? javaAjax(await cleanRows(connection, 'sys_logininfor'))
            : javaAjax(await deleteRows(connection, 'sys_logininfor', 'info_id', idList(pathValue(event, 'infoIds'), '登录日志ID')))
        } else if (kind === 'login-unlock') {
          title = '账户解锁'
          const userName = requiredText(pathValue(event, 'userName'), '用户名', 64)
          await getGarnet().del(`pwd_err_cnt:${userName}`)
          result = apiSuccess()
        } else if (kind === 'oper-delete' || kind === 'oper-clean') {
          title = '操作日志'
          result = kind === 'oper-clean'
            ? javaAjax(await cleanRows(connection, 'sys_oper_log'))
            : javaAjax(await deleteRows(connection, 'sys_oper_log', 'oper_id', idList(pathValue(event, 'operIds'), '操作日志ID')))
        } else if (kind === 'joblog-delete' || kind === 'joblog-clean') {
          title = '调度日志'
          result = kind === 'joblog-clean'
            ? javaAjax(await cleanRows(connection, 'sys_job_log'))
            : javaAjax(await deleteRows(connection, 'sys_job_log', 'job_log_id', idList(pathValue(event, 'jobLogIds'), '调度日志ID')))
        } else if (kind === 'job-add' || kind === 'job-edit') {
          title = '定时任务'
          businessType = kind === 'job-add' ? 1 : 2
          result = javaAjax(await writeJob(connection, session, body, kind === 'job-edit'))
        } else if (kind === 'job-status') {
          title = '定时任务'
          const jobId = Number(body.jobId)
          if (!Number.isSafeInteger(jobId) || jobId <= 0) writeFail('任务ID不符合规范')
          const status = ['0', '1'].includes(text(body.status)) ? text(body.status) : writeFail('任务状态不符合规范')
          const [update] = await connection.query(mysqlQueryOptions('UPDATE sys_job SET status = ?, update_by = ?, update_time = NOW() WHERE job_id = ?'), [status, session.user.userName, jobId])
          result = javaAjax(affectedRows(update))
          // Nitro已迁移任务：开关同时写 sys_config（插件只认它，不读 sys_job.status）
          try {
            const job = await queryOne(connection, 'SELECT job_name, invoke_target FROM sys_job WHERE job_id = ?', [jobId])
            const target = text(job?.invoke_target)
            const { NITRO_JOBS } = await import('./nitro-jobs/registry')
            const def = NITRO_JOBS.find((j) => j.nitroTarget === target || j.oldTarget === target)
            const extra: Record<string, string> = { 'Nitro.productionOrderClose()': 'kingdee.moAutoClose' }
            const configKey = def?.configKey || extra[target] || ''
            if (configKey) {
              const flag = status === '0' ? '1' : '0'
              const [cfg] = await connection.query(mysqlQueryOptions('SELECT config_id FROM sys_config WHERE config_key = ? LIMIT 1'), [configKey])
              if ((cfg as any[]).length) {
                await connection.query(mysqlQueryOptions('UPDATE sys_config SET config_value = ?, update_by = ?, update_time = NOW() WHERE config_key = ?'), [flag, session.user.userName, configKey])
              } else {
                await connection.query(mysqlQueryOptions(`INSERT INTO sys_config (config_name, config_key, config_value, config_type, create_by, create_time, remark)
                  VALUES (?, ?, ?, 'Y', ?, NOW(), ?)`), [`定时任务开关：${text(job?.job_name) || target}`, configKey, flag, session.user.userName, `由定时任务${text(job?.job_name) || jobId}开关同步`])
              }
            }
          } catch {
            // sys_config 同步失败不影响主流程（插件默认关闭，安全）
          }
        } else if (kind === 'job-run') {
          title = '定时任务'
          const jobId = Number(body.jobId)
          const job = await queryOne(connection, 'SELECT job_id, status, job_name, invoke_target FROM sys_job WHERE job_id = ?', [jobId])
          if (!job) result = apiError('任务不存在或已过期！')
          else {
            // Nitro 已迁移任务：“执行一次”改为 dry-run 预览（只看不写），真写走各业务接口
            const { NITRO_JOBS } = await import('./nitro-jobs/registry')
            const target = text((job as any)?.invoke_target)
            const def = NITRO_JOBS.find((j) => j.nitroTarget === target || j.oldTarget === target)
            if (!def) {
              result = apiError('Nitro 定时任务执行器不支持直接执行该调用目标，请使用对应业务接口', 409)
            } else {
              try {
                const preview = await def.run(true)
                result = apiSuccess({ summary: preview.summary, count: preview.count ?? null, dryRun: true })
              } catch (error) {
                result = apiError(`预览失败：${error instanceof Error ? error.message : String(error)}`.slice(0, 300))
              }
            }
          }
        } else {
          title = '定时任务'
          const ids = idList(pathValue(event, 'jobIds'), '任务ID')
          result = apiSuccess(undefined, (await deleteRows(connection, 'sys_job', 'job_id', ids)) > 0 ? '操作成功' : '操作失败')
        }
        await insertOperationLog(event, connection, session, title, businessType, { ...body, requestId: requestKey }, result)
        return result
      },
      '监控管理写入失败',
    )
  }
}
