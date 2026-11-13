import { describe, expect, it, vi } from 'vitest'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'

// 入离职汇总页依赖 Nuxt 自动导入：测试里手动补齐同名全局，保证顶层 script 可执行。
globalThis.ref ??= ref
globalThis.reactive ??= reactive
globalThis.computed ??= computed
globalThis.onMounted ??= onMounted
globalThis.onBeforeUnmount ??= onBeforeUnmount
globalThis.useToast ??= () => ({ add: vi.fn() })
globalThis.defineStore ??= defineStore
setActivePinia(createPinia())

describe('Employment summary page', () => {
  it('compiles the template and top-level script', async () => {
    const page = await import('../../app/pages/tk_custom/employmentSummary/index.vue')
    expect(page?.default).toBeDefined()
  })
})
