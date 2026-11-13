import { compare } from 'bcryptjs'
import { getHeader, getRequestIP, readBody } from 'h3'
import { randomUUID } from 'node:crypto'
import { apiError, apiSuccessFields, errorMessage } from '../../utils/response'
import { getGarnet } from '../../utils/redis'
import { getNitroServerConfig } from '../../utils/runtime'
import { signNitroToken } from '../../utils/jwt'
import { enterDataScope } from '../../utils/data-scope'
import { isDemoUsername } from '../../utils/demo'
import { clearAuthCookie, deleteAuthSession, saveAuthSession, setAuthCookie, type AuthSession } from '../../utils/auth'
import { findUserByUsername, getConfigValue, getUserPermissions, getUserRoleKeys, recordLoginInfo, recordUserLogin } from '../../utils/user-repository'

function clientIp(event: Parameters<typeof getRequestIP>[0]): string {
  return getRequestIP(event, { xForwardedFor: true }) || '0.0.0.0'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const username = String(body?.username || '').trim()
  const password = String(body?.password || '')
  const code = String(body?.code || '').trim()
  const uuid = String(body?.uuid || '').trim()
  const ip = clientIp(event)
  const userAgent = getHeader(event, 'user-agent') || ''
  let createdTokenId: string | null = null

  // 按账号分流：演示账号的登录全过程（账号查询、会话、登录记账）都在演示库完成。
  const demoAccount = isDemoUsername(username)
  enterDataScope(demoAccount ? 'demo' : 'prod')

  try {
    const captchaEnabled = (await getConfigValue('sys.account.captchaEnabled'))?.toLowerCase() !== 'false'
    if (captchaEnabled) {
      const captchaKey = `captcha_codes:${uuid}`
      const expected = await getGarnet().get(captchaKey)
      await getGarnet().del(captchaKey)
      if (!expected) {
        await recordLoginInfo(username, '1', '验证码已过期', ip, userAgent)
        return apiError('验证码已过期', 500)
      }
      if (!code || expected.toLowerCase() !== code.toLowerCase()) {
        await recordLoginInfo(username, '1', '验证码错误', ip, userAgent)
        return apiError('验证码错误', 500)
      }
    }

    if (!username || !password || username.length < 2 || username.length > 20 || password.length < 5 || password.length > 20) {
      await recordLoginInfo(username, '1', '用户名或密码错误', ip, userAgent)
      return apiError('用户名或密码错误', 500)
    }

    const blackList = await getConfigValue('sys.login.blackIPList')
    if (blackList && blackList.split(',').map((item) => item.trim()).includes(ip)) {
      await recordLoginInfo(username, '1', '登录IP已被禁止', ip, userAgent)
      return apiError('当前IP禁止登录', 500)
    }

    const retryKey = `pwd_err_cnt:${username}`
    const config = getNitroServerConfig()
    const maxRetryCount = Number(await getConfigValue('user.password.maxRetryCount') || 5)
    const lockTimeMinutes = Number(await getConfigValue('user.password.lockTime') || 10)
    const retryCount = Number(await getGarnet().get(retryKey) || 0)
    if (retryCount >= maxRetryCount) {
      return apiError(`密码错误次数过多，账户锁定${lockTimeMinutes}分钟`, 500)
    }

    const user = await findUserByUsername(username)
    if (!user || user.delFlag === '2') {
      await recordLoginInfo(username, '1', '用户不存在', ip, userAgent)
      return apiError('用户名或密码错误', 500)
    }
    if (user.status !== '0') {
      await recordLoginInfo(username, '1', '用户已停用', ip, userAgent)
      return apiError('用户已停用', 500)
    }

    const matched = await compare(password, user.password)
    if (!matched) {
      await getGarnet().set(retryKey, String(retryCount + 1), 'EX', lockTimeMinutes * 60)
      await recordLoginInfo(username, '1', '用户名或密码错误', ip, userAgent)
      return apiError('用户名或密码错误', 500)
    }
    await getGarnet().del(retryKey)

    const tokenId = randomUUID()
    createdTokenId = tokenId
    const loginTime = Date.now()
    const expireTime = loginTime + config.tokenExpireMinutes * 60 * 1000
    const permissions = await getUserPermissions(user.userId)
    const roles = await getUserRoleKeys(user)
    const safeUser = { ...user }
    delete (safeUser as Partial<typeof safeUser>).password
    const session: AuthSession = {
      version: 1,
      tokenId,
      userId: user.userId,
      deptId: user.deptId,
      userName: user.userName,
      roles,
      permissions,
      user: safeUser,
      loginTime,
      expireTime,
      ipaddr: ip,
      browser: userAgent.slice(0, 128),
      os: '',
    }

    const token = signNitroToken(tokenId, config.authTokenSecret, config.tokenExpireMinutes, demoAccount ? 'demo' : undefined)
    await saveAuthSession(session)
    await setAuthCookie(event, token)
    await recordUserLogin(user.userId, ip)
    await recordLoginInfo(username, '0', '登录成功', ip, userAgent)
    return apiSuccessFields({ token })
  } catch (error) {
    if (createdTokenId) {
      try {
        await deleteAuthSession(createdTokenId)
      } catch (cleanupError) {
        console.error('[NitroAuth] login cleanup failed:', errorMessage(cleanupError, 'unknown error'))
      }
      clearAuthCookie(event)
    }
    console.error('[NitroAuth] login failed:', errorMessage(error, 'unknown error'))
    return apiError('登录服务暂不可用', 500)
  }
})
