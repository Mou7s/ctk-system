import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { mysqlQueryOptions } from './mysql'
import { writeFail } from './write'

export function quotationNumberDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (name: string) => parts.find(p => p.type === name)!.value
  return `${part('year')}${part('month')}${part('day')}`
}

/** Caller must hold a transaction through quotation insertion. Row lock serializes allocators. */
export async function allocateQuotationNumber(connection: PoolConnection, businessType: 'DOMESTIC' | 'FOREIGN', now = new Date()): Promise<string> {
  if (businessType !== 'DOMESTIC' && businessType !== 'FOREIGN') writeFail('报价单业务类型无效', 400)
  const day = quotationNumberDate(now)
  const start = businessType === 'DOMESTIC' ? 0 : 50
  const limit = businessType === 'DOMESTIC' ? 49 : 99
  await connection.execute(mysqlQueryOptions(`
    INSERT INTO tk_quotation_daily_number (number_date, business_type, sequence_value) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE sequence_value = sequence_value
  `), [day, businessType, start])
  const [rows] = await connection.query<RowDataPacket[]>(mysqlQueryOptions(
    'SELECT sequence_value FROM tk_quotation_daily_number WHERE number_date = ? AND business_type = ? FOR UPDATE',
  ), [day, businessType])
  const next = Number(rows[0].sequence_value) + 1
  if (!Number.isSafeInteger(next) || next <= start || next > limit) writeFail(`当天${businessType === 'DOMESTIC' ? '内贸' : '外贸'}报价单编号已达到号段上限，请联系管理员`, 409)
  await connection.execute(mysqlQueryOptions(
    'UPDATE tk_quotation_daily_number SET sequence_value = ? WHERE number_date = ? AND business_type = ?',
  ), [next, day, businessType])
  return `CTK${day}${String(next).padStart(2, '0')}`
}
