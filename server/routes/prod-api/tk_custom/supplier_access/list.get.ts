import { listSupplierAccess, getSupplierAccess, getSupplierAccessOptions, getSupplierAccessSummary } from '../../../../utils/supplier-access-read'
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (path.includes('summary')) return getSupplierAccessSummary(event)
  if (path.includes('options')) return getSupplierAccessOptions(event)
  if (event.context.params?.id) return getSupplierAccess(event)
  return listSupplierAccess(event)
})
