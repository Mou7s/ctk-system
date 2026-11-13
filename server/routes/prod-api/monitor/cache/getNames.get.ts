import { getAuthSession } from '../../../../utils/auth'
import { apiError, apiSuccess } from '../../../../utils/response'

/**
 * 缓存列表：列出 sys_cache 里实际使用的键前缀。
 * 前缀清单与 db/sql/20260915_sys_cache_state_table.sql 头部说明保持一致。
 */
const cacheNames = [
  { cacheName: 'auth_sessions:', cacheKey: '', cacheValue: '', remark: '会话（Nitro 权威副本）' },
  { cacheName: 'login_tokens:', cacheKey: '', cacheValue: '', remark: '会话（Java 兼容副本）' },
  { cacheName: 'captcha_codes:', cacheKey: '', cacheValue: '', remark: '图形验证码' },
  { cacheName: 'pwd_err_cnt:', cacheKey: '', cacheValue: '', remark: '登录失败次数锁' },
  { cacheName: 'nitro:write:', cacheKey: '', cacheValue: '', remark: '高危写请求幂等键' },
  { cacheName: 'tk:video:play-token:', cacheKey: '', cacheValue: '', remark: '视频播放票据' },
]

export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)
  return apiSuccess(cacheNames)
})
