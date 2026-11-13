import { verifyNitroToken } from '../utils/jwt'
import { extractToken } from '../utils/auth'
import { getNitroServerConfig } from '../utils/runtime'
import { enterDataScope } from '../utils/data-scope'

/**
 * 请求级数据域：解析令牌里的 scope 声明，决定本次请求读写哪个库。
 *
 * - 每个请求都先显式归零到 prod，避免上一个请求的数据域残留（AsyncLocalStorage 泄漏是最危险的失败模式）；
 * - 只有登录时签发的演示令牌（scope=demo）才切到 demo 域；
 * - 令牌过期也允许解析（allowExpired），因为「过期的演示令牌」仍然说明这是演示账号的浏览器，
 *   真正的登录态校验仍在业务层（getAuthSession）。
 */
export default defineEventHandler((event) => {
  enterDataScope('prod')

  const token = extractToken(event)
  if (!token) return

  const secret = getNitroServerConfig().authTokenSecret
  if (!secret) return

  const claims = verifyNitroToken(token, secret, { allowExpired: true })
  if (claims?.scope === 'demo') {
    enterDataScope('demo')
  }
})
