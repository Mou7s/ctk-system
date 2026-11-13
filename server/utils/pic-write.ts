import { unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import type { PoolConnection } from 'mysql2/promise'
import { getNitroServerConfig } from './runtime'
import { mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess } from './response'
import {
  affectedRows,
  idList,
  insertOperationLog,
  javaAjax,
  queryOne,
  requiredText,
  text,
  withIdempotentWriteSession,
  writeFail,
} from './write'

type Body = Record<string, any>
type Kind = 'add' | 'edit' | 'delete' | 'delete-file'
const fields: Array<[string, string]> = [
  ['flowno', 'flowno'], ['materialno', 'materialno'], ['materialname', 'materialname'],
  ['specification', 'specification'], ['remark', 'remark'], ['imgPaths', 'imgPaths'],
  ['mechineName', 'mechineName'], ['xpdm', 'xpdm'], ['xpph', 'xpph'], ['khdm', 'khdm'],
  ['handler', 'handler'], ['result', 'result'], ['testNumber', 'testNumber'], ['testCharge', 'testCharge'],
]

function requestId(event: H3Event, body: Body) {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

function safeProfileFile(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  const withoutPrefix = raw.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+(?:prod-api\/)?profile\//i, '')
  if (!withoutPrefix || withoutPrefix.includes('\0') || withoutPrefix.split(/[\\/]/).includes('..')) return null
  const root = resolve(getNitroServerConfig().profilePath)
  const target = resolve(root, withoutPrefix)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}

async function removeImagePair(value: unknown) {
  const target = safeProfileFile(value)
  if (!target) return
  const pair = target.includes(`${join('dkPic_zip', '')}`)
    ? target.replace(`${join('dkPic_zip', '')}`, 'dkPic')
    : target.replace(`${join('dkPic', '')}`, 'dkPic_zip')
  await Promise.allSettled([unlink(target), unlink(pair)])
}

function imageValues(value: unknown) {
  return text(value).split(',').map((item) => item.trim()).filter(Boolean)
}

async function writePic(connection: PoolConnection, session: any, body: Body, editing: boolean) {
  const present = fields.filter(([key]) => key in body)
  if (!present.length) writeFail('没有可写入的弹坑图片字段')
  const values = present.map(([key]) => body[key] == null || text(body[key]) === '' ? null : text(body[key]))
  if (editing) {
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id <= 0) writeFail('图片记录ID不符合规范')
    const old = await queryOne(connection, 'SELECT imgPaths FROM dk_pic WHERE id = ?', [id])
    if (!old) writeFail('图片记录不存在')
    const [result] = await connection.query(mysqlQueryOptions(`UPDATE dk_pic SET ${present.map(([, column]) => `${column} = ?`).join(', ')}, modifydate = NOW(), updater = ? WHERE id = ?`), [...values, session.user.userName, id])
    return { response: javaAjax(affectedRows(result)), oldPaths: imageValues(old.imgPaths), newPaths: imageValues(body.imgPaths) }
  }
  const columns = [...present.map(([, column]) => column), 'createdate', 'modifydate', 'creator', 'updater']
  const [result] = await connection.query(mysqlQueryOptions(`INSERT INTO dk_pic (${columns.join(', ')}) VALUES (${columns.map((column) => column === 'createdate' || column === 'modifydate' ? 'NOW()' : '?').join(', ')})`), [...values, session.user.userName, session.user.userName])
  return { response: javaAjax(affectedRows(result)), oldPaths: [], newPaths: [] }
}

export function createPicWriteHandler(kind: Kind) {
  return async (event: H3Event) => {
    const rawBody = await readBody(event)
    const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Body : {}
    if (kind === 'delete-file') {
      for (const filename of imageValues(body.filename)) await removeImagePair(filename)
      return apiSuccess()
    }
    const requestKey = requestId(event, body)
    const permission = kind === 'add' ? 'tk_custom:pic:add' : kind === 'edit' ? 'tk_custom:pic:edit' : kind === 'delete' ? 'tk_custom:pic:remove' : null
    return withIdempotentWriteSession(event, `pic:${kind}`, permission, requestKey, { ...body, requestId: requestKey }, async (session, connection) => {
      let response: any
      let oldPaths: string[] = []
      let newPaths: string[] = []
      if (kind === 'delete') {
        const ids = idList(body.ids ?? (text(body.id) || getRouterParam(event, 'ids')), '图片ID')
        const rows = await connection.query<any[]>(mysqlQueryOptions(`SELECT imgPaths FROM dk_pic WHERE id IN (${ids.map(() => '?').join(', ')})`), ids)
        oldPaths = rows[0].map((row: any) => String(row.imgPaths || '').split(',')).flat().filter(Boolean)
        const [result] = await connection.query(mysqlQueryOptions(`DELETE FROM dk_pic WHERE id IN (${ids.map(() => '?').join(', ')})`), ids)
        response = javaAjax(affectedRows(result))
      } else {
        const written = await writePic(connection, session, body, kind === 'edit')
        response = written.response
        oldPaths = written.oldPaths
        newPaths = written.newPaths
      }
      await insertOperationLog(event, connection, session, '弹坑图片', kind === 'add' ? 1 : kind === 'edit' ? 2 : 3, { ...body, requestId: requestKey }, response)
      if (response.code === 200) {
        for (const filename of oldPaths.filter((item) => !newPaths.includes(item))) await removeImagePair(filename)
      }
      return response
    }, '弹坑图片写入失败')
  }
}
