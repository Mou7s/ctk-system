import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/pages/tk_custom/quotation/index.vue', 'utf8')
describe('手机外贸报价录入的滚动布局', () => {
  it('单头超出视口时可滚动，明细不会被 flex 压成零高度', () => {
    expect(parse(source).errors).toEqual([])
    const body = source.match(/class="quotation-entry-body ([^"]+)"/)[1]
    const lines = source.match(/class="quotation-entry-lines ([^"]+)"/)[1]
    expect(body).toContain('overflow-y-auto')
    expect(body).toContain('sm:overflow-hidden')
    expect(lines).toContain('min-h-[24rem]')
    expect(lines).toContain('shrink-0')
    expect(lines).toContain('sm:min-h-0')
    expect(lines).toContain('sm:flex-1')
    expect(source).toContain('supports-[height:100dvh]:h-[92dvh]')
  })
})
