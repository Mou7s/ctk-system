import { createReadStream, statSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getQuery, readMultipartFormData, setHeader, sendStream, type H3Event } from 'h3'
import { getNitroServerConfig } from './runtime'
import { apiError, apiSuccess } from './response'
import { getAuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

function profileRoot() {
  return resolve(getNitroServerConfig().profilePath)
}

function safeFile(root: string, value: unknown): string | null {
  const raw = String(value ?? '').trim().replaceAll('\\', '/')
  if (!raw || raw.includes('\0') || raw.split('/').some((part) => part === '..')) return null
  const withoutPrefix = raw.replace(/^\/?profile\//i, '').replace(/^\//, '')
  const file = resolve(root, withoutPrefix)
  const rel = relative(root, file)
  return rel && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel) ? file : null
}

function filenameOf(value: unknown) {
  const raw = basename(String(value || 'file')).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_')
  return raw || 'file'
}

async function uploadParts(event: H3Event, fieldNames: string[]) {
  const parts = await readMultipartFormData(event)
  const files = (parts || []).filter((part) => part.filename && fieldNames.includes(String(part.name)))
  if (!files.length) throw new Error('请选择文件')
  return files
}

async function saveFile(file: { data: Uint8Array; filename?: string }, folder: string) {
  if (!file.data?.length) throw new Error('上传文件为空')
  if (file.data.length > MAX_UPLOAD_BYTES) throw new Error('上传文件超过大小限制')
  const root = profileRoot()
  const extension = extname(filenameOf(file.filename)).toLowerCase()
  const name = `${Date.now()}_${randomUUID().replaceAll('-', '')}${extension}`
  const relativePath = join(folder, name).replaceAll('\\', '/')
  const target = safeFile(root, relativePath)
  if (!target) throw new Error('文件路径不符合规范')
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, Buffer.from(file.data), { flag: 'wx' })
  return { target, relativePath, name, originalFilename: file.filename || 'file' }
}

export async function uploadCommonFile(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    const files = await uploadParts(event, ['file', 'files'])
    const saved = await saveFile(files[0], 'upload')
    const fileName = `/profile/${saved.relativePath}`
    return apiSuccess({ url: fileName, fileName, newFileName: saved.name, originalFilename: saved.originalFilename })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : '上传文件失败')
  }
}

export async function uploadCommonFiles(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    const files = await uploadParts(event, ['file', 'files'])
    const saved = await Promise.all(files.map((file) => saveFile(file, 'upload')))
    const names = saved.map((item) => `/profile/${item.relativePath}`)
    return apiSuccess({
      urls: names.join(','),
      fileNames: names.join(','),
      newFileNames: saved.map((item) => item.name).join(','),
      originalFilenames: saved.map((item) => item.originalFilename).join(','),
    })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : '上传文件失败')
  }
}

function existsAsFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

export async function downloadCommonFile(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  const file = safeFile(profileRoot(), (getQuery(event) as Record<string, unknown>).fileName)
  if (!file) return apiError('文件名称非法，不允许下载')
  if (!existsAsFile(file)) return apiError('文件不存在', 404)
  try {
    const stream = createReadStream(file)
    setHeader(event, 'content-type', 'application/octet-stream')
    setHeader(event, 'content-disposition', `attachment; filename="${basename(file).replaceAll('"', '')}"`)
    return sendStream(event, stream)
  } catch {
    return apiError('文件不存在', 404)
  }
}

export async function downloadResource(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  const resource = String((getQuery(event) as Record<string, unknown>).resource || '')
  const value = resource.replace(/^\/profile\//i, '')
  const file = safeFile(profileRoot(), value)
  if (!file) return apiError('资源文件非法，不允许下载')
  if (!existsAsFile(file)) return apiError('资源文件不存在', 404)
  try {
    const stream = createReadStream(file)
    setHeader(event, 'content-type', 'application/octet-stream')
    setHeader(event, 'content-disposition', `attachment; filename="${basename(file).replaceAll('"', '')}"`)
    return sendStream(event, stream)
  } catch {
    return apiError('资源文件不存在', 404)
  }
}

export async function uploadAvatar(event: H3Event) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  try {
    // 前端裁剪器以 avatarfile 为字段名（沿用既有前端约定），兼容 avatar/file
    const parts = await uploadParts(event, ['avatarfile', 'avatar', 'file'])
    const saved = await saveFile(parts[0], 'avatar')
    const avatar = `/profile/${saved.relativePath}`
    await getMysqlPool().execute(mysqlQueryOptions('UPDATE sys_user SET avatar = ?, update_by = ?, update_time = NOW() WHERE user_id = ?'), [avatar, authenticated.session.userName, authenticated.session.userId])
    return apiSuccess({ imgUrl: avatar })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : '头像上传失败')
  }
}
