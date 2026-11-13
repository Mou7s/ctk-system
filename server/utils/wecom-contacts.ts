import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'

export type WecomContact = {
  userid: string
  name: string | null
  dept: string | null
  position: string | null
  leaderDept: string | null
}

export type ExistingWecomContact = WecomContact & {
  status?: string | null
}

export type WecomContactConfig = {
  corpId: string
  corpSecret: string
  corpSecretContacts: string
}

export type WecomContactDiff = {
  added: WecomContact[]
  updated: Array<{
    userid: string
    before: ExistingWecomContact
    after: WecomContact
  }>
  unchanged: WecomContact[]
  missing: ExistingWecomContact[]
}

type FetchLike = typeof fetch

type WecomDepartment = {
  id: number
  parentId: number
  order: number
  name: string
}

const CONFIG_KEYS = ['wx.work.corpId', 'wx.work.corpSecret', 'wx.work.corpSecretContacts'] as const
const EMPTY_DEPLOYMENT_VALUE = '__SET_IN_DEPLOYMENT__'
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_LIMIT = 1_000

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value && value !== EMPTY_DEPLOYMENT_VALUE) return value
  }
  return ''
}

function usableConfigValue(value: unknown): string {
  const normalized = String(value || '').trim()
  return normalized === EMPTY_DEPLOYMENT_VALUE ? '' : normalized
}

function responseError(body: any, fallback: string): Error {
  const errcode = Number(body?.errcode ?? -1)
  const errmsg = String(body?.errmsg || fallback)
  return new Error(`${fallback}（errcode=${errcode}，errmsg=${errmsg}）`)
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike = fetch,
): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`企业微信接口 HTTP ${response.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

async function getAccessToken(corpId: string, secret: string, fetchImpl: FetchLike): Promise<string> {
  const query = new URLSearchParams({
    corpid: corpId,
    corpsecret: secret,
  })
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?${query.toString()}`,
    { method: 'GET' },
    fetchImpl,
  )
  if (Number(body?.errcode || 0) !== 0 || !body?.access_token) {
    throw responseError(body, '企业微信获取通讯录令牌失败')
  }
  return String(body.access_token)
}

async function getDepartments(token: string, fetchImpl: FetchLike): Promise<WecomDepartment[]> {
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${encodeURIComponent(token)}`,
    { method: 'GET' },
    fetchImpl,
  )
  if (Number(body?.errcode || 0) !== 0) throw responseError(body, '企业微信获取部门列表失败')
  const departments = Array.isArray(body?.department) ? body.department : []
  return departments
    .map((item: any): WecomDepartment | null => {
      const id = Number(item?.id)
      const parentId = Number(item?.parentid || item?.parentId || 0)
      const order = Number(item?.order || 0)
      const name = String(item?.name || '').trim()
      return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(parentId) && parentId >= 0 && name
        ? { id, parentId, order: Number.isFinite(order) ? order : 0, name }
        : null
    })
    .filter((item: WecomDepartment | null): item is WecomDepartment => Boolean(item))
    .sort((left, right) => left.parentId - right.parentId || left.order - right.order || left.id - right.id)
}

export async function fetchWecomDepartments(
  config: WecomContactConfig,
  fetchImpl: FetchLike = fetch,
): Promise<Array<{ id: number; parentId: number; order: number; name: string }>> {
  const appToken = await getAccessToken(config.corpId, config.corpSecret, fetchImpl)
  return getDepartments(appToken, fetchImpl)
}

async function getUserIds(token: string, fetchImpl: FetchLike): Promise<string[]> {
  const ids: string[] = []
  const seenCursors = new Set<string>()
  let cursor = ''

  while (true) {
    const body = await fetchJson(
      `https://qyapi.weixin.qq.com/cgi-bin/user/list_id?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cursor, limit: PAGE_LIMIT }),
      },
      fetchImpl,
    )
    if (Number(body?.errcode || 0) !== 0) throw responseError(body, '企业微信获取成员 ID 列表失败')

    const page = Array.isArray(body?.dept_user)
      ? body.dept_user
      : Array.isArray(body?.userlist)
        ? body.userlist
        : Array.isArray(body?.user_id_list)
          ? body.user_id_list.map((userid: unknown) => ({ userid }))
          : []
    for (const item of page) {
      const userid = String(item?.userid || '').trim()
      if (userid && !ids.includes(userid)) ids.push(userid)
    }

    const nextCursor = String(body?.next_cursor || '').trim()
    if (!nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return ids
}

function departmentText(value: unknown, departments: Map<number, string>): string | null {
  const ids = Array.isArray(value) ? value : []
  const names = ids
    .map((item) => Number(item))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .map((id) => departments.get(id) || String(id))
    .filter(Boolean)
  return names.length ? [...new Set(names)].join('、') : null
}

function leaderDepartmentText(
  departmentValue: unknown,
  leaderValue: unknown,
  departments: Map<number, string>,
): string | null {
  const departmentIds = Array.isArray(departmentValue) ? departmentValue : []
  const leaderFlags = Array.isArray(leaderValue) ? leaderValue : []
  const leaderIds = departmentIds.filter((_, index) => Number(leaderFlags[index]) === 1)
  return departmentText(leaderIds, departments)
}

async function getUser(
  token: string,
  userid: string,
  departments: Map<number, string>,
  fetchImpl: FetchLike,
): Promise<WecomContact> {
  const body = await fetchJson(
    `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(token)}&userid=${encodeURIComponent(userid)}`,
    { method: 'GET' },
    fetchImpl,
  )
  if (Number(body?.errcode || 0) !== 0) throw responseError(body, `企业微信获取成员 ${userid} 失败`)
  return {
    userid: String(body?.userid || userid).trim(),
    name: String(body?.name || '').trim() || null,
    dept: departmentText(body?.department, departments),
    position: String(body?.position || '').trim() || null,
    leaderDept: leaderDepartmentText(body?.department, body?.is_leader_in_dept, departments),
  }
}

export async function loadWecomContactConfig(pool: Pool = getMysqlPool()): Promise<WecomContactConfig> {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT config_key, config_value
    FROM sys_config
    WHERE config_key IN (${CONFIG_KEYS.map(() => '?').join(', ')})
  `), [...CONFIG_KEYS])
  const values = new Map(rows.map((row) => [String(row.config_key), usableConfigValue(row.config_value)]))
  const corpId = values.get('wx.work.corpId') || envValue('NUXT_WECOM_CORP_ID', 'WX_WORK_CORP_ID')
  const corpSecret = values.get('wx.work.corpSecret') || envValue('NUXT_WECOM_CORP_SECRET', 'WX_WORK_CORP_SECRET')
  const corpSecretContacts = values.get('wx.work.corpSecretContacts')
    || envValue('NUXT_WECOM_CORP_SECRET_CONTACTS', 'WX_WORK_CORP_SECRET_CONTACTS')
  if (!corpId || !corpSecret || !corpSecretContacts) {
    throw new Error('未配置企业微信 CorpID、应用 Secret 或通讯录 Secret')
  }
  return { corpId, corpSecret, corpSecretContacts }
}

export async function fetchWecomContacts(
  config: WecomContactConfig,
  fetchImpl: FetchLike = fetch,
): Promise<WecomContact[]> {
  const contactsToken = await getAccessToken(config.corpId, config.corpSecretContacts, fetchImpl)
  const appToken = await getAccessToken(config.corpId, config.corpSecret, fetchImpl)
  const departments = await getDepartments(appToken, fetchImpl)
  const departmentMap = new Map(departments.map((item) => [item.id, item.name]))
  const userids = await getUserIds(contactsToken, fetchImpl)
  const contacts: WecomContact[] = []

  for (const userid of userids) {
    contacts.push(await getUser(appToken, userid, departmentMap, fetchImpl))
  }
  return contacts
}

function sameContact(left: ExistingWecomContact, right: WecomContact): boolean {
  return left.name === right.name
    && left.dept === right.dept
    && left.position === right.position
    && left.leaderDept === right.leaderDept
}

export function diffWecomContacts(
  remote: WecomContact[],
  existing: ExistingWecomContact[],
): WecomContactDiff {
  const remoteById = new Map(remote.map((item) => [item.userid, item]))
  const existingById = new Map(existing.map((item) => [item.userid, item]))
  const added: WecomContact[] = []
  const updated: WecomContactDiff['updated'] = []
  const unchanged: WecomContact[] = []

  for (const contact of remote) {
    const before = existingById.get(contact.userid)
    if (!before || before.status !== 'active') {
      added.push(contact)
    } else if (sameContact(before, contact)) {
      unchanged.push(contact)
    } else {
      updated.push({ userid: contact.userid, before, after: contact })
    }
  }

  const missing = existing.filter((item) => item.status === 'active' && !remoteById.has(item.userid))
  return { added, updated, unchanged, missing }
}
