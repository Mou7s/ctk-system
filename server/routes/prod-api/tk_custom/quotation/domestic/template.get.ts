import { defineEventHandler, setHeader } from 'h3'
import { getAuthSession, hasPermission } from '../../../../../utils/auth'
import { apiError } from '../../../../../utils/response'
import {
  buildDomesticQuotationTemplateWorkbook,
  DOMESTIC_QUOTATION_PERMISSIONS,
  readQuotationTemplateBytes,
} from '../../../../../utils/quotation'

export default defineEventHandler(async (event) => {
  const authenticated = await getAuthSession(event)
  if (!authenticated) return apiError('登录状态已过期', 401)
  if (!hasPermission(authenticated.session, DOMESTIC_QUOTATION_PERMISSIONS.list)) return apiError('没有权限下载内贸报价单模板', 403)

  try {
    const fileBytes = await readQuotationTemplateBytes('内贸销售报价单模板.xlsx')
    if (!fileBytes) return apiError('内贸报价单模板文件不存在或读取失败', 500)
    const now = new Date()
    const quoteDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const buffer = buildDomesticQuotationTemplateWorkbook(fileBytes, {
      contact_text: authenticated.session.user.nickName || authenticated.session.user.userName,
      quote_date: quoteDate,
    }, [], { blank: true })
    setHeader(event, 'content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent('内贸销售报价单模板.xlsx')}`)
    return buffer
  } catch (error) {
    console.error('[NitroQuotation:domestic-template]', error instanceof Error ? error.message : 'unknown error')
    return apiError('内贸报价单模板生成失败', 500)
  }
})
