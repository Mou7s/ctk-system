import { setResponseHeader } from 'h3'
import { isDemoUsername } from '../../utils/demo'
import { apiSuccessFields } from '../../utils/response'
import { getNitroServerConfig } from '../../utils/runtime'

/**
 * 演示登录页（/login?demo=1）专用的账号自动填充接口。
 *
 * 安全边界：
 * - 仅当配置了演示数据源（wfs_demo）、配置的用户名属于受控演示账号（DEMO_USERNAMES）
 *   且显式设置了演示登录密码时才下发；绝不返回任何生产账号凭据。
 * - 不将密码写死在前端构建产物或普通登录页 SSR HTML 中。
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const config = getNitroServerConfig()
  const demoConfigured = Boolean(config.demoMysqlUrl || config.demoMysqlHost)
  const username = String(config.demoLoginUsername || '').trim()
  const password = String(config.demoLoginPassword || '')

  if (!demoConfigured || !isDemoUsername(username) || !password) {
    return apiSuccessFields({ enabled: false })
  }

  return apiSuccessFields({
    enabled: true,
    username,
    password,
  })
})
