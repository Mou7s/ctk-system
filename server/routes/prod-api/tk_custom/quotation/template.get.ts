import { defineEventHandler, setHeader } from 'h3'
import type { RowDataPacket } from 'mysql2/promise'
import { getAuthSession, hasPermission } from '../../../../utils/auth'
import { getMysqlPool, mysqlQueryOptions } from '../../../../utils/mysql'
import { apiError } from '../../../../utils/response'
import {
  buildQuotationTemplateWorkbook,
  QUOTATION_DEFAULT_PAYMENT_TERM,
  QUOTATION_PERMISSIONS,
  readQuotationTemplateBytes,
} from '../../../../utils/quotation'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, QUOTATION_PERMISSIONS.list)) return apiError('没有权限下载模板', 403)

  try {
    const fileBytes = await readQuotationTemplateBytes()
    if (!fileBytes) return apiError('模板文件不存在或读取失败', 500)

    // 下载给业务员的模板：联系人姓名与联系方式来自当前业务员；三项条款预填网页默认值，均可在 Excel 下拉选择或手动修改。
    let salespersonEmail = ''
    let salespersonPhone = ''
    if (authenticated.session.userId) {
      const [userRows] = await getMysqlPool().query<RowDataPacket[]>(
        mysqlQueryOptions('SELECT email, phonenumber FROM sys_user WHERE user_id = ? LIMIT 1'),
        [authenticated.session.userId],
      )
      if (userRows[0]) {
        salespersonEmail = userRows[0].email || ''
        salespersonPhone = userRows[0].phonenumber || ''
      }
    }

    const exportHeader = {
      salesperson_name: authenticated.session.user.nickName || authenticated.session.user.userName,
      salesperson_email: salespersonEmail,
      salesperson_phone: salespersonPhone,
      delivery_terms: 'EXW Dongguan',
      validity: '30days',
      payment_term: QUOTATION_DEFAULT_PAYMENT_TERM,
    }

    const buffer = buildQuotationTemplateWorkbook(fileBytes, exportHeader, [], { blank: true })
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('外贸销售报价单模板.xlsx')}`)
    return buffer
  } catch (error) {
    return apiError('模板文件不存在或读取失败', 500)
  }
})
