import type { H3Event } from 'h3'
import { getHeader, readBody } from 'h3'
import type { AuthSession } from './auth'
import { mysqlQueryOptions } from './mysql'
import { apiSuccess } from './response'
import { insertOperationLog, queryOne, text, withIdempotentWriteSession, writeFail } from './write'
import { normalizeLocationCode } from './wms-structure'

const WMS_LOCATION_EDIT_PERMISSION = 'tk_custom:wmsStructure:edit'

export async function updateWmsLocationStatus(event: H3Event) {
  const rawBody = await readBody(event)
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody as Record<string, any> : {}
  const requestKey = text(getHeader(event, 'idempotency-key')) || text(body.requestId) || crypto.randomUUID()
  return withIdempotentWriteSession(
    event,
    'wms:location-status',
    WMS_LOCATION_EDIT_PERMISSION,
    requestKey,
    { ...body, requestId: requestKey },
    async (session: AuthSession, connection) => {
      const locationCode = normalizeLocationCode(body.locationCode)
      if (!locationCode) writeFail('库位编码不能为空')
      const status = text(body.status)
      if (status !== '0' && status !== '1') writeFail('库位状态不正确')
      const existing = await queryOne(connection, 'SELECT location_code FROM wms_location WHERE location_code = ?', [locationCode])
      if (!existing) writeFail(`库位不存在：${locationCode}`)
      if (status === '1') {
        const occupied = await queryOne(connection, `
          SELECT COUNT(1) AS occupied
          FROM kucun k JOIN wms_location l ON l.location_code = ?
          WHERE k.status = 'C' AND k.kd_chuku_number > 0 AND (
            k.kd_cangku_name LIKE CONCAT('%/', l.location_code, '%')
            OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', l.row_no, '-%')
            OR k.kd_cangku_name LIKE CONCAT('%/', l.zone_code, '-', LPAD(l.row_no, 2, '0'), '-%')
            OR k.kd_kuwei_name = l.location_code OR k.kd_kuwei_name = l.kingdee_stock_location_number
          )
        `, [locationCode])
        if (Number(occupied?.occupied || 0) > 0) writeFail(`库位仍有库存，不能停用：${locationCode}`)
      }
      await connection.query(mysqlQueryOptions('UPDATE wms_location SET status = ?, update_by = ?, update_time = NOW() WHERE location_code = ?'), [status, session.userName, locationCode])
      const response = apiSuccess()
      await insertOperationLog(event, connection, session, 'WMS库位状态', 2, { locationCode, status, requestId: requestKey }, response)
      return response
    },
    '更新库位状态失败',
  )
}
