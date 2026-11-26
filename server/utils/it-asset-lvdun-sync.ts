import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { loadSsh2 } from './lazy-deps'
import { hasPermission, type AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess } from './response'
import { withReadSession } from './read'
import { getNitroServerConfig } from './runtime'
import {
  bodyOf,
  insertOperationLog,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'
import { formatItAssetNoFromSeq, normalizeItAssetDept } from './it-asset-read'

function displayName(session: AuthSession): string {
  return text(session.user.nickName) || session.userName
}

function nullableLimitedText(value: unknown, max: number): string | null {
  const t = text(value)
  if (!t) return null
  return t.slice(0, max)
}

function requestId(event: H3Event, body: Record<string, unknown> = {}): string {
  const headerKey = (event as any).headers ? String((event as any).headers['idempotency-key'] || '') : ''
  return headerKey || text(body.requestId) || crypto.randomUUID()
}

const SYNC_PERMS = ['tk_custom:itAsset:edit', 'tk_custom:itAsset:import']
const IGNORED_LVDUN_NAMES = new Set(['CVTOUCH-597', 'CVTOUCH-041'])
const SPECIAL_DEVICE_KEYWORDS = [
  '服务器',
  '扫描仪',
  '显微镜',
  '门岗',
  '培训室',
  '公用电脑',
  '测试机',
  '推拉力',
  '打印机',
  '投影',
]
const DEPT_ALIAS_MAP: Record<string, string> = {
  国内部: '国内销售部',
  国际部: '国际销售部',
  国际一部: '国际销售部',
  国际二部: '国际销售部',
  物控部: '物控',
  物控: '物控',
  研发中心工程部: '工程部',
  工程研发部: '工程部',
  总经办: '总经办',
  财务部: '财务部',
  人力资源部: '人力资源部',
  品质部: '品质部',
  焊线部: '焊线部',
  固晶部: '固晶二部',
  固晶二部: '固晶二部',
  测试分选: '测试分选',
  塑封部: '塑封部',
  玻封部: '玻封部',
  终端事业部: '终端事业部',
  OEM事业部: 'OEM事业部',
  国内跟单组: '国内跟单组',
  行政部: '行政部',
}

const GB18030_DECODER = new TextDecoder('gb18030')

export interface TrDbFieldSpec {
  name: string | null
  type: 1 | 3
  size: number
}

export interface LvDunGroup {
  id: number
  name: string
  pid: number
}

export interface LvDunComputer {
  id: number
  name: string
  ip: string
  mac: string
  nick: string
  gid: number
}

export interface LvDunLastInfo {
  id: number
  lot: string
}

export interface LvDunModuleEx {
  id: number
  ld: number
  dk: number
  au: number
}

export interface LvDunSnapshot {
  groups: LvDunGroup[]
  comps: LvDunComputer[]
  clast: LvDunLastInfo[]
  mce: LvDunModuleEx[]
  hw: Record<string, Record<string, Array<{ r: number; v: string }>>>
}

export interface WxEmployeeRow {
  userid: string
  name: string
  dept: string | null
  status: string
}

export interface ExistingItAssetRow {
  id: number
  asset_no: string
  asset_name: string
  device_type: string
  brand: string | null
  model: string | null
  use_dept: string | null
  user_userid: string | null
  user_name: string | null
  status: string
  ip_address: string | null
  mac_address: string | null
  lvdun_id?: number | null
  print_count: number
  remark: string | null
}

export interface LvDunSyncUpdateItem {
  assetId: number
  assetNo: string
  assetName: string
  brand: string
  model: string
  ipAddress: string
  macAddress: string
  lvdunId: number
  lvdunNick: string
  lvdunGroup: string
  oldUserName: string
  oldUserUserid: string
  oldUseDept: string
  newUserName: string
  newUserUserid: string
  newUseDept: string
  printCount: number
}

export interface LvDunSyncDisabledItem {
  assetId: number
  assetNo: string
  assetName: string
  userName: string
  useDept: string
  ipAddress: string
  lvdunId: number
  lvdunNick: string
  lastOnline: string
  printCount: number
}

export interface LvDunSyncInsertItem {
  lvdunId: number
  lvdunNick: string
  lvdunGroup: string
  assetName: string
  deviceType: string
  brand: string
  model: string
  serialNo: string
  useDept: string
  userUserid: string
  userName: string
  cpuSpec: string
  memorySpec: string
  diskSpec: string
  osVersion: string
  ipAddress: string
  macAddress: string
  remark: string
}

export function decodeTrDb<T extends Record<string, unknown>>(
  raw: Buffer | Uint8Array,
  schema: TrDbFieldSpec[],
): T[] {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  const recSize = 8 + schema.reduce((sum, f) => sum + f.size, 0)
  const rows: T[] = []
  for (let off = 0; off + recSize <= buf.length; off += recSize) {
    const magic = buf.readUInt32LE(off)
    const flag = buf.readUInt32LE(off + 4)
    if (magic !== 0x7e7e7e7e || flag !== 0) continue
    let pos = off + 8
    const row: Record<string, unknown> = {}
    for (const field of schema) {
      if (field.name) {
        if (field.type === 1) {
          row[field.name] = buf.readInt32LE(pos)
        } else {
          let end = pos
          const limit = pos + field.size
          while (end < limit && buf[end] !== 0) end += 1
          row[field.name] = GB18030_DECODER.decode(buf.subarray(pos, end)).trim()
        }
      }
      pos += field.size
    }
    rows.push(row as T)
  }
  return rows
}

export function normalizeMac(value: unknown): string {
  const hex = String(value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12 || hex === '000000000000' || hex === 'FFFFFFFFFFFF') return ''
  return hex.match(/.{2}/g)!.join(':')
}

export function cleanLvDunDept(groupName: string, parentName = ''): string {
  const strip = (s: string) =>
    String(s ?? '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim()
  const raw = strip(groupName)
  if (!raw || raw.toLowerCase() === 'default' || raw === '未分组') {
    const p = strip(parentName)
    return (p && p.toLowerCase() !== 'default' ? (DEPT_ALIAS_MAP[p] || p) : '')
  }
  return DEPT_ALIAS_MAP[raw] || raw
}

export function extractPersonCandidate(nick: string): string {
  let s = String(nick ?? '').trim()
  if (!s) return ''
  if (/^(PC-|MS-|WIN-|DESKTOP-|LAPTOP-|\d{6,})/i.test(s)) return ''
  s = s.replace(/[（(][^）)]*[）)]/g, '').trim()
  s = s.replace(/[-_\s]+(笔记本|台式机|旧|新|电脑|固一|固二|焊线|测试|车间|备用).*$/i, '').trim()
  s = s.replace(/\d+$/, '').trim()
  if (!s || SPECIAL_DEVICE_KEYWORDS.some((kw) => s.includes(kw))) return ''
  return /^[\u4e00-\u9fa5]{2,4}$/.test(s) ? s : ''
}

export function isHostnameNick(nick: string): boolean {
  const trimmed = String(nick ?? '').trim()
  if (!trimmed) return true
  return /^(PC-|MS-|WIN-|DESKTOP-|LAPTOP-|\d{6,})/i.test(trimmed)
}

export function isSpecialOrHostnameNick(
  nick: string,
  existingAssetName = '',
  existingDeviceType = '',
): boolean {
  const trimmed = String(nick ?? '').trim()
  if (isHostnameNick(trimmed)) return true
  if (existingDeviceType === 'server') return true
  if (existingAssetName && trimmed === existingAssetName.trim()) return true
  return false
}

export function resolveLvDunOwner(
  rawNick: string,
  groupName: string,
  parentGroupName: string,
  wxByName: Map<string, WxEmployeeRow[]>,
  existingAssetName = '',
  existingDeviceType = '',
): { userUserid: string; userName: string; useDept: string } {
  const deptFromLv = cleanLvDunDept(groupName, parentGroupName)
  const trimmedNick = String(rawNick ?? '').trim()
  const personCand = extractPersonCandidate(trimmedNick)
  const allMatches = personCand ? (wxByName.get(personCand) || []) : []
  const activeMatches = allMatches.filter((emp) => emp.status === 'active')
  const sameDeptActive = deptFromLv
    ? activeMatches.filter((emp) => normalizeItAssetDept(emp.dept) === deptFromLv)
    : []
  const sameDeptInactive = deptFromLv
    ? allMatches.filter((emp) => emp.status !== 'active' && normalizeItAssetDept(emp.dept) === deptFromLv)
    : []

  let matchedEmp: WxEmployeeRow | null = null
  if (sameDeptActive.length === 1) {
    matchedEmp = sameDeptActive[0]!
  } else if (sameDeptInactive.length > 0) {
    // 绿盾所在部门存在同名离职员工（如终端事业部杨钊已离职，而固晶二部另有在职杨钊），禁止跨部门误绑
    matchedEmp = null
  } else if (activeMatches.length === 1) {
    matchedEmp = activeMatches[0]!
  }

  if (matchedEmp) {
    return {
      userUserid: String(matchedEmp.userid || '').trim(),
      userName: String(matchedEmp.name || '').trim(),
      useDept: normalizeItAssetDept(matchedEmp.dept) || deptFromLv,
    }
  }

  if (isSpecialOrHostnameNick(trimmedNick, existingAssetName, existingDeviceType)) {
    return { userUserid: '', userName: '', useDept: deptFromLv }
  }

  // 非企微在职人名（例如「扫描仪」「焊线-推拉力」「包装1/2/3」「外发电镀」「新外贸总监」或离职同名），原样保留完整绿盾名称不清空
  return {
    userUserid: '',
    userName: trimmedNick.slice(0, 64),
    useDept: deptFromLv,
  }
}

function parseLvDunIdFromRemark(remark: string | null | undefined): number | null {
  const m = String(remark ?? '').match(/绿盾ID:\s*(\d+)/)
  if (!m) return null
  const id = Number(m[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function resolveExistingLvDunId(asset: Pick<ExistingItAssetRow, 'lvdun_id' | 'remark'>): number | null {
  const direct = Number(asset.lvdun_id)
  if (Number.isSafeInteger(direct) && direct > 0) return direct
  return parseLvDunIdFromRemark(asset.remark)
}

function hwFirst(bag: Record<string, Array<{ r: number; v: string }>> | undefined, propId: number): string {
  const items = bag?.[String(propId)]
  if (!Array.isArray(items) || !items.length) return ''
  return String(items[0]?.v || '').trim()
}

function cleanVendorBrand(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s || /to be filled|default string|o\.e\.m|system manufacturer/i.test(s)) return ''
  const upper = s.toUpperCase()
  if (upper.includes('ASUS') || upper.includes('ASUSTEK')) return '华硕'
  if (upper.includes('LENOVO')) return '联想'
  if (upper.includes('DELL')) return '戴尔'
  if (upper.includes('HP') || upper.includes('HEWLETT')) return '惠普'
  if (upper.includes('HUAWEI')) return '华为'
  if (upper.includes('XIAOMI') || upper.includes('TIMI')) return '小米'
  if (upper.includes('APPLE')) return '苹果'
  if (upper.includes('MICRO-STAR') || upper.includes('MSI')) return '微星'
  if (upper.includes('GIGABYTE')) return '技嘉'
  if (upper.includes('ONDA')) return '昂达'
  if (upper.includes('COLORFUL')) return '七彩虹'
  return s.slice(0, 64)
}

function cleanModel(sysModel: string, boardModel: string): string {
  for (const cand of [sysModel, boardModel]) {
    const s = String(cand ?? '').trim()
    if (s && !/to be filled|default string|system product name|all series|o\.e\.m/i.test(s)) {
      return s.slice(0, 120)
    }
  }
  return ''
}

function cleanSerial(sysSn: string, boardSn: string): string {
  for (const cand of [sysSn, boardSn]) {
    const s = String(cand ?? '').trim()
    if (s && !/to be filled|default string|system serial number|none|000000|mb-123456/i.test(s)) {
      return s.slice(0, 100)
    }
  }
  return ''
}

export function buildLvDunSyncPlan(
  snapshot: LvDunSnapshot,
  existingAssets: ExistingItAssetRow[],
  wxEmployees: WxEmployeeRow[],
  options: { activeDays?: number; now?: Date } = {},
): {
  updates: LvDunSyncUpdateItem[]
  disabled: LvDunSyncDisabledItem[]
  inserts: LvDunSyncInsertItem[]
  stats: {
    lvdunTotal: number
    lvdunAuthorized: number
    lvdunUnauthorized: number
    updatesCount: number
    disabledCount: number
    insertsCount: number
  }
} {
  const activeDays = options.activeDays ?? 90
  const now = options.now ?? new Date()

  const wxActiveByName = new Map<string, WxEmployeeRow[]>()
  for (const emp of wxEmployees) {
    if (emp.name) {
      const key = emp.name.trim()
      const list = wxActiveByName.get(key) || []
      list.push(emp)
      wxActiveByName.set(key, list)
    }
  }

  const groupById = new Map<number, LvDunGroup>()
  for (const g of snapshot.groups) groupById.set(g.id, g)

  const lastById = new Map<number, string>()
  for (const c of snapshot.clast) lastById.set(c.id, String(c.lot || '').trim())

  const mceById = new Map<number, LvDunModuleEx>()
  for (const m of snapshot.mce) mceById.set(m.id, m)

  const isAuthorized = (cid: number): boolean => {
    if (mceById.size === 0) return true
    const m = mceById.get(cid)
    return Boolean(m && (m.ld || m.dk || m.au))
  }

  const compById = new Map<number, LvDunComputer>()
  for (const c of snapshot.comps) compById.set(c.id, c)

  // Deduplicate authorized active computers by MAC for new-insert detection
  const authorizedComps: LvDunComputer[] = []
  let lvdunUnauthorized = 0
  for (const c of snapshot.comps) {
    if (isAuthorized(c.id)) {
      authorizedComps.push(c)
    } else {
      lvdunUnauthorized += 1
    }
  }

  const existingByCid = new Map<number, ExistingItAssetRow>()
  const existingByMac = new Map<string, ExistingItAssetRow>()
  const existingByIp = new Map<string, ExistingItAssetRow>()
  for (const asset of existingAssets) {
    const cid = resolveExistingLvDunId(asset)
    if (cid) existingByCid.set(cid, asset)
    const mac = normalizeMac(asset.mac_address)
    if (mac) existingByMac.set(mac, asset)
    const ip = String(asset.ip_address || '').trim()
    if (ip) existingByIp.set(ip, asset)
  }

  const updates: LvDunSyncUpdateItem[] = []
  const disabled: LvDunSyncDisabledItem[] = []
  const matchedAssetIds = new Set<number>()
  const matchedCids = new Set<number>()

  // 1. Check existing assets that came from LvDun (have lvdun_id or matching MAC)
  for (const asset of existingAssets) {
    const cidFromAsset = resolveExistingLvDunId(asset)
    const assetMac = normalizeMac(asset.mac_address)
    let comp: LvDunComputer | undefined
    if (cidFromAsset !== null) {
      comp = compById.get(cidFromAsset)
    } else if (assetMac) {
      comp = authorizedComps.find((c) => normalizeMac(c.mac) === assetMac)
    }

    if (cidFromAsset !== null && (!comp || !isAuthorized(cidFromAsset))) {
      disabled.push({
        assetId: asset.id,
        assetNo: asset.asset_no,
        assetName: asset.asset_name,
        userName: String(asset.user_name || '').trim(),
        useDept: String(asset.use_dept || '').trim(),
        ipAddress: String(asset.ip_address || '').trim(),
        lvdunId: cidFromAsset,
        lvdunNick: comp ? String(comp.nick || '').trim() : '',
        lastOnline: lastById.get(cidFromAsset) || '',
        printCount: Number(asset.print_count || 0),
      })
      matchedAssetIds.add(asset.id)
      continue
    }

    if (!comp || !isAuthorized(comp.id)) continue
    matchedAssetIds.add(asset.id)
    matchedCids.add(comp.id)

    const grp = groupById.get(comp.gid)
    const parentGrp = grp ? groupById.get(grp.pid) : undefined
    const resolved = resolveLvDunOwner(
      comp.nick,
      grp?.name || '',
      parentGrp?.name || '',
      wxActiveByName,
      asset.asset_name,
      asset.device_type,
    )

    const oldUserName = String(asset.user_name || '').trim()
    const oldUserUserid = String(asset.user_userid || '').trim()
    const oldUseDept = String(asset.use_dept || '').trim()

    // 若解析出的新使用人与新部门都为空，或与现有值完全一致，则不产生差异
    const targetUserName = resolved.userName
    const targetUserUserid = resolved.userUserid
    const targetUseDept = resolved.useDept || oldUseDept

    const userChanged = targetUserName !== oldUserName || targetUserUserid !== oldUserUserid
    const deptChanged = targetUseDept !== oldUseDept

    // 如果原本是公用机/未分配人名，且绿盾也没给有效人名，仅跳过无意义变更
    if (!userChanged && !deptChanged) continue

    updates.push({
      assetId: asset.id,
      assetNo: asset.asset_no,
      assetName: asset.asset_name,
      brand: String(asset.brand || '').trim(),
      model: String(asset.model || '').trim(),
      ipAddress: String(asset.ip_address || comp.ip || '').trim(),
      macAddress: assetMac || normalizeMac(comp.mac),
      lvdunId: comp.id,
      lvdunNick: String(comp.nick || '').trim(),
      lvdunGroup: grp?.name || '',
      oldUserName,
      oldUserUserid,
      oldUseDept,
      newUserName: targetUserName,
      newUserUserid: targetUserUserid,
      newUseDept: targetUseDept,
      printCount: Number(asset.print_count || 0),
    })
  }

  // 2. Detect brand-new authorized LvDun computers not yet in tk_it_asset
  const bestNewByMac = new Map<string, LvDunComputer>()
  for (const comp of authorizedComps) {
    if (matchedCids.has(comp.id)) continue
    if (IGNORED_LVDUN_NAMES.has(String(comp.name || '').trim().toUpperCase())) continue
    const mac = normalizeMac(comp.mac)
    if (!mac) continue
    if (existingByCid.has(comp.id) || existingByMac.has(mac)) continue
    const ip = String(comp.ip || '').trim()
    if (ip && existingByIp.has(ip)) continue

    const lot = lastById.get(comp.id) || ''
    if (activeDays > 0) {
      if (!lot) continue
      const parsedMs = Date.parse(lot.replace(' ', 'T'))
      if (!Number.isFinite(parsedMs)) continue
      const daysOffline = Math.floor((now.getTime() - parsedMs) / 86400000)
      if (daysOffline > activeDays) continue
    }

    const prev = bestNewByMac.get(mac)
    if (prev) {
      const prevLot = lastById.get(prev.id) || ''
      if (`${lot}#${comp.id}` <= `${prevLot}#${prev.id}`) continue
    }
    bestNewByMac.set(mac, comp)
  }

  const inserts: LvDunSyncInsertItem[] = []
  for (const [mac, comp] of bestNewByMac.entries()) {
    const grp = groupById.get(comp.gid)
    const parentGrp = grp ? groupById.get(grp.pid) : undefined
    const bag = snapshot.hw?.[String(comp.id)]
    const brand = cleanVendorBrand(hwFirst(bag, 20202))
    const model = cleanModel(hwFirst(bag, 40114), hwFirst(bag, 20205))
    const serialNo = cleanSerial(hwFirst(bag, 20301), hwFirst(bag, 20201))
    const cpuSpec = hwFirst(bag, 20101).replace(/\(R\)|\(TM\)|CPU\s+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 100)
    const memorySpec = hwFirst(bag, 20606).slice(0, 64)
    const osVersion = hwFirst(bag, 40101).replace(/^Microsoft\s+/i, '').trim().slice(0, 80)
    const typeCode = hwFirst(bag, 23001)
    const isLaptop = typeCode === '1' || /笔记本|laptop|macbook|thinkpad|book/i.test(`${comp.nick} ${model}`)
    const deviceType = isLaptop ? 'laptop' : 'desktop'
    const resolved = resolveLvDunOwner(comp.nick, grp?.name || '', parentGrp?.name || '', wxActiveByName)
    const assetName = isLaptop ? '办公笔记本' : '办公台式机'

    inserts.push({
      lvdunId: comp.id,
      lvdunNick: String(comp.nick || '').trim(),
      lvdunGroup: grp?.name || '',
      assetName,
      deviceType,
      brand,
      model,
      serialNo,
      useDept: resolved.useDept,
      userUserid: resolved.userUserid,
      userName: resolved.userName,
      cpuSpec,
      memorySpec,
      diskSpec: '',
      osVersion,
      ipAddress: String(comp.ip || '').trim().slice(0, 64),
      macAddress: mac,
      remark: '',
    })
  }

  return {
    updates,
    disabled,
    inserts,
    stats: {
      lvdunTotal: snapshot.comps.length,
      lvdunAuthorized: authorizedComps.length,
      lvdunUnauthorized,
      updatesCount: updates.length,
      disabledCount: disabled.length,
      insertsCount: inserts.length,
    },
  }
}

function resolveSshPrivateKeyPath(configuredPath: string): string {
  const candidates = [
    configuredPath,
    '/data/ssh/lvdun_id_ed25519',
    join(homedir(), '.ssh', 'id_ed25519'),
    join(homedir(), '.ssh', 'id_rsa'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('未找到连接绿盾服务器的 SSH 私钥，请检查 NUXT_LVDUN_SSH_KEY_PATH 或 /data/ssh 挂载')
}

const LVDUN_FETCH_PS_SCRIPT = `
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$d0=(Get-ChildItem D:\\ -Dir|?{Test-Path "$($_.FullName)\\soft\\LeaderEIS"}|select -First 1).FullName
$sv=(Get-ChildItem "$d0\\soft\\LeaderEIS" -Dir|?{Test-Path "$($_.FullName)\\LdFileEngine.exe"}|select -First 1).FullName
$en=(Get-ChildItem $sv -Dir|?{Test-Path "$($_.FullName)\\LdServer.exe"}|select -First 1).FullName
$dc=(Get-ChildItem $sv -Dir|?{Test-Path "$($_.FullName)\\LdData.exe"}|select -First 1).FullName
$rp="$en\\Repository\\2001-01-01"
$kp=@(20101,20201,20202,20205,20301,20606,23001,40101,40114)
$hw=@{}
$g=[Text.Encoding]::GetEncoding(936)
foreach($f in (Get-ChildItem "$dc\\Repository\\2001-01-01\\assetinfo" -Filter "assetinfo_*.db")){
 if($f.BaseName -match '(\\d+)'){
  $cid=$Matches[1];$b=[IO.File]::ReadAllBytes($f.FullName);$bag=@{}
  for($i=0;$i -lt [int]($b.Length/124);$i++){
   $of=$i*124;if([BitConverter]::ToInt32($b,$of+4) -ne 0){continue}
   $pi=[BitConverter]::ToInt32($b,$of+12);if($kp -notcontains $pi){continue}
   $rn=[BitConverter]::ToInt32($b,$of+20);$q=$of+24;$l=0;while($l-lt 100-and $b[$q+$l]-ne 0){$l++}
   $v=$g.GetString($b,$q,$l).Trim();if(-not $v){continue}
   $k="$pi";if(-not $bag.ContainsKey($k)){$bag[$k]=[Collections.Generic.List[object]]::new()}
   $bag[$k].Add(@{r=$rn;v=$v})
  }
  $hw[$cid]=$bag
 }
}
@{
  gr=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\\GroupInfo.db"))
  cp=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\\ComputerInfo.db"))
  cl=[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\\Computer_LastInfo.db"))
  mc=if(Test-Path "$rp\\module_computerex.db"){[Convert]::ToBase64String([IO.File]::ReadAllBytes("$rp\\module_computerex.db"))}else{""}
  hw=$hw
}|ConvertTo-Json -Depth 6 -Compress
`.trim()

export async function fetchLvDunSnapshotViaSsh(): Promise<LvDunSnapshot> {
  const cfg = getNitroServerConfig()
  const keyPath = resolveSshPrivateKeyPath(cfg.lvdunSshKeyPath)
  const privateKey = readFileSync(keyPath)
  const encodedPs = Buffer.from(LVDUN_FETCH_PS_SCRIPT, 'utf16le').toString('base64')
  const remoteCmd = `powershell -NoProfile -EncodedCommand ${encodedPs}`

  const { Client } = await loadSsh2()
  const stdout = await new Promise<string>((resolve, reject) => {
    const conn = new Client()
    let out = ''
    let err = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      conn.end()
      reject(new Error('连接绿盾服务器超时（25 秒）'))
    }, 25000)

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      conn.end()
      if (error) reject(error)
      else resolve(out)
    }

    conn.on('ready', () => {
      conn.exec(remoteCmd, (execErr, stream) => {
        if (execErr) return finish(new Error(`绿盾远端命令启动失败: ${execErr.message}`))
        stream.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          err += chunk.toString('utf8')
        })
        stream.on('close', (code: number) => {
          if (code !== 0 && !out.includes('{')) {
            return finish(new Error(`采集绿盾数据失败 (exit=${code}): ${err.slice(0, 200)}`))
          }
          finish()
        })
      })
    })

    conn.on('error', (connErr) => {
      finish(new Error(`SSH 连接绿盾服务器 (${cfg.lvdunSshHost}) 失败: ${connErr.message}`))
    })

    conn.connect({
      host: cfg.lvdunSshHost,
      port: cfg.lvdunSshPort,
      username: cfg.lvdunSshUser,
      privateKey,
      readyTimeout: 12000,
    })
  })

  const jsonStart = stdout.indexOf('{')
  if (jsonStart < 0) {
    throw new Error('绿盾服务器未返回有效 JSON 数据')
  }
  const payload = JSON.parse(stdout.slice(jsonStart)) as {
    gr: string
    cp: string
    cl: string
    mc?: string
    hw?: Record<string, Record<string, Array<{ r: number; v: string }>>>
  }

  const groups = decodeTrDb<LvDunGroup>(Buffer.from(payload.gr, 'base64'), [
    { name: 'id', type: 1, size: 4 },
    { name: 'name', type: 3, size: 32 },
    { name: null, type: 3, size: 40 },
    { name: 'pid', type: 1, size: 4 },
    { name: null, type: 1, size: 4 },
    { name: null, type: 1, size: 4 },
  ])
  const comps = decodeTrDb<LvDunComputer>(Buffer.from(payload.cp, 'base64'), [
    { name: 'id', type: 1, size: 4 },
    { name: 'name', type: 3, size: 32 },
    { name: 'ip', type: 3, size: 15 },
    { name: 'mac', type: 3, size: 12 },
    { name: null, type: 3, size: 50 },
    { name: null, type: 3, size: 50 },
    { name: null, type: 1, size: 4 },
    { name: 'nick', type: 3, size: 50 },
    { name: null, type: 3, size: 16 },
    { name: null, type: 1, size: 4 },
    { name: null, type: 1, size: 4 },
    { name: null, type: 3, size: 50 },
    { name: null, type: 1, size: 4 },
    { name: 'gid', type: 1, size: 4 },
    { name: null, type: 1, size: 4 },
    { name: null, type: 1, size: 4 },
  ])
  const clast = decodeTrDb<LvDunLastInfo>(Buffer.from(payload.cl, 'base64'), [
    { name: 'id', type: 1, size: 4 },
    { name: 'lot', type: 3, size: 20 },
    { name: null, type: 3, size: 200 },
    { name: null, type: 1, size: 4 },
  ])
  const mce = payload.mc
    ? decodeTrDb<LvDunModuleEx>(Buffer.from(payload.mc, 'base64'), [
        { name: 'id', type: 1, size: 4 },
        { name: 'ld', type: 1, size: 4 },
        { name: 'dk', type: 1, size: 4 },
        { name: 'au', type: 1, size: 4 },
      ])
    : []

  return { groups, comps, clast, mce, hw: payload.hw || {} }
}

function hasAnySyncPerm(session: AuthSession): boolean {
  return SYNC_PERMS.some((perm) => hasPermission(session, perm))
}

async function generateNextAssetNoForSync(connection: PoolConnection): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>(
    mysqlQueryOptions(
      `SELECT asset_no FROM tk_it_asset
       WHERE asset_no REGEXP '^TK-PC-[0-9]+$'
       ORDER BY CAST(SUBSTRING(asset_no, 7) AS UNSIGNED) DESC
       LIMIT 1 FOR UPDATE`,
    ),
  )
  const lastNo = String(rows[0]?.asset_no || '')
  const matched = lastNo.match(/^TK-PC-(\d+)$/)
  let seq = matched ? Number(matched[1]) + 1 : 1
  while (seq < 999999) {
    const candidate = formatItAssetNoFromSeq(seq)
    const [conflict] = await connection.query<RowDataPacket[]>(
      mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE asset_no = ? LIMIT 1`),
      [candidate],
    )
    if (!conflict[0]) return candidate
    seq += 1
  }
  writeFail('自动生成资产编号失败', 500)
}

export async function previewItAssetLvDunSync(event: H3Event) {
  return withReadSession(event, 'ItAssetLvDunSyncPreview', async (session, pool) => {
    if (!hasAnySyncPerm(session)) return apiError('没有权限执行绿盾同步', 403)
    const [snapshot, [assetRows], [wxRows]] = await Promise.all([
      fetchLvDunSnapshotViaSsh(),
      pool.query<RowDataPacket[]>(
        mysqlQueryOptions(
          `SELECT id, asset_no, asset_name, device_type, brand, model, use_dept, user_userid, user_name, status, ip_address, mac_address, lvdun_id, print_count, remark
           FROM tk_it_asset ORDER BY asset_no ASC`,
        ),
      ),
      pool.query<RowDataPacket[]>(
        mysqlQueryOptions(`SELECT userid, name, dept, status FROM wxuser`),
      ),
    ])

    const plan = buildLvDunSyncPlan(
      snapshot,
      assetRows as unknown as ExistingItAssetRow[],
      wxRows as unknown as WxEmployeeRow[],
    )

    return apiSuccess({
      ...plan,
      fetchedAt: new Date().toISOString(),
    }, '绿盾差异采集成功')
  }, '采集绿盾数据失败')
}

export async function applyItAssetLvDunSync(event: H3Event) {
  const body = await bodyOf(event)
  return withIdempotentWriteSession(
    event,
    'ItAssetLvDunSyncApply',
    'tk_custom:itAsset:edit',
    requestId(event, body),
    body,
    async (session, connection, claim) => {
      const updates = Array.isArray(body.updates) ? body.updates : []
      const inserts = Array.isArray(body.inserts) ? body.inserts : []
      const disabledIds = Array.isArray(body.disabledIds)
        ? body.disabledIds.map((v: unknown) => Number(v)).filter((v: number) => Number.isSafeInteger(v) && v > 0)
        : []
      const disabledAction = String(body.disabledAction || 'delete') === 'idle' ? 'idle' : 'delete'

      if (!updates.length && !inserts.length && !disabledIds.length) {
        writeFail('请至少勾选一条需要同步的变更', 400)
      }

      const operator = displayName(session)
      let updatedCount = 0
      let insertedCount = 0
      let disabledCount = 0

      for (const item of updates) {
        const assetId = Number(item?.assetId)
        if (!Number.isSafeInteger(assetId) || assetId <= 0) continue
        const [existRows] = await connection.query<RowDataPacket[]>(
          mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE id = ? LIMIT 1`),
          [assetId],
        )
        if (!existRows[0]) continue

        const newUserName = nullableLimitedText(item?.newUserName, 64)
        const newUserUserid = nullableLimitedText(item?.newUserUserid, 64)
        const newUseDept = nullableLimitedText(item?.newUseDept, 100)
        const rawLvDunId = Number(item?.lvdunId)
        const lvdunId = Number.isSafeInteger(rawLvDunId) && rawLvDunId > 0 ? rawLvDunId : null

        const [res]: any = await connection.query(
          mysqlQueryOptions(`
            UPDATE tk_it_asset
            SET user_userid = ?,
                user_name = ?,
                use_dept = ?,
                lvdun_id = COALESCE(lvdun_id, ?),
                updated_by_id = ?,
                updated_by_name = ?
            WHERE id = ?
            LIMIT 1
          `),
          [newUserUserid, newUserName, newUseDept, lvdunId, session.userId, operator, assetId],
        )
        if (Number(res?.affectedRows || 0) > 0) updatedCount += 1
      }

      for (const item of inserts) {
        const assetName = nullableLimitedText(item?.assetName, 120)
        if (!assetName) continue
        const mac = normalizeMac(item?.macAddress)
        if (mac) {
          const [dup] = await connection.query<RowDataPacket[]>(
            mysqlQueryOptions(`SELECT id FROM tk_it_asset WHERE mac_address = ? LIMIT 1`),
            [mac],
          )
          if (dup[0]) continue
        }
        const assetNo = await generateNextAssetNoForSync(connection)
        const deviceType = String(item?.deviceType || 'desktop') === 'laptop' ? 'laptop' : 'desktop'
        const rawLvDunId = Number(item?.lvdunId)
        const lvdunId = Number.isSafeInteger(rawLvDunId) && rawLvDunId > 0 ? rawLvDunId : null
        await connection.query(
          mysqlQueryOptions(`
            INSERT INTO tk_it_asset (
              asset_no, asset_name, device_type, brand, model, serial_no,
              use_dept, user_userid, user_name, status,
              cpu_spec, memory_spec, disk_spec, os_version, ip_address, mac_address, lvdun_id,
              remark, created_by_id, created_by_name, updated_by_id, updated_by_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `),
          [
            assetNo,
            assetName,
            deviceType,
            nullableLimitedText(item?.brand, 64),
            nullableLimitedText(item?.model, 120),
            nullableLimitedText(item?.serialNo, 100),
            nullableLimitedText(item?.useDept, 100),
            nullableLimitedText(item?.userUserid, 64),
            nullableLimitedText(item?.userName, 64),
            nullableLimitedText(item?.cpuSpec, 100),
            nullableLimitedText(item?.memorySpec, 64),
            nullableLimitedText(item?.diskSpec, 64),
            nullableLimitedText(item?.osVersion, 80),
            nullableLimitedText(item?.ipAddress, 64),
            mac || null,
            lvdunId,
            nullableLimitedText(item?.remark, 500),
            session.userId,
            operator,
            session.userId,
            operator,
          ],
        )
        insertedCount += 1
      }

      if (disabledIds.length) {
        const placeholders = disabledIds.map(() => '?').join(', ')
        if (disabledAction === 'delete') {
          const [res]: any = await connection.query(
            mysqlQueryOptions(`DELETE FROM tk_it_asset WHERE id IN (${placeholders})`),
            disabledIds,
          )
          disabledCount = Number(res?.affectedRows || 0)
        } else {
          const [res]: any = await connection.query(
            mysqlQueryOptions(`
              UPDATE tk_it_asset
              SET status = 'idle',
                  updated_by_id = ?,
                  updated_by_name = ?,
                  remark = LEFT(CONCAT(IFNULL(remark, ''), CASE WHEN IFNULL(remark, '') = '' THEN '' ELSE ' | ' END, ?), 500)
              WHERE id IN (${placeholders})
            `),
            [session.userId, operator, `${today} 绿盾已禁用，同步标为闲置`, ...disabledIds],
          )
          disabledCount = Number(res?.affectedRows || 0)
        }
      }

      await insertOperationLog(event, connection, session, 'IT资产管理', 2, {
        action: 'lvdunSync',
        updatedCount,
        insertedCount,
        disabledCount,
        disabledAction,
        requestId: claim.requestId,
      })

      return apiSuccess(
        { updatedCount, insertedCount, disabledCount, disabledAction },
        `绿盾同步完成：更新 ${updatedCount} 台、新增 ${insertedCount} 台、${disabledAction === 'delete' ? '移除' : '置闲'} ${disabledCount} 台`,
      )
    },
    '执行绿盾同步失败',
  )
}
