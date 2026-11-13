import { getMysqlPool, mysqlQueryOptions } from '../mysql'
import { errorMessage } from '../response'
import { renderWarningWorkbookBuffer, warningExcelFileName } from '../kucun-warning-export'

/**
 * 112 金蝶库存上下限预警（原 Java 定时任务 sendKucunWarningTask）：
 * 读取本地 kucun_warning 快照 → 生成双 Sheet Excel →
 * 通过企业微信应用上传临时素材并逐个发给接收人。
 *
 * 配置（sys_config）：
 * - wx.work.corpId / wx.work.corpSecret / wx.work.agentId  企微应用凭证
 * - tk.kucun.warning.receivers                             接收人 userid（逗号分隔）
 */

type WecomConfig = {
  corpId: string
  corpSecret: string
  agentId: number
}

type TokenState = { token: string; expiresAt: number }

const globalState = globalThis as typeof globalThis & {
  __kucunWarningWecomToken?: TokenState
}

const RECEIVE_TIMEOUT_MS = 15_000

async function fetchJson(url: string, init: RequestInit, timeoutMs = RECEIVE_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`企业微信 HTTP ${response.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

export async function readWecomConfig(): Promise<WecomConfig> {
  const [rows] = await getMysqlPool().query<{ config_key: string; config_value: string }[]>(
    mysqlQueryOptions('SELECT config_key, config_value FROM sys_config WHERE config_key IN (?, ?, ?)'),
    ['wx.work.corpId', 'wx.work.corpSecret', 'wx.work.agentId'],
  )
  const values = new Map(rows.map((row) => [String(row.config_key), String(row.config_value || '').trim()]))
  const corpId = values.get('wx.work.corpId') || ''
  const corpSecret = values.get('wx.work.corpSecret') || ''
  const agentId = Number(values.get('wx.work.agentId') || 0)
  if (!corpId || !corpSecret || !agentId) throw new Error('企业微信应用配置不完整（sys_config wx.work.*）')
  return { corpId, corpSecret, agentId }
}

async function getAccessToken(config: WecomConfig): Promise<string> {
  const current = globalState.__kucunWarningWecomToken
  if (current && current.expiresAt > Date.now() + 60_000) return current.token
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.corpSecret)}`,
    { method: 'GET' },
  )
  if (Number(body?.errcode || 0) !== 0 || !body?.access_token) {
    throw new Error(`企业微信获取令牌失败(${body?.errcode || '-'}): ${body?.errmsg || '无返回'}`)
  }
  const expiresIn = Math.max(60, Number(body.expires_in || 7200))
  globalState.__kucunWarningWecomToken = { token: String(body.access_token), expiresAt: Date.now() + expiresIn * 1000 }
  return String(body.access_token)
}

/** 读取 sys_config 的接收人 userid 列表（逗号/竖线分隔均支持）。 */
export async function readWarningReceivers(): Promise<string[]> {
  const [rows] = await getMysqlPool().query<{ config_value: string }[]>(
    mysqlQueryOptions('SELECT config_value FROM sys_config WHERE config_key = ? LIMIT 1'),
    ['tk.kucun.warning.receivers'],
  )
  const raw = String(rows[0]?.config_value || '')
  return raw.split(/[,|]/).map((item) => item.trim()).filter(Boolean)
}

/** 读取每日播报时间（sys_config tk.kucun.warning.pushHour/pushMinute，默认 08:00）。 */
export async function readWarningPushTime(): Promise<{ hour: number; minute: number }> {
  const [rows] = await getMysqlPool().query<{ config_key: string; config_value: string }[]>(
    mysqlQueryOptions('SELECT config_key, config_value FROM sys_config WHERE config_key IN (?, ?)'),
    ['tk.kucun.warning.pushHour', 'tk.kucun.warning.pushMinute'],
  )
  const values = new Map(rows.map((row) => [String(row.config_key), Number(row.config_value)]))
  const hour = Number.isFinite(values.get('tk.kucun.warning.pushHour')) ? Number(values.get('tk.kucun.warning.pushHour')) : 8
  const minute = Number.isFinite(values.get('tk.kucun.warning.pushMinute')) ? Number(values.get('tk.kucun.warning.pushMinute')) : 0
  return { hour: Math.min(Math.max(hour, 0), 23), minute: Math.min(Math.max(minute, 0), 59) }
}

/** 上传临时素材（file 类型，临时素材有效期 3 天）。 */
export async function uploadWarningExcelMedia(config: WecomConfig, buffer: Uint8Array, fileName: string): Promise<string> {
  const token = await getAccessToken(config)
  const form = new FormData()
  form.append(
    'media',
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  )
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let body: any
  try {
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=file`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    body = await response.json().catch(() => null)
  } finally {
    clearTimeout(timer)
  }
  if (Number(body?.errcode || 0) !== 0 || !body?.media_id) {
    throw new Error(`企业微信上传素材失败(${body?.errcode || '-'}): ${body?.errmsg || '无返回'}`)
  }
  return String(body.media_id)
}

export async function sendFileToUser(config: WecomConfig, userId: string, mediaId: string): Promise<void> {
  const token = await getAccessToken(config)
  const body = await fetchJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      touser: userId,
      msgtype: 'file',
      agentid: config.agentId,
      file: { media_id: mediaId },
      enable_duplicate_check: 0,
    }),
  })
  if (!body || Number(body.errcode) !== 0) {
    throw new Error(`发送给 ${userId} 失败(${body?.errcode || '-'}): ${body?.errmsg || '无返回'}`)
  }
  if (String(body?.invaliduser || '').split('|').includes(userId)) {
    throw new Error('企业微信接收人无效')
  }
}

export type KucunWarningPushResult = {
  ok: boolean
  sent: string[]
  failed: Array<{ userId: string; error: string }>
  belowCount: number
  totalCount: number
  skipped?: string
}

/** 真实发送：读快照 → 生成 Excel → 上传 → 逐个发送。快照为空或未配置接收人时跳过。 */
export async function runKucunWarningPush(manualReceivers?: string[]): Promise<KucunWarningPushResult> {
  const receivers = manualReceivers && manualReceivers.length ? manualReceivers : await readWarningReceivers()
  if (!receivers.length) {
    return { ok: false, sent: [], failed: [], belowCount: 0, totalCount: 0, skipped: '未配置接收人（sys_config tk.kucun.warning.receivers）' }
  }

  const [rows] = await getMysqlPool().query<Record<string, unknown>[]>(
    mysqlQueryOptions(`
      SELECT stock_org_code, stock_org_name, material_code, material_name, specification, unit,
             safe_stock, actual_total, warning_status
      FROM kucun_warning
      ORDER BY CASE WHEN warning_status = '正常' THEN 1 ELSE 0 END, material_code`),
  )
  const dbRows = rows as Array<Record<string, unknown>>
  if (!dbRows.length) {
    return { ok: false, sent: [], failed: [], belowCount: 0, totalCount: 0, skipped: '本地快照为空，请先在页面执行「从金蝶刷新」' }
  }

  const belowCount = dbRows.filter((row) => String(row.warning_status || '').includes('偏低')).length
  const buffer = renderWarningWorkbookBuffer(dbRows)
  const fileName = warningExcelFileName()

  const config = await readWecomConfig()
  const mediaId = await uploadWarningExcelMedia(config, buffer, fileName)

  const sent: string[] = []
  const failed: Array<{ userId: string; error: string }> = []
  for (const userId of receivers) {
    try {
      await sendFileToUser(config, userId, mediaId)
      sent.push(userId)
    } catch (error) {
      failed.push({ userId, error: errorMessage(error, '发送失败') })
    }
  }

  return {
    ok: failed.length === 0,
    sent,
    failed,
    belowCount,
    totalCount: dbRows.length,
  }
}
