import { existsSync } from 'node:fs'
import path from 'node:path'
import type { H3Event } from 'h3'
import { getHeader, getQuery, getRequestURL, getRouterParam } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess } from './response'
import { camelizeRows, queryText, withOptionalReadSession } from './read'

interface LuckyActivityRow extends RowDataPacket {
  id: number | string
  title: string | null
  status: string | number | null
}

function firstHeader(event: H3Event, name: string): string {
  return String(getHeader(event, name)?.split(',')[0]?.trim() || '')
}

function requestBaseUrl(event: H3Event): string {
  const requestUrl = getRequestURL(event)
  const protocol = firstHeader(event, 'x-forwarded-proto') || requestUrl.protocol.replace(/:$/, '')
  const host = firstHeader(event, 'x-forwarded-host') || firstHeader(event, 'host') || requestUrl.host
  return `${protocol}://${host}`
}

function publicProfileUrl(value: string): string {
  const normalized = value.startsWith('/') ? value : `/${value}`
  if (normalized.startsWith('/prod-api/profile/')) return normalized
  if (normalized.startsWith('/profile/')) return `/prod-api${normalized}`
  if (normalized.startsWith('/upload/')) return `/prod-api/profile${normalized}`
  return normalized
}

function profileRelativePath(publicUrl: string): string {
  if (publicUrl.startsWith('/prod-api/profile/')) return publicUrl.slice('/prod-api/profile'.length)
  if (publicUrl.startsWith('/profile/')) return publicUrl.slice('/profile'.length)
  return ''
}

function profileResourceExists(publicUrl: string, profileRoot: string): boolean {
  const relativePath = profileRelativePath(publicUrl)
  if (!relativePath || !profileRoot) return false
  return existsSync(path.join(profileRoot, relativePath.replace(/^[/\\]+/, '')))
}

function resolveMpQrImageUrl(): string | null {
  const config = getNitroServerConfig()
  const configured = config.wxMpQrCodeUrl.trim()
  if (configured) {
    if (/^https?:\/\//i.test(configured)) return configured
    const publicUrl = publicProfileUrl(configured)
    if (profileResourceExists(publicUrl, config.profilePath)) return publicUrl
  }

  for (const candidate of [
    '/upload/lucky/mp-qrcode.png',
    '/upload/lucky/mp-qrcode.jpg',
    '/upload/lucky/mp-qrcode.jpeg',
    '/upload/lucky/mp-qrcode.webp',
  ]) {
    const publicUrl = `/prod-api/profile${candidate}`
    if (profileResourceExists(publicUrl, config.profilePath)) return publicUrl
  }
  return null
}

function oauthQrImageUrl(oauthEntryUrl: string): string {
  try {
    return `https://quickchart.io/qr?size=250&margin=1&text=${encodeURIComponent(oauthEntryUrl)}`
  } catch {
    return oauthEntryUrl
  }
}

export async function getLuckyScreenConfig(event: H3Event) {
  return withOptionalReadSession(event, 'LuckyPublicScreenConfig', async (_, pool) => {
    const activityId = Number(queryText((getQuery(event) as Record<string, unknown>).activityId))
    if (!Number.isSafeInteger(activityId) || activityId <= 0) {
      return apiError('参数不符合规范，不能进行查询', 500)
    }

    const [rows] = await pool.query<LuckyActivityRow[]>(
      mysqlQueryOptions('SELECT id, title, status FROM tk_lucky_activity WHERE id = ? LIMIT 1'),
      [activityId],
    )
    const activity = rows[0]
    if (!activity || String(activity.status) !== '0') {
      return apiError('抽奖活动不存在或已被禁用')
    }

    const qrImageUrl = resolveMpQrImageUrl()
    const oauthEntryUrl = `${requestBaseUrl(event)}/prod-api/tk_custom/lucky/public/loginByWx?activityId=${activityId}`
    const data: Record<string, unknown> = {
      activityId,
      activityTitle: activity.title,
      useMpQrCode: Boolean(qrImageUrl),
      qrImageUrl,
      oauthEntryUrl,
    }
    if (!qrImageUrl) data.oauthQrImageUrl = oauthQrImageUrl(oauthEntryUrl)
    return apiSuccess(data)
  }, '获取抽奖大屏配置失败')
}

function luckyId(event: H3Event): number | null {
  const value = Number(queryText(getRouterParam(event, 'id')))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function activitySelect() {
  return `
    SELECT id, title, description,
           DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s') AS start_time,
           DATE_FORMAT(end_time, '%Y-%m-%d %H:%i:%s') AS end_time,
           draw_limit, status, create_by,
           DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
           update_by,
           DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time,
           remark
    FROM tk_lucky_activity
    WHERE id = ?
    LIMIT 1`
}

export async function getLuckyActivityDetail(event: H3Event) {
  return withOptionalReadSession(event, 'LuckyPublicActivityDetail', async (_, pool) => {
    const id = luckyId(event)
    if (!id) return apiError('参数不符合规范，不能进行查询', 500)

    const [activityRows] = await pool.query<LuckyActivityRow[]>(activitySelect(), [id])
    const activity = activityRows[0]
    if (!activity || String(activity.status) !== '0') {
      return apiError('抽奖活动不存在或已被禁用')
    }

    const [prizeRows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT id, prize_name, prize_level, prize_type, prize_icon
      FROM tk_lucky_prize
      WHERE activity_id = ? AND status = '0'
      ORDER BY
        CASE
          WHEN prize_type = '2' OR prize_name LIKE '%谢谢%' THEN 3
          WHEN prize_type = '1' THEN 2
          ELSE 1
        END ASC,
        CASE prize_level
          WHEN '一等奖' THEN 1
          WHEN '二等奖' THEN 2
          WHEN '三等奖' THEN 3
          WHEN '四等奖' THEN 4
          WHEN '五等奖' THEN 5
          ELSE 6
        END ASC,
        id ASC`), [id])
    const prizes = prizeRows
      .filter((prize) => String(prize.prize_type) !== '1')
      .map((prize) => ({
        id: prize.id,
        prizeName: prize.prize_name,
        prizeLevel: prize.prize_level,
        prizeType: prize.prize_type,
        prizeIcon: prize.prize_icon,
      }))
    return apiSuccess({ activity: camelizeRows([activity])[0], prizes })
  }, '获取抽奖活动详情失败')
}

function maskWinnerName(value: unknown): string {
  const name = String(value || '')
  if (!name) return '粉丝*'
  return name.length > 1 ? `${name.slice(0, 1)}*` : name
}

function maskWinnerPhone(value: unknown): string {
  const phone = String(value || '')
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : '1**********'
}

export async function getLuckyRecentWinners(event: H3Event) {
  return withOptionalReadSession(event, 'LuckyPublicRecentWinners', async (_, pool) => {
    const query = getQuery(event) as Record<string, unknown>
    const activityIdText = queryText(query.activityId).trim()
    const activityId = Number(activityIdText)
    // Java binds Long directly and therefore accepts 0/negative IDs, returning
    // an empty successful list when no records match. Only reject missing or
    // non-integer values here so the public read contract stays compatible.
    if (!activityIdText || !Number.isSafeInteger(activityId)) {
      return apiError('参数不符合规范，不能进行查询', 500)
    }
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT user_name, user_phone, prize_name,
             DATE_FORMAT(draw_time, '%Y-%m-%d %H:%i:%s') AS draw_time
      FROM tk_lucky_record
      WHERE activity_id = ?
        AND prize_name IS NOT NULL
        AND prize_name != '谢谢参与'
        AND win_status != '0'
      ORDER BY draw_time DESC
      LIMIT 20`), [activityId])
    return apiSuccess(rows.map((row) => ({
      userName: maskWinnerName(row.user_name),
      userPhone: maskWinnerPhone(row.user_phone),
      prizeName: row.prize_name,
      drawTime: row.draw_time,
    })))
  }, '获取中奖记录失败')
}

export async function getLuckyMyPrizes(event: H3Event) {
  return withOptionalReadSession(event, 'LuckyPublicMyPrizes', async (_, pool) => {
    const query = getQuery(event) as Record<string, unknown>
    const activityIdText = queryText(query.activityId).trim()
    const activityId = Number(activityIdText)
    if (!activityIdText || !Number.isSafeInteger(activityId)) {
      return apiError('参数不符合规范，不能进行查询', 500)
    }

    // Keep Java's validation and LIKE semantics. The public mobile page sends
    // the phone number as entered, while Java only trims it for validation.
    const phone = queryText(query.phone)
    if (!phone.trim()) return apiError('手机号不能为空', 500)

    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT NULL AS create_by,
             NULL AS create_time,
             update_by,
             NULL AS update_time,
             NULL AS remark,
             id, activity_id, user_phone, user_name, user_company, user_job,
             openid, prize_id, prize_name, win_status, redeem_code,
             DATE_FORMAT(draw_time, '%Y-%m-%d %H:%i:%s') AS draw_time,
             DATE_FORMAT(redeem_time, '%Y-%m-%d %H:%i:%s') AS redeem_time
      FROM tk_lucky_record
      WHERE activity_id = ?
        AND user_phone LIKE CONCAT('%', ?, '%')
      ORDER BY id DESC`), [activityId, phone])
    return apiSuccess(camelizeRows(rows))
  }, '获取我的中奖记录失败')
}
