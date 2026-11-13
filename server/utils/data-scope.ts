import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 请求级数据域：决定当前请求读写哪个库、是否接外部系统。
 *
 * 设计原则（很重要）：
 * - **默认 prod**。任何没有显式进入 demo 域的代码（定时任务、缓存清理、启动期逻辑、
 *   后台线程）都走生产，行为与改造前完全一致。
 * - 只有 `demo` 账号的请求会被切到 demo 域。
 * - demo 域下的数据库连接使用**只连演示库的账号**，即使路由写错也碰不到生产库。
 */
export type DataScope = 'prod' | 'demo'

const storage = new AsyncLocalStorage<DataScope>()

/** 进入指定数据域。同一请求内可多次调用，后调用者生效（用于登录时按用户名判定）。 */
export function enterDataScope(scope: DataScope): void {
  storage.enterWith(scope)
}

/** 当前数据域；无上下文时为 prod。 */
export function getDataScope(): DataScope {
  return storage.getStore() ?? 'prod'
}

/** 当前是否处于演示账号的数据域。 */
export function isDemoScope(): boolean {
  return getDataScope() === 'demo'
}

/** 在指定数据域内执行一段逻辑（需要同步包裹时使用）。 */
export function runInDataScope<T>(scope: DataScope, fn: () => T): T {
  return storage.run(scope, fn)
}
