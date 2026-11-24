import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function readEnvFile(name) {
  return fs.readFileSync(path.join(appRoot, name), 'utf8')
}

function resolveProductionEnvLikeBuildScript() {
  const saved = {}
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  }

  try {
    return loadEnv('production', appRoot)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      process.env[key] = value
    }
  }
}

describe('production API prefix safeguards', () => {
  it('all environments use the Nitro /prod-api entrypoint', () => {
    expect(readEnvFile('.env.production')).toContain("VITE_APP_BASE_API = '/prod-api'")
    expect(readEnvFile('.env.development')).toContain("VITE_APP_BASE_API = '/prod-api'")
  })

  it('build-prod loadEnv path resolves to /prod-api when VITE_* is cleared', () => {
    const productionEnv = resolveProductionEnvLikeBuildScript()
    expect(productionEnv.VITE_APP_BASE_API).toBe('/prod-api')
    expect(productionEnv.VITE_APP_ENV).toBe('production')
  })

  it('nuxt.config.ts exists and has proper configuration', () => {
    const nuxtConfig = readEnvFile('nuxt.config.ts')
    expect(nuxtConfig).toContain('defineNuxtConfig')
    expect(nuxtConfig).toContain('ssr: true')
    expect(nuxtConfig).toContain('VITE_APP_BASE_API')
  })
})
