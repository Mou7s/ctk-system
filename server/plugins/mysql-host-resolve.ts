import { errorMessage } from '../utils/response'
import { mysqlHostCandidates, resolveMysqlPoolHost } from '../utils/mysql'

/**
 * 业务库主/备地址解析：主地址不可达时自动切到 NUXT_MYSQL_HOST_FALLBACK。
 *
 * 只在配置了 fallback 时探测（见 resolveMysqlPoolHost），未配置时等同空操作，
 * 不影响生产默认行为。探测失败不阻断启动：后续查询仍按主地址连接并照常报错。
 */
export default defineNitroPlugin(() => {
  // 与其它调度插件一致：推迟到服务就绪后再碰 runtime config / 连接池。
  setTimeout(() => {
    void (async () => {
      try {
        if (mysqlHostCandidates().length < 2) return
        const host = await resolveMysqlPoolHost()
        console.info(`[NitroMysqlHost] 业务库连接地址解析为 ${host || '(未知)'}`)
      } catch (error) {
        console.warn('[NitroMysqlHost] resolve failed:', errorMessage(error, 'unknown error'))
      }
    })()
  }, 500)
})
