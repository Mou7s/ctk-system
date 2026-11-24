import { getAuthSession } from '../../../../utils/auth'
import { apiError, apiSuccess } from '../../../../utils/response'
import { getMysqlPool, mysqlQueryOptions } from '../../../../utils/mysql'

/**
 * POST /prod-api/tk_custom/kucun/warningJob
 * body: { enabled: boolean, hour: number, minute: number, receivers: string }
 * upsert sys_config：nitro.job.kucunWarningPush（开关）+ tk.kucun.warning.pushHour/pushMinute/receivers。
 */
const ENTRIES: Array<{ key: string; name: string; remark: string }> = [
  { key: 'nitro.job.kucunWarningPush', name: '金蝶库存预警每日推送开关', remark: '112 每日自动推送金蝶库存预警Excel；1=开 0=关' },
  { key: 'tk.kucun.warning.pushHour', name: '金蝶库存预警播报时间-时', remark: '每日播报小时（0-23）' },
  { key: 'tk.kucun.warning.pushMinute', name: '金蝶库存预警播报时间-分', remark: '每日播报分钟（0-59）' },
  { key: 'tk.kucun.warning.receivers', name: '金蝶库存预警接收人', remark: '企业微信userid，逗号分隔' },
]

export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event)
  if (!session) return apiError('登录状态已过期', 401)

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
  const enabled = body.enabled === true || body.enabled === 'true' || body.enabled === 1 || body.enabled === '1'
  const hour = Math.min(Math.max(Number(body.hour ?? 8) || 0, 0), 23)
  const minute = Math.min(Math.max(Number(body.minute ?? 0) || 0, 0), 59)
  const receivers = String(body.receivers ?? '')
    .split(/[,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',')
  if (enabled && !receivers) return apiError('开启定时播报时必须选择至少一个接收人', 400)

  const values: Record<string, string> = {
    'nitro.job.kucunWarningPush': enabled ? '1' : '0',
    'tk.kucun.warning.pushHour': String(hour),
    'tk.kucun.warning.pushMinute': String(minute),
    'tk.kucun.warning.receivers': receivers,
  }

  const pool = getMysqlPool()
  for (const entry of ENTRIES) {
    const configValue = values[entry.key]!
    const [result] = await pool.query<any>(
      mysqlQueryOptions('UPDATE sys_config SET config_value = ?, update_by = ?, update_time = NOW() WHERE config_key = ?'),
      [configValue, session.userName, entry.key],
    )
    const affected = Number((result as any)?.affectedRows ?? 0)
    if (!affected) {
      await pool.query(
        mysqlQueryOptions(
          'INSERT INTO sys_config (config_name, config_key, config_value, config_type, create_by, create_time, remark) VALUES (?, ?, ?, ?, ?, NOW(), ?)',
        ),
        [entry.name, entry.key, configValue, 'Y', session.userName, entry.remark],
      )
    }
  }
  return apiSuccess({ enabled, hour, minute, receivers })
})
