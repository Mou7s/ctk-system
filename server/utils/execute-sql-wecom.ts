import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { errorMessage } from './response'
import { isDemoScope } from './data-scope'

type NotifyKind = 'ops' | 'cost'

export type ExecuteSqlNotification = {
  status: 'sent' | 'failed' | 'skipped'
  message?: string
}

type WecomConfig = {
  corpId: string
  corpSecret: string
  agentId: number
  recipients: string
}

type WecomTokenState = {
  token: string
  expiresAt: number
}

const CONFIG_KEYS = [
  'wx.work.corpId',
  'wx.work.corpSecret',
  'wx.work.agentId',
  'wx.work.opsNotifyRecipients',
  'wx.work.costOptimizeNotifyUserId',
] as const

const globalState = globalThis as typeof globalThis & {
  __executeSqlWecomToken?: WecomTokenState
}

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value) return value
  }
  return ''
}

async function readConfig(kind: NotifyKind): Promise<WecomConfig> {
  const [rows] = await getMysqlPool().query<{ config_key: string; config_value: string }[]>(mysqlQueryOptions(`
    SELECT config_key, config_value
    FROM sys_config
    WHERE config_key IN (${CONFIG_KEYS.map(() => '?').join(', ')})
  `), [...CONFIG_KEYS])
  const values = new Map(rows.map((row) => [String(row.config_key), String(row.config_value || '').trim()]))
  const recipients = kind === 'ops'
    ? values.get('wx.work.opsNotifyRecipients') || envValue('NUXT_WECOM_OPS_NOTIFY_RECIPIENTS', 'WX_WORK_OPS_NOTIFY_RECIPIENTS')
    : values.get('wx.work.costOptimizeNotifyUserId') || envValue('NUXT_WECOM_COST_NOTIFY_USER', 'WX_WORK_COST_NOTIFY_USER')
  return {
    corpId: values.get('wx.work.corpId') || envValue('NUXT_WECOM_CORP_ID', 'WX_WORK_CORP_ID'),
    corpSecret: values.get('wx.work.corpSecret') || envValue('NUXT_WECOM_CORP_SECRET', 'WX_WORK_CORP_SECRET'),
    agentId: Number(values.get('wx.work.agentId') || envValue('NUXT_WECOM_AGENT_ID', 'WX_WORK_AGENT_ID') || 0),
    recipients: String(recipients || '').split('|').map((item) => item.trim()).filter(Boolean).join('|'),
  }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<any> {
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

async function getAccessToken(config: WecomConfig): Promise<string> {
  const current = globalState.__executeSqlWecomToken
  if (current && current.expiresAt > Date.now() + 60_000) return current.token

  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.corpSecret)}`,
    { method: 'GET' },
  )
  if (Number(body?.errcode || 0) !== 0 || !body?.access_token) {
    throw new Error('企业微信获取访问令牌失败')
  }
  const expiresIn = Math.max(60, Number(body.expires_in || 7200))
  globalState.__executeSqlWecomToken = {
    token: String(body.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  }
  return String(body.access_token)
}

async function sendText(config: WecomConfig, content: string): Promise<void> {
  const token = await getAccessToken(config)
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: config.recipients,
        toparty: '',
        totag: '',
        msgtype: 'text',
        agentid: config.agentId,
        text: { content },
        safe: 0,
        enable_id_trans: 0,
        enable_duplicate_check: 0,
        duplicate_check_interval: 1800,
      }),
    },
  )
  if (Number(body?.errcode || 0) !== 0) throw new Error('企业微信发送消息失败')
}

export async function notifyExecuteSql(
  kind: NotifyKind,
  outcome: 'success' | 'failure',
  durationMs: number,
): Promise<ExecuteSqlNotification> {
  if (isDemoScope()) return { status: 'skipped', message: '演示账号不发送企业微信通知' }
  try {
    const config = await readConfig(kind)
    if (!config.corpId || !config.corpSecret || !config.agentId || !config.recipients) {
      return { status: 'skipped', message: '未配置企业微信通知' }
    }
    const seconds = Math.max(0, Math.round(durationMs / 1000))
    const title = kind === 'ops' ? '重建索引' : '优化成本数据'
    const content = outcome === 'success'
      ? `${title}成功！\n执行时间：${new Date().toLocaleString('zh-CN')}\n总耗时：${seconds}秒`
      : `${title}【失败】，请重试！\n执行时间：${new Date().toLocaleString('zh-CN')}\n总耗时：${seconds}秒`
    await sendText(config, content)
    return { status: 'sent' }
  } catch (error) {
    console.error(`[NitroExecuteSql:WeCom:${kind}]`, errorMessage(error, '企业微信通知失败'))
    return { status: 'failed', message: '企业微信通知失败' }
  }
}
