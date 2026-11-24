import { listNpi, getNpi, getNpiOptions, getNpiSummary } from '../../../../utils/npi-read'

export default defineEventHandler((event) => {
  const path = event.path || ''
  if (path.includes('summary')) return getNpiSummary(event)
  if (path.includes('options')) return getNpiOptions(event)
  if (event.context.params?.id) return getNpi(event)
  return listNpi(event)
})
