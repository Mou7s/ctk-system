import { getQuery, type H3Event } from 'h3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { extractEndUserMatchProfile, isQuotationEndUserConflict } from '@ctk-system/shared'
import { canViewAllQuotations, QUOTATION_PERMISSIONS } from './quotation'
import { hasPermission } from './auth'
import { mysqlQueryOptions } from './mysql'
import { queryText, withReadSession } from './read'
import { apiError, apiSuccess } from './response'

export interface EndUserConflictItem {
  id: number
  quoteNo: string
  endUser: string
  salespersonId: number
  salespersonName: string
  quoteDate: string | null
  status: string
  statusLabel: string
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_INITIAL: '待初审',
  PENDING_SECOND: '待二审',
  PENDING_FINAL: '待终审',
  RETURNED: '已退回',
  APPROVED: '已通过',
  RETURNED_TO_INITIAL: '已退回',
  RETURNED_TO_SECOND: '已退回',
}

/**
 * 查询某一个外贸终端客户是否与其他业务员的历史报价单存在冲突。
 * - 只比对外贸报价单（business_type = 'FOREIGN'）
 * - 排除已删除（DELETED）与未提交草稿（DRAFT）
 * - 排除当前业务员本人（salesperson_id <> targetSalespersonId）与当前正在编辑/查看的单据（q.id <> excludeId）
 * - 兼容单头 q.end_user 与历史 21 列模板明细行 l.end_user
 */
export async function findQuotationEndUserConflicts(
  pool: Pool,
  endUser: string,
  targetSalespersonId: number,
  excludeId = 0,
): Promise<EndUserConflictItem[]> {
  const inputProfile = extractEndUserMatchProfile(endUser)
  if (!inputProfile.valid || !Number.isSafeInteger(targetSalespersonId) || targetSalespersonId <= 0) {
    return []
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    mysqlQueryOptions(`
      SELECT
        q.id,
        q.quote_no AS quoteNo,
        TRIM(q.end_user) AS headerEndUser,
        (
          SELECT TRIM(l.end_user)
          FROM tk_quotation_line l
          WHERE l.quotation_id = q.id AND TRIM(COALESCE(l.end_user, '')) <> ''
          ORDER BY l.line_no ASC, l.id ASC
          LIMIT 1
        ) AS lineEndUser,
        q.salesperson_id AS salespersonId,
        q.salesperson_name AS salespersonName,
        DATE_FORMAT(COALESCE(q.quote_date, q.create_time), '%Y-%m-%d') AS quoteDate,
        q.status
      FROM tk_quotation q
      WHERE q.business_type = 'FOREIGN'
        AND q.status NOT IN ('DELETED', 'DRAFT')
        AND q.salesperson_id <> ?
        AND q.id <> ?
        AND (
          TRIM(COALESCE(q.end_user, '')) <> ''
          OR EXISTS (
            SELECT 1 FROM tk_quotation_line l2
            WHERE l2.quotation_id = q.id AND TRIM(COALESCE(l2.end_user, '')) <> ''
          )
        )
      ORDER BY COALESCE(q.update_time, q.create_time) DESC, q.id DESC
    `),
    [targetSalespersonId, excludeId],
  )

  const conflicts: EndUserConflictItem[] = []
  for (const row of rows) {
    const candidateEndUser = String(row.headerEndUser || row.lineEndUser || '').trim()
    if (!candidateEndUser) continue
    if (isQuotationEndUserConflict(inputProfile, candidateEndUser)) {
      const status = String(row.status || '')
      conflicts.push({
        id: Number(row.id),
        quoteNo: String(row.quoteNo || ''),
        endUser: candidateEndUser,
        salespersonId: Number(row.salespersonId),
        salespersonName: String(row.salespersonName || ''),
        quoteDate: row.quoteDate ? String(row.quoteDate) : null,
        status,
        statusLabel: STATUS_LABELS[status] || status,
      })
    }
  }

  return conflicts
}

/**
 * HTTP 处理：前端录入或上传 Excel 时实时检查终端客户冲突。
 * - 普通业务员视角：仅返回 hasConflict、conflictCount、matchedEndUsers，隐去其他业务员姓名与单号
 * - 审核人/管理员视角（canViewAllQuotations）：额外返回完整 conflicts 列表（含业务员、单号、状态、日期）
 */
export function checkQuotationEndUserConflict(event: H3Event) {
  return withReadSession(event, 'QuotationEndUserConflict', async (session, pool) => {
    if (
      !hasPermission(session, QUOTATION_PERMISSIONS.list)
      && !hasPermission(session, QUOTATION_PERMISSIONS.upload)
    ) {
      return apiError('没有报价单访问权限', 403)
    }

    const query = getQuery(event) as Record<string, unknown>
    const endUser = queryText(query.endUser)
    const excludeId = Number(query.excludeId || query.id || 0)
    if (!Number.isSafeInteger(excludeId) || excludeId < 0) {
      return apiError('报价单ID不符合规范', 400)
    }

    let targetSalespersonId = session.userId
    if (excludeId > 0) {
      const [headers] = await pool.query<RowDataPacket[]>(
        mysqlQueryOptions('SELECT salesperson_id FROM tk_quotation WHERE id = ? AND business_type = ? LIMIT 1'),
        [excludeId, 'FOREIGN'],
      )
      if (headers[0]?.salesperson_id) {
        targetSalespersonId = Number(headers[0].salesperson_id)
      }
    }

    const conflicts = await findQuotationEndUserConflicts(pool, endUser, targetSalespersonId, excludeId)
    const matchedEndUsers = Array.from(new Set(conflicts.map((item) => item.endUser)))
    const canViewAll = canViewAllQuotations(session, 'FOREIGN')

    return apiSuccess({
      hasConflict: conflicts.length > 0,
      conflictCount: conflicts.length,
      matchedEndUsers,
      conflicts: canViewAll ? conflicts : [],
    })
  }, '终端客户冲突检测失败，请稍后重试')
}
