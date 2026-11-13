import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { getAuthSession, type AuthSession } from './auth'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiError, apiSuccess, errorMessage } from './response'
import { insertOperationLog } from './write'
import {
  diffWecomContacts,
  fetchWecomContacts,
  loadWecomContactConfig,
  type ExistingWecomContact,
  type WecomContact,
  type WecomContactDiff,
} from './wecom-contacts'

export type WecomContactSyncSummary = {
  batchId?: number
  mode: 'preview' | 'apply'
  remoteCount: number
  addedCount: number
  updatedCount: number
  unchangedCount: number
  missingCount: number
  hireCount: number
  leaveCount: number
  added: WecomContact[]
  updated: WecomContactDiff['updated']
  missing: ExistingWecomContact[]
}

type WecomSyncOperator = Pick<AuthSession, 'userId' | 'userName'>

function activeContact(row: RowDataPacket): ExistingWecomContact {
  return {
    userid: String(row.userid || '').trim(),
    name: row.name == null ? null : String(row.name),
    dept: row.dept == null ? null : String(row.dept),
    position: row.position == null ? null : String(row.position),
    leaderDept: row.leader_dept == null ? null : String(row.leader_dept),
    status: String(row.status || 'active'),
  }
}

export async function readLocalWecomContacts(pool: Pool): Promise<ExistingWecomContact[]> {
  const [rows] = await pool.query<RowDataPacket[]>(mysqlQueryOptions(`
    SELECT userid, name, dept, position, leader_dept, status
    FROM wxuser
    WHERE status IS NULL OR status = 'active'
  `))
  return rows.map(activeContact).filter((row) => row.userid)
}

function assertSafeRemoteSnapshot(remote: WecomContact[], existing: ExistingWecomContact[]): void {
  if (remote.length === 0 && existing.length > 0) {
    throw new Error('企业微信返回空通讯录，已停止同步，避免误把本地成员全部标记为离职')
  }
}

export function summarizeWecomContactDiff(
  remote: WecomContact[],
  diff: WecomContactDiff,
  mode: 'preview' | 'apply',
  batchId?: number,
): WecomContactSyncSummary {
  return {
    ...(batchId == null ? {} : { batchId }),
    mode,
    remoteCount: remote.length,
    addedCount: diff.added.length,
    updatedCount: diff.updated.length,
    unchangedCount: diff.unchanged.length,
    missingCount: diff.missing.length,
    hireCount: diff.added.length,
    leaveCount: diff.missing.length,
    added: diff.added,
    updated: diff.updated,
    missing: diff.missing,
  }
}

export async function applyWecomContactSync(
  connection: PoolConnection,
  diff: WecomContactDiff,
  remote: WecomContact[],
  operator: WecomSyncOperator,
): Promise<{
  batchId: number
  addedCount: number
  updatedCount: number
  unchangedCount: number
  missingCount: number
  remoteCount: number
  hireCount: number
  leaveCount: number
}> {
  const [batchResult] = await connection.query<any>(mysqlQueryOptions(`
    INSERT INTO wxuser_sync_batch
      (sync_type, status, requested_by, requested_by_name, remote_count, started_at)
    VALUES ('employee', 'running', ?, ?, ?, NOW())
  `), [operator.userId, operator.userName, remote.length])
  const batchId = Number(batchResult?.insertId || 0)
  if (!batchId) throw new Error('创建企业微信通讯录同步批次失败')

  let newlyDiscovered: WecomContact[] = []
  if (remote.length) {
    const remoteIds = remote.map((item) => item.userid)
    const placeholders = remoteIds.map(() => '?').join(', ')
    const [knownRows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(`
      SELECT userid
      FROM wxuser
      WHERE userid IN (${placeholders})
    `), remoteIds)
    const knownUserIds = new Set(knownRows.map((row) => String(row.userid || '').trim()))
    newlyDiscovered = remote.filter((item) => !knownUserIds.has(item.userid))
  }

  if (remote.length) {
    const placeholders = remote.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
    await connection.query(mysqlQueryOptions(`
      INSERT INTO wxuser_sync_member_snapshot
        (batch_id, userid, name, dept, position, leader_dept)
      VALUES ${placeholders}
    `), remote.flatMap((item) => [batchId, item.userid, item.name, item.dept, item.position, item.leaderDept]))

    const upsertPlaceholders = remote.map(() => '(?, ?, ?, ?, ?, \'active\', NOW(), NOW(), NULL)').join(', ')
    await connection.query(mysqlQueryOptions(`
      INSERT INTO wxuser
        (userid, name, dept, position, leader_dept, status, first_seen_at, last_seen_at, inactive_at)
      VALUES ${upsertPlaceholders}
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        dept = VALUES(dept),
        position = VALUES(position),
        leader_dept = VALUES(leader_dept),
        status = 'active',
        first_seen_at = COALESCE(first_seen_at, NOW()),
        last_seen_at = NOW(),
        inactive_at = NULL
    `), remote.flatMap((item) => [item.userid, item.name, item.dept, item.position, item.leaderDept]))
  }

  const employmentEvents = [
    ...newlyDiscovered.map((item) => ({ ...item, eventType: 'hire' })),
    ...diff.missing.map((item) => ({ ...item, eventType: 'leave' })),
  ]
  if (employmentEvents.length) {
    const placeholders = employmentEvents.map(() => '(?, ?, NOW(), ?, ?, ?, ?)').join(', ')
    await connection.query(mysqlQueryOptions(`
      INSERT INTO wxuser_employment_event
        (userid, event_type, event_at, name, dept, position, sync_batch_id)
      VALUES ${placeholders}
    `), employmentEvents.flatMap((item) => [
      item.userid,
      item.eventType,
      item.name,
      item.dept,
      item.position,
      batchId,
    ]))
  }

  if (diff.missing.length) {
    const placeholders = diff.missing.map(() => '?').join(', ')
    await connection.query(mysqlQueryOptions(`
      UPDATE wxuser
      SET status = 'inactive', inactive_at = NOW()
      WHERE status = 'active' AND userid IN (${placeholders})
    `), diff.missing.map((item) => item.userid))
  }

  await connection.query(mysqlQueryOptions(`
    UPDATE wxuser_sync_batch
    SET status = 'completed', finished_at = NOW(),
        added_count = ?, updated_count = ?, unchanged_count = ?, missing_count = ?
    WHERE batch_id = ?
  `), [diff.added.length, diff.updated.length, diff.unchanged.length, diff.missing.length, batchId])

  return {
    batchId,
    addedCount: diff.added.length,
    updatedCount: diff.updated.length,
    unchangedCount: diff.unchanged.length,
    missingCount: diff.missing.length,
    remoteCount: remote.length,
    hireCount: newlyDiscovered.length,
    leaveCount: diff.missing.length,
  }
}

function isApplyRequest(event: H3Event): boolean {
  const value = String(getQuery(event).apply || '').toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

export async function handleWecomEmployeeSync(event: H3Event, applyOverride?: boolean) {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)

  const apply = applyOverride ?? isApplyRequest(event)
  try {
    const summary = await runWecomEmployeeSync({
      apply,
      operator: authenticated.session,
      auditEvent: event,
    })
    return apiSuccess(summary, apply ? '企业微信通讯录同步完成' : '企业微信通讯录预览完成')
  } catch (error) {
    console.error('[NitroWecomSync] employee sync failed:', errorMessage(error, '企业微信通讯录同步失败'))
    return apiError(errorMessage(error, '企业微信通讯录同步失败'), 500)
  }
}

export async function runWecomEmployeeSync(options: {
  apply: boolean
  operator: WecomSyncOperator
  auditEvent?: H3Event
}): Promise<WecomContactSyncSummary> {
  const pool = getMysqlPool()
  const config = await loadWecomContactConfig(pool)
  const remote = await fetchWecomContacts(config)
  const existing = await readLocalWecomContacts(pool)
  assertSafeRemoteSnapshot(remote, existing)
  const diff = diffWecomContacts(remote, existing)

  if (!options.apply) return summarizeWecomContactDiff(remote, diff, 'preview')

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const persisted = await applyWecomContactSync(connection, diff, remote, options.operator)
    if (options.auditEvent) {
      await insertOperationLog(options.auditEvent, connection, options.operator, '企业微信通讯录同步', 2, {
        batchId: persisted.batchId,
        remoteCount: persisted.remoteCount,
        addedCount: persisted.addedCount,
        updatedCount: persisted.updatedCount,
        unchangedCount: persisted.unchangedCount,
        missingCount: persisted.missingCount,
        hireCount: persisted.hireCount,
        leaveCount: persisted.leaveCount,
      })
    }
    await connection.commit()
    return {
      ...summarizeWecomContactDiff(remote, diff, 'apply', persisted.batchId),
      hireCount: persisted.hireCount,
      leaveCount: persisted.leaveCount,
    }
  } catch (error) {
    try { await connection.rollback() } catch { /* preserve the original failure */ }
    throw error
  } finally {
    connection.release()
  }
}

export async function runAutomaticWecomEmployeeSync(): Promise<WecomContactSyncSummary | null> {
  const pool = getMysqlPool()
  const lockConnection = await pool.getConnection()
  const lockName = 'ctk:wecom:employee-sync'
  try {
    const [rows] = await lockConnection.query<RowDataPacket[]>(mysqlQueryOptions('SELECT GET_LOCK(?, 0) AS acquired'), [lockName])
    if (Number(rows[0]?.acquired || 0) !== 1) return null
    return await runWecomEmployeeSync({
      apply: true,
      operator: { userId: 0, userName: '自动同步' },
    })
  } finally {
    try {
      await lockConnection.query(mysqlQueryOptions('SELECT RELEASE_LOCK(?)'), [lockName])
    } catch (error) {
      console.error('[NitroWecomSync] release scheduler lock failed:', errorMessage(error, 'unknown error'))
    }
    lockConnection.release()
  }
}
