import { getSampleTestOptions, getSampleTestSummary } from '../../../../utils/sample-test-read'
export default defineEventHandler((event) => {
  if (event.path.includes('summary')) return getSampleTestSummary(event)
  return getSampleTestOptions(event)
})
