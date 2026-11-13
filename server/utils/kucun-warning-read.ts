import { finishedInventoryOnly, finishedInventoryMaterials } from './inventory-visibility'
import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess, apiError } from './response'
import { queryText, withReadSession } from './read'

const WARNING_JOB_TARGET = 'TkTask.sendKucunWarningTask()'
const WARNING_RECEIVERS_KEY = 'tk.kucun.warning.receivers'
const DEFAULT_CRON = '0 0 9 * * ?'

function defaultJob() {
  return {
    status: '1',
    cronExpression: DEFAULT_CRON,
    hour: 9,
    minute: 0,
  }
}

function formatJavaTimestamp(value: unknown) {
  if (!(value instanceof Date)) return value

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value)
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}.${String(value.getMilliseconds()).padStart(3, '0')}+08:00`
}

function parseCronTime(cron: unknown) {
  const value = String(cron ?? '').trim()
  if (!value) return { hour: 9, minute: 0 }

  const parts = value.split(/\s+/)
  if (parts.length < 3) return { hour: 9, minute: 0 }

  const minute = Number.parseInt(parts[1], 10)
  const hour = Number.parseInt(parts[2], 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return { hour: 9, minute: 0 }
  return { hour, minute }
}

export async function queryKucunWarningSyncTime(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT sync_time FROM kucun_warning ORDER BY sync_time DESC LIMIT 1',
  ))
  return formatJavaTimestamp(rows[0]?.sync_time ?? null)
}

export async function queryKucunWarningWecomUsers(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    "SELECT userid, name, dept, position FROM wxuser WHERE status IS NULL OR status = 'active'",
  ))
  return rows.map((row) => ({
    createBy: null,
    createTime: null,
    userid: row.userid,
    name: row.name ?? null,
    dept: row.dept ?? null,
    position: row.position ?? null,
    sysUsername: null,
    updateBy: null,
    updateTime: null,
    remark: null,
  }))
}

export async function queryKucunWarningJob(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT status, cron_expression FROM sys_job WHERE invoke_target LIKE ? LIMIT 1',
  ), [`%${WARNING_JOB_TARGET}%`])

  const job = rows[0]
    ? (() => {
        const time = parseCronTime(rows[0].cron_expression)
        return {
          status: rows[0].status,
          cronExpression: rows[0].cron_expression,
          minute: time.minute,
          hour: time.hour,
        }
      })()
    : defaultJob()

  let receivers = ''
  try {
    const [configRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      'SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1',
    ), [WARNING_RECEIVERS_KEY])
    receivers = configRows[0]?.config_value ?? ''
  } catch {
    // Java ignores a config lookup failure and still returns the job shape.
  }

  return { ...job, receivers }
}

export async function queryKucunWarningRows(pool: Pool) {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT stock_org_code, stock_org_name, material_code, material_name, specification, unit,
           safe_stock, actual_total, safe_warning_enabled, warning_status, sync_time
    FROM kucun_warning
    ORDER BY CASE WHEN warning_status = '正常' THEN 1 ELSE 0 END, material_code`))
  return rows
}

export async function listKucunWarnings(event: H3Event) {
  return withReadSession(event, 'KucunWarnings', async (_, pool) => {
    const rows = await queryKucunWarningRows(pool)
    return apiSuccess(rows.map((row) => ({
      stockOrgCode: row.stock_org_code,
      stockOrgName: row.stock_org_name,
      materialCode: row.material_code,
      materialName: row.material_name,
      specification: row.specification,
      unit: row.unit,
      safeStock: row.safe_stock,
      actualTotal: row.actual_total,
      safeWarningEnabled: Boolean(Number(row.safe_warning_enabled || 0)),
      warningStatus: row.warning_status,
      syncTime: row.sync_time,
    })))
  }, '获取库存预警失败')
}

export async function getKucunDetail(event: H3Event) {
  return withReadSession(event, 'KucunDetail', async (session, pool) => {
    const id = queryText(getRouterParam(event, 'id'))
    if (!id) return apiError('库存记录ID不能为空', 400)
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT id, kd_billno, kd_wlbm, kd_wumc, kd_ggxh, kd_cangku_id, kd_cangku_name,
             kd_kuwei_id, kd_kuwei_name, kd_chuku_number, kd_chuku_time, sync_time, status
      FROM kucun WHERE id = ? LIMIT 1`), [id])
    const row = rows[0]
    if (row && finishedInventoryOnly(session) && !(await finishedInventoryMaterials()).includes(String(row.kd_wlbm))) return apiError('无权查看非成品库存', 403)
    return apiSuccess(row ? {
      id: row.id, kdBillno: row.kd_billno, kdWlbm: row.kd_wlbm, kdWumc: row.kd_wumc,
      kdGgxh: row.kd_ggxh, kdCangkuId: row.kd_cangku_id, kdCangkuName: row.kd_cangku_name,
      kdKuweiId: row.kd_kuwei_id, kdKuweiName: row.kd_kuwei_name,
      kdChukuNumber: row.kd_chuku_number, kdChukuTime: row.kd_chuku_time,
      syncTime: row.sync_time, status: row.status,
    } : null)
  }, '获取库存详情失败')
}
