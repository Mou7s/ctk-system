import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { generateRandomDigitPassword } from '../packages/shared/pinyinInitials.js'

globalThis.ref ??= ref
globalThis.reactive ??= reactive
globalThis.computed ??= computed
globalThis.onMounted ??= onMounted
globalThis.onBeforeUnmount ??= onBeforeUnmount
globalThis.useToast ??= () => ({ add: vi.fn() })

vi.mock('@/api/tk_custom/wireBondCard', () => ({
  listWireBondUsers: vi.fn(async () => ({ code: 200, rows: [] })),
  generatePasswords: vi.fn(async () => ({ code: 200, data: {} })),
  updatePassword: vi.fn(async () => ({ code: 200, data: {} })),
}))

describe('Wire bond card print page', () => {
  it('compiles the template and top-level script correctly', async () => {
    const page = await import('../pages/tk_custom/wireBondCard/index.vue')
    expect(page?.default).toBeDefined()
  })

  it('completely removes account display and only renders password barcode on the label', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/pages/tk_custom/wireBondCard/index.vue'), 'utf8')
    expect(source).not.toContain('renderBarcode(previewTarget.userid')
    expect(source).not.toContain('renderBarcode(user.userid')
    expect(source).not.toContain('账号 USER:')
    expect(source).toContain('renderBarcode(previewTarget.password')
    expect(source).toContain('renderBarcode(user.password')
  })

  it('generates non-sequential 6-digit random numeric passwords', () => {
    const pwd = generateRandomDigitPassword(6)
    expect(pwd).toMatch(/^[1-9]\d{5}$/)
    expect(pwd).not.toBe('123456')
    expect(pwd).not.toBe('654321')
  })
})
