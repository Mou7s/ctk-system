import { getNpiOptions, getNpiSummary } from '../../../../utils/npi-read'
export default defineEventHandler((event) => {
  if (event.path.includes('summary')) return getNpiSummary(event)
  return getNpiOptions(event)
})
