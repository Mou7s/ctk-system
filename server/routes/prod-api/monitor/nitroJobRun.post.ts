import { NITRO_JOB_MAP } from '../../../utils/nitro-jobs/registry'
import { getAuthSession } from '../../../utils/auth'
import { apiError } from '../../../utils/response'

/**
 * 旧任务手动触发统一入口（默认只看不写）。
 * POST /prod-api/monitor/nitroJobRun { key, apply?: boolean }
 * ctor: dryRun=1 预览；apply=1 真执行（各任务内部仍以前置确认为准，
 *       未补全口径的任务即使 apply 也只返回待办，不写库）。
 */
export default defineEventHandler(async (event) => {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
  const query = getQuery(event)
  const key = String(body.key ?? query.key ?? '').trim()
  const apply = String(body.apply ?? query.apply ?? '') === '1'
  const def = NITRO_JOB_MAP.get(key)
  if (!def) {
    throw createError({
      statusCode: 400,
      message: `未知任务key=${key || '-'}，可用：${[...NITRO_JOB_MAP.keys()].join(',')}`,
    })
  }
  const r = await def.run(!apply)
  return { key, jobId: def.jobId, name: def.name, nitroTarget: def.nitroTarget, ...r }
})
