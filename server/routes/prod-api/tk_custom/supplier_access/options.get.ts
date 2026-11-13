import { getSupplierAccessOptions, getSupplierAccessSummary } from '../../../../utils/supplier-access-read'
export default defineEventHandler((event) => {
  if (event.path.includes('summary')) return getSupplierAccessSummary(event)
  return getSupplierAccessOptions(event)
})
