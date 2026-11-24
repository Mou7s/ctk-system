import type { H3Event } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { getMysqlPool, mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { bodyOf, insertOperationLog, text, withWriteSession, writeFail } from './write'

export const OVERDUE_AR_REMARK_MAX_LENGTH = 500
const PERMISSION = 'tk_custom:customerOverdueAr:list'

export interface OverdueArRemarkRecord {
  custCode: string
  currencyCode: string
  remark: string
  updatedBy: string
  updatedAt: string | null
}

export function overdueArRemarkKey(custCode: unknown, currencyCode: unknown): string {
  const code = String(custCode ?? '').trim().toUpperCase()
  const currency = String(currencyCode ?? '').trim().toUpperCase()
  return `${code}::${currency}`
}

function isMissingRemarkTableError(error: unknown): boolean {
  const err = error as { code?: unknown; errno?: unknown } | null
  return err?.code === 'ER_NO_SUCH_TABLE' || Number(err?.errno) === 1146
}

export async function readOverdueArRemarkMap(): Promise<Map<string, OverdueArRemarkRecord>> {
  try {
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(mysqlQueryOptions(
      "SELECT cust_code, currency_code, remark, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at FROM tk_overdue_ar_remark",
    ))
    const map = new Map<string, OverdueArRemarkRecord>()
    for (const row of rows) {
      const custCode = String(row.cust_code ?? '').trim().toUpperCase()
      const currencyCode = String(row.currency_code ?? '').trim().toUpperCase()
      const remark = String(row.remark ?? '').trim()
      if (!custCode || !remark) continue
      map.set(overdueArRemarkKey(custCode, currencyCode), {
        custCode,
        currencyCode,
        remark,
        updatedBy: String(row.updated_by ?? '').trim(),
        updatedAt: row.updated_at ? String(row.updated_at).trim() : null,
      })
    }
    return map
  } catch (error) {
    if (isMissingRemarkTableError(error)) {
      console.warn('[OverdueArRemark] tk_overdue_ar_remark 表不存在，跳过备注读取')
      return new Map()
    }
    throw error
  }
}

export function overdueArRemarkSave(event: H3Event) {
  return withWriteSession(event, 'customerOverdueAr/remark', PERMISSION, async (session, connection) => {
    if (session.userId !== 1) writeFail('仅管理员可维护逾期备注', 403)

    const body = await bodyOf(event)
    const custCode = text(body.custCode).toUpperCase()
    if (!custCode || custCode.length > 64) writeFail('客户编码格式不正确', 400)

    const currencyCode = text(body.currencyCode).toUpperCase()
    if (currencyCode.length > 32) writeFail('币种编码格式不正确', 400)

    const remark = text(body.remark)
    if (remark.length > OVERDUE_AR_REMARK_MAX_LENGTH) {
      writeFail(`备注长度不能超过${OVERDUE_AR_REMARK_MAX_LENGTH}个字符`, 400)
    }

    try {
      if (!remark) {
        await connection.query(
          mysqlQueryOptions('DELETE FROM tk_overdue_ar_remark WHERE cust_code = ? AND currency_code = ?'),
          [custCode, currencyCode],
        )
        await insertOperationLog(event, connection, session, '客户逾期备注', 3, {
          custCode,
          currencyCode,
          remark: '',
        })
        return apiSuccess({
          custCode,
          currencyCode,
          remark: '',
          updatedBy: session.userName,
          updatedAt: null,
        }, '备注已清空')
      }

      await connection.query(
        mysqlQueryOptions(`
          INSERT INTO tk_overdue_ar_remark (cust_code, currency_code, remark, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            remark = VALUES(remark),
            updated_by = VALUES(updated_by),
            updated_at = NOW()
        `),
        [custCode, currencyCode, remark, session.userName],
      )

      const [savedRows] = await connection.query<RowDataPacket[]>(
        mysqlQueryOptions("SELECT DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at FROM tk_overdue_ar_remark WHERE cust_code = ? AND currency_code = ? LIMIT 1"),
        [custCode, currencyCode],
      )
      const updatedAt = savedRows[0]?.updated_at ? String(savedRows[0].updated_at).trim() : null

      await insertOperationLog(event, connection, session, '客户逾期备注', 2, {
        custCode,
        currencyCode,
        remark,
      })

      return apiSuccess({
        custCode,
        currencyCode,
        remark,
        updatedBy: session.userName,
        updatedAt,
      }, '备注已保存')
    } catch (error) {
      if (isMissingRemarkTableError(error)) {
        writeFail('备注表 tk_overdue_ar_remark 尚未创建，请先导入建表 SQL', 503)
      }
      throw error
    }
  }, '保存客户逾期备注失败')
}
