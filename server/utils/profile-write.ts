import type { H3Event } from 'h3'
import { getHeader, getQuery, readBody } from 'h3'
import { compare, hashSync } from 'bcryptjs'
import { apiError, apiSuccess } from './response'
import { mysqlQueryOptions } from './mysql'
import { insertOperationLog, nullableText, requiredText, text, withIdempotentWriteSession, writeFail, refreshNitroSessions } from './write'

function requestId(event: H3Event, body: Record<string, any>): string {
  return text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
}

export async function updateProfile(event: H3Event) {
  const rawBody = await readBody(event)
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
  const requestKey = requestId(event, body)
  return withIdempotentWriteSession(
    event,
    'system-profile:update',
    null,
    requestKey,
    { ...body, requestId: requestKey },
    async (session, connection) => {
      const nickName = requiredText(body.nickName, '用户昵称', 30)
      const email = nullableText(body.email)
      const phonenumber = nullableText(body.phonenumber)
      if (phonenumber && await connection.query(mysqlQueryOptions('SELECT user_id FROM sys_user WHERE phonenumber = ? AND del_flag = \'0\' AND user_id <> ? LIMIT 1'), [phonenumber, session.userId]).then(([rows]: any) => rows[0])) writeFail('修改个人信息失败，手机号码已存在')
      if (email && await connection.query(mysqlQueryOptions('SELECT user_id FROM sys_user WHERE email = ? AND del_flag = \'0\' AND user_id <> ? LIMIT 1'), [email, session.userId]).then(([rows]: any) => rows[0])) writeFail('修改个人信息失败，邮箱账号已存在')
      const result: any = await connection.query(mysqlQueryOptions(`
        UPDATE sys_user SET nick_name = ?, email = ?, phonenumber = ?, sex = ?, update_by = ?, update_time = NOW()
        WHERE user_id = ? AND del_flag = '0'
      `), [nickName, email, phonenumber, text(body.sex) || '0', session.userName, session.userId])
      if (!Number(result[0]?.affectedRows || 0)) writeFail('修改个人信息异常，请联系管理员')
      const response = apiSuccess()
      await insertOperationLog(event, connection, session, '个人信息', 2, { requestId: requestKey }, response)
      return response
    },
    '修改个人信息失败',
    async () => refreshNitroSessions(),
  )
}

export async function updatePassword(event: H3Event) {
  const query = getQuery(event) as Record<string, unknown>
  const oldPassword = text(query.oldPassword)
  const newPassword = text(query.newPassword)
  if (!oldPassword) return apiError('旧密码不能为空', 500)
  if (!newPassword) return apiError('新密码不能为空', 500)
  if (newPassword.length < 5 || newPassword.length > 20) writeFail('新密码长度必须在5到20个字符之间')
  const requestKey = text(getHeader(event, 'idempotency-key')) || crypto.randomUUID()
  return withIdempotentWriteSession(
    event,
    'system-profile:password',
    null,
    requestKey,
    { userId: 'current', oldPassword, newPassword, requestId: requestKey },
    async (session, connection) => {
      const [rows] = await connection.query<any[]>(mysqlQueryOptions('SELECT password FROM sys_user WHERE user_id = ? AND del_flag = \'0\' LIMIT 1'), [session.userId])
      const current = rows[0]
      if (!current || !(await compare(oldPassword, String(current.password || '')))) writeFail('修改密码失败，旧密码错误')
      if (await compare(newPassword, String(current.password || ''))) writeFail('新密码不能与旧密码相同')
      const result: any = await connection.query(mysqlQueryOptions('UPDATE sys_user SET password = ?, update_by = ?, update_time = NOW() WHERE user_id = ? AND del_flag = \'0\''), [hashSync(newPassword, 10), session.userName, session.userId])
      if (!Number(result[0]?.affectedRows || 0)) writeFail('修改密码异常，请联系管理员')
      const response = apiSuccess()
      await insertOperationLog(event, connection, session, '个人信息', 2, { requestId: requestKey }, response)
      return response
    },
    '修改密码失败',
    async () => refreshNitroSessions(),
  )
}
