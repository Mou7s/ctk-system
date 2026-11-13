import { isDemoScope } from './data-scope'

/**
 * 演示账号（按账号分流，不是按实例分流）。
 *
 * 账号体系：
 * - 演示账号只存在于演示库（wfs_demo）里，**不在生产库 sys_user 中**，生产账号体系不受影响；
 * - 登录时按用户名判定：命中演示账号名 -> 该请求进入 demo 数据域（读写演示库）；
 * - 令牌里带 scope=demo，后续请求由 server/middleware/01.data-scope.ts 还原数据域。
 *
 * 写操作策略：演示域的写操作落到演示库（可随时用 tools/demo-env 重建）；
 * 外部系统（金蝶 / SQL Server / 企业微信 / 考勤库）在演示域一律不发起调用。
 */
export const DEMO_USERNAMES = ['demo']

export function isDemoUsername(name: unknown): boolean {
  const value = String(name ?? '').trim().toLowerCase()
  return Boolean(value) && DEMO_USERNAMES.includes(value)
}

export const DEMO_EXTERNAL_MESSAGE = '演示账号未接入外部系统（金蝶 / SQL Server / 企业微信 / 考勤库），此处展示为空数据。'

/** 演示域下外部系统调用的统一错误。 */
export class DemoModeError extends Error {
  readonly kind = 'demo'
  readonly statusCode = 503

  constructor(message = DEMO_EXTERNAL_MESSAGE) {
    super(message)
    this.name = 'DemoModeError'
  }
}

/** 当前请求是否处于演示域（等价于 isDemoScope，命名更贴近调用点语义）。 */
export function isDemoRequest(): boolean {
  return isDemoScope()
}
