import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import {
  affectedRows,
  insertOperationLog,
  javaAjax,
  queryOne,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Body = Record<string, any>

function requestId(event: H3Event, body: Body): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function isAdmin(session: AuthSession): boolean {
  return session.userId === 1 || session.roles.includes('admin')
}

function validMetadata(body: Body) {
  const title = text(body.title)
  if (!title) writeFail('视频标题不能为空')
  if (title.length > 255) writeFail('视频标题不能超过255个字符')
  if (text(body.category).length > 100) writeFail('视频分类不能超过100个字符')
  if (text(body.description).length > 2000) writeFail('视频说明不能超过2000个字符')
  return { title, category: text(body.category) || null, description: text(body.description) || null }
}

async function editVideo(event: H3Event, session: AuthSession, connection: PoolConnection, body: Body, requestKey: string) {
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) writeFail('视频ID不符合规范')
  const existing = await queryOne(connection, 'SELECT id, uploader_id, status FROM tk_video_library WHERE id = ?', [id])
  if (!existing || String(existing.status) !== '0') writeFail('视频不存在或已删除')
  if (!isAdmin(session) && Number(existing.uploader_id) !== session.userId) writeFail('只能修改自己上传的视频', 403)
  const metadata = validMetadata(body)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE tk_video_library SET title = ?, category = ?, description = ?, update_time = NOW() WHERE id = ? AND status = '0'`), [metadata.title, metadata.category, metadata.description, id])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '员工视频知识库', 2, { ...body, requestId: requestKey })
  return javaAjax(count)
}

async function deleteVideo(event: H3Event, session: AuthSession, connection: PoolConnection, body: Body, requestKey: string) {
  const id = Number(getRouterParam(event, 'id') || body.id)
  if (!Number.isSafeInteger(id) || id <= 0) writeFail('视频ID不符合规范')
  const existing = await queryOne(connection, 'SELECT id, uploader_id, status FROM tk_video_library WHERE id = ?', [id])
  if (!existing || String(existing.status) !== '0') writeFail('视频不存在或已删除')
  if (!isAdmin(session) && Number(existing.uploader_id) !== session.userId) writeFail('只能删除自己上传的视频', 403)
  const result: any = await connection.query(mysqlQueryOptions(`UPDATE tk_video_library SET status = '1', update_time = NOW() WHERE id = ? AND status = '0'`), [id])
  const count = affectedRows(result[0])
  await insertOperationLog(event, connection, session, '员工视频知识库', 3, { id, requestId: requestKey })
  return javaAjax(count)
}

export function createVideoWriteHandler(kind: 'edit' | 'delete') {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
    const requestKey = requestId(event, body)
    return withIdempotentWriteSession(
      event,
      `video:${kind}`,
      null,
      requestKey,
      { ...body, requestId: requestKey },
      async (session, connection) => kind === 'edit'
        ? editVideo(event, session, connection, body, requestKey)
        : deleteVideo(event, session, connection, body, requestKey),
      '视频写入失败',
    )
  }
}
