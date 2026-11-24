import type { H3Event } from 'h3'
import { getHeader, getRequestIP, readBody } from 'h3'
import { hashSync } from 'bcryptjs'
import { apiError, apiSuccess } from './response'
import { getGarnet } from './redis'
import { getConfigValue, recordLoginInfo } from './user-repository'
import { mysqlQueryOptions } from './mysql'
import { queryOne, text, withPublicIdempotentWriteSession, writeFail } from './write'

function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) || '0.0.0.0'
}

export default async function register(event: H3Event) {
  const rawBody = await readBody(event)
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
  const username = text(body.username)
  const password = text(body.password)
  const code = text(body.code)
  const uuid = text(body.uuid)
  const ip = clientIp(event)
  const requestKey = `register:${ip}:${text(getHeader(event, 'idempotency-key')) || text(body.requestId) || username}`.slice(0, 64)

  const enabled = await getConfigValue('sys.account.registerUser')
  if (enabled?.toLowerCase() !== 'true') return apiError('当前系统没有开启注册功能！', 500)
  if (username.length < 2 || username.length > 20) return apiError('账户长度必须在2到20个字符之间', 500)
  if (password.length < 5 || password.length > 20) return apiError('密码长度必须在5到20个字符之间', 500)

  const captchaEnabled = (await getConfigValue('sys.account.captchaEnabled'))?.toLowerCase() !== 'false'
  if (captchaEnabled) {
    const key = `captcha_codes:${uuid}`
    const expected = await getGarnet().get(key)
    await getGarnet().del(key)
    if (!expected) return apiError('验证码已过期', 500)
    if (!code || expected.toLowerCase() !== code.toLowerCase()) return apiError('验证码错误', 500)
  }

  const response = await withPublicIdempotentWriteSession(
    event,
    'system:register',
    requestKey,
    { username, password, code, uuid },
    async (_session, connection) => {
      if (await queryOne(connection, 'SELECT user_id FROM sys_user WHERE user_name = ? AND del_flag = \'0\' LIMIT 1', [username])) writeFail(`保存用户'${username}'失败，注册账号已存在`)
      const result: any = await connection.query(mysqlQueryOptions(`
        INSERT INTO sys_user (user_name, nick_name, password, status, create_time)
        VALUES (?, ?, ?, '1', NOW())
      `), [username, username, hashSync(password, 10)])
      if (!Number(result[0]?.affectedRows || 0)) writeFail('注册失败,请联系系统管理人员')
      return apiSuccess()
    },
    '注册服务暂不可用',
    async () => recordLoginInfo(username, '0', '注册成功', ip, getHeader(event, 'user-agent') || ''),
  )
  return response
}
