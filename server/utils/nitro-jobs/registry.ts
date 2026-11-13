import type { NitroJobDef } from './types'
import { kucunFullJob } from './kucun-full'
import { kucunDiffJob } from './kucun-diff'
import { suggestPushJob } from './suggest-push'
import { approveSyncJob } from './approve-sync'
import { approve7dJob } from './approve-7d'
import { kucunWarningPushJob } from './kucun-warning-push'
import { broadcastSyncJob } from './broadcast-sync'
import { uploadPathJob } from './upload-path'
import { overdueFreezeJob } from './overdue-freeze'
import { kucunSnapshotJob } from './kucun-snapshot'
import { wecomEmployeeSyncJob } from './wecom-employee-sync'

/**
 * 旧 sys_job 统一注册表（102/110 已有独立插件，不在此列，避免重复调度）。
 */
export const NITRO_JOBS: NitroJobDef[] = [
  kucunFullJob,
  kucunDiffJob,
  suggestPushJob,
  approveSyncJob,
  approve7dJob,
  kucunWarningPushJob,
  broadcastSyncJob,
  uploadPathJob,
  overdueFreezeJob,
  kucunSnapshotJob,
  wecomEmployeeSyncJob,
]

export const NITRO_JOB_MAP = new Map(NITRO_JOBS.map((j) => [j.key, j]))

/** 列表页调用目标列展示用：旧 Java -> Nitro 约定（仅展示，不改库） */
export const NITRO_TARGET_DISPLAY: Record<string, string> = Object.fromEntries(
  NITRO_JOBS.map((j) => [j.oldTarget, j.nitroTarget]),
)
