import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 日期选择统一走 Nuxt UI 的 UCalendar（UPopover 触发 + computed 字符串⇄CalendarDate 转换），
 * 原生 <UInput type="date"> 不许回归（2026-09-22 定版：同功能优先用 Nuxt UI 原生件）。
 */
const PAGES = [
  'tk_custom/npi/index.vue',
  'tk_custom/supplierAccess/index.vue',
  'tk_custom/sampleTest/index.vue',
  'tk_custom/kucun/index.vue',
  'tk_custom/pd/index.vue',
  'tk_custom/talent_pool/index.vue',
  'tk_custom/wmsInbound/index.vue',
  'tk_custom/wmsOutbound/index.vue',
  'tk_custom/employmentSummary/index.vue',
  'tk_custom/processOutputReport/index.vue',
]

function sourceOf(rel) {
  return readFileSync(resolve(process.cwd(), 'app/pages', rel), 'utf8')
}

describe('日期选择统一 UCalendar（原生 type="date" 不回归）', () => {
  for (const rel of PAGES) {
    it(`${rel} 用 UCalendar 且模板里没有 type="date"`, () => {
      const source = sourceOf(rel)
      expect(source).toContain('<UCalendar')
      // 只数模板里的裸日期输入；脚本注释里提到 type="date" 不算
      const template = source.slice(0, source.indexOf('<script'))
      expect(template.match(/type="date"/g) || []).toHaveLength(0)
    })
  }

  it('胶囊筛选（npi/supplierAccess/sampleTest）连原生日期样式残渣也清掉了', () => {
    for (const rel of ['tk_custom/npi/index.vue', 'tk_custom/supplierAccess/index.vue', 'tk_custom/sampleTest/index.vue']) {
      const source = sourceOf(rel)
      expect(source).not.toContain('capsule-input')
      expect(source).not.toContain('calendar-picker-indicator')
    }
  })

  it('故意写坏的页面必须被抓到（反向断言：守卫不是空的）', () => {
    const fake = '<template><div><UInput v-model="d" type="date" /></div></template>'
    expect(fake.match(/type="date"/g) || []).toHaveLength(1)
  })
})
