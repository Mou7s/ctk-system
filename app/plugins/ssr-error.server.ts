export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:error', (error) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error)
    console.error(`[NuxtSSR] render failed:\n${message}`)
  })
})
