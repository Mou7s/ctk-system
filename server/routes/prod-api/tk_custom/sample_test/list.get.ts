import { listSampleTest, getSampleTest, getSampleTestOptions, getSampleTestSummary } from '../../../../utils/sample-test-read'

export default defineEventHandler((event) => {
  const path = event.path || ''
  if (path.includes('summary')) return getSampleTestSummary(event)
  if (path.includes('options')) return getSampleTestOptions(event)
  if (event.context.params?.id) return getSampleTest(event)
  return listSampleTest(event)
})
