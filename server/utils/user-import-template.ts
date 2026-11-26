import { setResponseHeader, type H3Event } from 'h3'
import { loadXlsx } from './lazy-deps'
import { getAuthSession } from './auth'
import { apiError } from './response'

export const USER_IMPORT_TEMPLATE_HEADERS = [
  '部门编号', '登录名称', '用户名称', '用户邮箱', '手机号码', '用户性别', '帐号状态',
]

export async function exportUserImportTemplate(event: H3Event) {
  if (!await getAuthSession(event)) return apiError('登录状态已过期', 401)

  const XLSX = await loadXlsx()
  const worksheet = XLSX.utils.aoa_to_sheet([USER_IMPORT_TEMPLATE_HEADERS])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '用户数据')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('用户数据.xlsx')}`)
  setResponseHeader(event, 'Access-Control-Expose-Headers', 'Content-Disposition')
  return buffer
}
