import { apiError, apiSuccessFields, errorMessage } from '../../utils/response'
import { getAuthSession, saveAuthSession } from '../../utils/auth'
import { findUserByUsername, getConfigValue, getUserMenuIds, getUserPermissions, getUserRoleKeys } from '../../utils/user-repository'
import { isDemoUsername } from '../../utils/demo'
import { compare } from 'bcryptjs'

export default defineEventHandler(async (event) => {
  try {
    const authenticated = await getAuthSession(event)
    if (!authenticated) return apiError('登录状态已过期', 401)

    const { session } = authenticated
    const initPassword = (await getConfigValue('sys.user.initPassword')) || '123456'
    const dbUser = await findUserByUsername(session.userName)
    // Do not rely on the login-time permission snapshot. Role/menu changes
    // must become effective after the user explicitly refreshes permissions.
    const permissions = dbUser ? await getUserPermissions(session.userId) : session.permissions
    const menuIds = await getUserMenuIds(session.userId)
    const isDefaultPassword = Boolean(dbUser && await compare(initPassword, dbUser.password))
    if (dbUser) {
      session.permissions = permissions
      session.roles = await getUserRoleKeys(dbUser)
      session.user = { ...session.user, ...dbUser, roles: dbUser.roles }
      delete (session.user as Record<string, unknown>).password
      await saveAuthSession(session)
    }
    const user = { ...session.user }
    delete (user as Record<string, unknown>).password
    return apiSuccessFields({
      user,
      roles: session.roles.length ? session.roles : ['ROLE_DEFAULT'],
      permissions,
      menuIds,
      isDefaultPassword,
      // 演示账号：前端据此隐藏公司标识并提示"数据为虚构样例"
      demo: isDemoUsername(session.userName),
    })
  } catch (error) {
    console.error('[NitroAuth] getInfo failed:', errorMessage(error, 'unknown error'))
    return apiError('获取用户信息失败', 500)
  }
})
