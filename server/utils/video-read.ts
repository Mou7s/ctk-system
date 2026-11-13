import crypto from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { getHeader, getQuery, getRouterParam, readMultipartFormData, sendStream, setHeader, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { getGarnet } from './redis'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess, apiSuccessFields } from './response'
import { pageRequest, queryPage, queryText, withReadSession } from './read'
import { getAuthSession, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'

type Query = Record<string, unknown>

const VIDEO_COLUMNS = `
  id, title, category, description, original_name, storage_path, cover_path,
  content_type, size_bytes, duration_seconds, uploader_id, uploader_name,
  status, create_time, update_time
`

function formatDateTime(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') return value.includes('T') ? value.slice(0, 19).replace('T', ' ') : value
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return String(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function isAdmin(session: AuthSession): boolean {
  return session.userId === 1 || session.roles.includes('admin')
}

export function videoStorageRoot(): string {
  const configured = String(process.env.TK_VIDEO_STORAGE_PATH || process.env.NUXT_VIDEO_STORAGE_PATH || '').trim()
  if (configured) return resolve(configured)
  try {
    const profilePath = getNitroServerConfig().profilePath
    return resolve(profilePath, '..', 'video-private')
  } catch {
    return ''
  }
}

export function videoFileExists(relativePath: unknown): boolean {
  const root = videoStorageRoot()
  const relative = String(relativePath ?? '').trim()
  if (!root || !relative) return false
  const candidate = resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) return false
  return existsSync(candidate)
}

function safeVideoPath(relativePath: unknown): string | null {
  const root = videoStorageRoot()
  const relative = String(relativePath ?? '').trim().replaceAll('\\', '/')
  if (!root || !relative || relative.includes('\0') || relative.split('/').some((part) => part === '..')) return null
  const candidate = resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) return null
  return candidate
}

async function mediaToken(event: H3Event, id: number): Promise<boolean> {
  const token = queryText((getQuery(event) as Query).token)
  if (!token) return false
  const value = await getGarnet().get(`tk:video:play-token:${token}`)
  return value?.startsWith(`${id}:`) || false
}

export async function issueVideoPlayToken(event: H3Event) {
  return withReadSession(event, 'VideoPlayToken', async (session, pool: Pool) => {
    const id = Number(queryText(getRouterParam(event, 'id')))
    if (!Number.isSafeInteger(id) || id <= 0) return apiError('视频ID不符合规范')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${VIDEO_COLUMNS} FROM tk_video_library WHERE id = ? AND status = '0' LIMIT 1`), [id])
    const row = rows[0]
    if (!row) return apiError('视频不存在或已删除')
    const token = await issuePlayToken(row, session)
    if (!token) return apiError('视频文件不存在')
    return apiSuccess({ token, streamUrl: `/tk_custom/videoLibrary/${id}/stream?token=${token}`, ...(row.cover_path ? { coverUrl: `/tk_custom/videoLibrary/${id}/cover?token=${token}` } : {}) })
  }, '获取视频播放令牌失败')
}

async function mediaRow(event: H3Event, id: number) {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(`SELECT ${VIDEO_COLUMNS} FROM tk_video_library WHERE id = ? AND status = '0' LIMIT 1`), [id])
  return rows[0] || null
}

export async function streamVideo(event: H3Event, kind: 'stream' | 'cover') {
  const id = Number(queryText(getRouterParam(event, 'id')))
  if (!Number.isSafeInteger(id) || id <= 0 || !(await mediaToken(event, id))) return apiError('播放令牌无效或已过期', 401)
  const row = await mediaRow(event, id)
  if (!row) return apiError('视频不存在或已删除', 404)
  const path = safeVideoPath(kind === 'stream' ? row.storage_path : row.cover_path)
  if (!path || !existsSync(path)) return apiError('媒体文件不存在', 404)
  const size = statSync(path).size
  const range = getHeader(event, 'range') || ''
  let start = 0
  let end = Math.max(0, size - 1)
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range)
    if (!match || (!match[1] && !match[2])) return apiError('Range 请求不符合规范', 416)
    if (match[1]) start = Number(match[1])
    if (match[2]) end = Number(match[2])
    else if (!match[1]) start = Math.max(0, size - Number(match[2]))
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return apiError('Range 超出文件范围', 416)
    end = Math.min(end, size - 1)
    setHeader(event, 'content-range', `bytes ${start}-${end}/${size}`)
    event.node.res.statusCode = 206
  }
  setHeader(event, 'accept-ranges', 'bytes')
  setHeader(event, 'content-length', String(end - start + 1))
  setHeader(event, 'cache-control', 'private, max-age=60')
  setHeader(event, 'content-type', kind === 'stream' ? String(row.content_type || 'video/mp4') : 'image/jpeg')
  return sendStream(event, createReadStream(path, { start, end }))
}

function multipartText(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string): string {
  const part = (parts || []).find((item) => item.name === name && !item.filename)
  return part ? Buffer.from(part.data).toString('utf8').trim() : ''
}

export async function uploadVideo(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  const parts = await readMultipartFormData(event)
  const file = (parts || []).find((item) => item.name === 'file' && item.filename)
  const cover = (parts || []).find((item) => item.name === 'coverFile' && item.filename)
  const title = multipartText(parts, 'title')
  const category = multipartText(parts, 'category')
  const description = multipartText(parts, 'description')
  const durationRaw = multipartText(parts, 'durationSeconds')
  if (!file?.data?.length) return apiError('请选择 MP4 视频文件')
  if (!title) return apiError('视频标题不能为空')
  if (title.length > 128) return apiError('视频标题不能超过128个字符')
  if (category.length > 64) return apiError('视频分类不能超过64个字符')
  if (description.length > 2000) return apiError('视频简介不能超过2000个字符')
  if (file.data.length > 512 * 1024 * 1024 || !String(file.filename || '').toLowerCase().endsWith('.mp4')) return apiError('第一版只支持不超过512MB的MP4视频')
  if (file.data.length < 8 || file.data[4] !== 0x66 || file.data[5] !== 0x74 || file.data[6] !== 0x79 || file.data[7] !== 0x70) return apiError('文件内容不是有效的MP4')
  if (cover && (cover.data.length > 2 * 1024 * 1024 || !/\.(jpe?g|png|webp)$/iu.test(String(cover.filename || '')))) return apiError('封面只支持不超过2MB的JPG、PNG或WEBP')
  const duration = durationRaw ? Number(durationRaw) : null
  if (duration != null && (!Number.isInteger(duration) || duration < 0 || duration > 24 * 60 * 60)) return apiError('视频时长不合法')

  const root = videoStorageRoot()
  const now = new Date()
  const folder = `videos/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const stem = String(file.filename || 'video').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/\.[^.]+$/, '') || 'video'
  const videoRelative = `${folder}/${stem}_${crypto.randomUUID().replaceAll('-', '')}.mp4`
  const videoPath = safeVideoPath(videoRelative)
  const coverRelative = cover ? `covers/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${stem}_${crypto.randomUUID().replaceAll('-', '')}${extname(String(cover.filename || '.jpg')).toLowerCase()}` : null
  const coverPath = coverRelative ? safeVideoPath(coverRelative) : null
  if (!videoPath || (coverRelative && !coverPath)) return apiError('视频存储路径不符合规范')
  await mkdir(resolve(videoPath, '..'), { recursive: true })
  if (coverPath) await mkdir(resolve(coverPath, '..'), { recursive: true })
  try {
    await writeFile(videoPath, Buffer.from(file.data), { flag: 'wx' })
    if (coverPath && cover) await writeFile(coverPath, Buffer.from(cover.data), { flag: 'wx' })
    const [result]: any = await getMysqlPool().execute(mysqlQueryOptions(`
      INSERT INTO tk_video_library
        (title, category, description, original_name, storage_path, cover_path, content_type, size_bytes, duration_seconds, uploader_id, uploader_name, status, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, 'video/mp4', ?, ?, ?, ?, '0', NOW(), NOW())
    `), [title, category || '', description || '', file.filename, videoRelative, coverRelative, file.data.length, duration, authenticated.session.userId, authenticated.session.nickName || authenticated.session.userName])
    const id = Number(result.insertId)
    return apiSuccess({ id, title, category: category || '', description: description || '', originalName: file.filename, storagePath: videoRelative, coverPath: coverRelative, contentType: 'video/mp4', sizeBytes: file.data.length, durationSeconds: duration, uploaderId: authenticated.session.userId, uploaderName: authenticated.session.nickName || authenticated.session.userName, status: '0', hasCover: Boolean(coverRelative), canEdit: true })
  } catch (error) {
    const { rm } = await import('node:fs/promises')
    await Promise.allSettled([rm(videoPath, { force: true }), coverPath ? rm(coverPath, { force: true }) : Promise.resolve()])
    console.error('[NitroVideo] upload failed:', error instanceof Error ? error.message : 'unknown error')
    return apiError('视频上传失败，请稍后重试')
  }
}

async function issuePlayToken(row: RowDataPacket, session: AuthSession): Promise<string | null> {
  if (!videoFileExists(row.storage_path)) return null
  const token = crypto.randomUUID().replaceAll('-', '')
  const ttlMinutes = Math.max(1, Number(process.env.TK_VIDEO_PLAY_TOKEN_TTL_MINUTES || 10))
  await getGarnet().set(
    `tk:video:play-token:${token}`,
    `${row.id}:${session.userId}`,
    'EX',
    ttlMinutes * 60,
  )
  return token
}

async function mapVideoRow(row: RowDataPacket, session: AuthSession, includeCoverUrl: boolean): Promise<Record<string, unknown>> {
  const hasCover = String(row.cover_path ?? '').trim() !== ''
  const canEdit = isAdmin(session) || Number(row.uploader_id) === session.userId
  const token = includeCoverUrl && hasCover ? await issuePlayToken(row, session) : null
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    uploaderId: row.uploader_id,
    uploaderName: row.uploader_name,
    status: row.status,
    createTime: formatDateTime(row.create_time),
    updateTime: formatDateTime(row.update_time),
    hasCover,
    canEdit,
    coverUrl: token ? `/tk_custom/videoLibrary/${row.id}/cover?token=${token}` : null,
  }
}

function videoFilter(query: Query): { sql: string; params: unknown[] } {
  const conditions = ["status = '0'"]
  const params: unknown[] = []
  const title = queryText(query.title)
  const category = queryText(query.category)
  if (title) {
    conditions.push('(title LIKE CONCAT(\'%\', ?, \'%\') OR description LIKE CONCAT(\'%\', ?, \'%\'))')
    params.push(title, title)
  }
  if (category) {
    conditions.push('category = ?')
    params.push(category)
  }
  return { sql: ` WHERE ${conditions.join(' AND ')}`, params }
}

export async function listVideoLibrary(event: H3Event) {
  return withReadSession(event, 'VideoLibraryList', async (session, pool: Pool) => {
    const query = getQuery(event) as Query
    const page = pageRequest(query)
    const filter = videoFilter(query)
    const result = await queryPage(
      pool,
      `SELECT COUNT(*) AS total FROM tk_video_library${filter.sql}`,
      `SELECT ${VIDEO_COLUMNS} FROM tk_video_library${filter.sql} ORDER BY create_time DESC, id DESC LIMIT ?, ?`,
      filter.params,
      [...filter.params, page.offset, page.pageSize],
    )
    const rows = await Promise.all(result.rows.map((row) => mapVideoRow(row, session, true)))
    return apiSuccessFields({ rows, total: result.total }, '查询成功')
  }, '获取视频列表失败')
}

export async function getVideoLibrary(event: H3Event) {
  return withReadSession(event, 'VideoLibraryDetail', async (session, pool: Pool) => {
    const rawId = queryText(getRouterParam(event, 'id')).trim()
    const id = Number(rawId)
    if (!Number.isSafeInteger(id) || id <= 0) return apiError('视频ID不符合规范')
    const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(
      `SELECT ${VIDEO_COLUMNS} FROM tk_video_library WHERE id = ? LIMIT 1`,
    ), [id])
    const row = rows[0]
    if (!row || String(row.status) !== '0') return apiError('视频不存在或已删除')
    return apiSuccess(await mapVideoRow(row, session, false))
  }, '获取视频详情失败')
}
