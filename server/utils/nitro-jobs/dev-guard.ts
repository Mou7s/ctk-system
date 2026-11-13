/**
 * 开发环境跳过「重型定时任务」的开关。
 *
 * 背景（2026-09-19 排查 dev 慢）：dev 时 Nitro/Bun 与页面请求共用同一个进程和连接池，
 * 而这些调度器会真的发金蝶/企微请求 —— logs/frontend-dev.log 里有 54 条「K3Cloud 请求超时」，
 * 每次上限 30s（NUXT_K3_REQUEST_TIMEOUT_MS），还伴随写共享库的同步动作。
 * 表现就是本机「点开页面要反应很久」，线上 nuxt-ssr 不受影响。
 *
 * 默认：dev 不跑；线上照旧按 sys_config / env 开关跑。
 * 安全取向：只有明确判定为 dev（import.meta.dev === true）才跳过，
 * 构建产物里该值为 false/未定义时一律不跳过 —— 避免误把线上任务关掉。
 * 需要本地验证定时任务：NUXT_NITRO_JOBS_IN_DEV=1 bun run dev，
 * 或在「系统监控 → 定时任务」页手动触发（手动路径不受本开关影响）。
 */
export function skipHeavySchedulerInDev(label: string): boolean {
  const forced = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.NUXT_NITRO_JOBS_IN_DEV || '').toLowerCase(),
  )
  const isDev = import.meta.dev === true
  if (!isDev || forced) return false

  console.info(
    `[${label}] dev 环境默认不启动重型调度（发金蝶/企微会拖慢本地调试）；` +
      '需要时设 NUXT_NITRO_JOBS_IN_DEV=1 重启，或在定时任务页手动触发。',
  )
  return true
}
