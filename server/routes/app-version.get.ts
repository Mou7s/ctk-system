import { defineEventHandler, setHeader } from 'h3'

// Public, minimal metadata only; never send runtime configuration or credentials.
export default defineEventHandler(event => {
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')
  return { version: String(useRuntimeConfig(event).public.releaseVersion || '') }
})
