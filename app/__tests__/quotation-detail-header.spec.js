import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue')
const source = readFileSync(PAGE, 'utf8')

describe('报价单详情弹窗顶部信息展示', () => {
  it('桌面端详情栏展示国家、客户性质、报价日期、基准汇率', () => {
    expect(source).toContain('国家：<b class="text-highlighted font-normal">{{ detail.country || \'-\' }}</b>')
    expect(source).toContain('客户性质：<b class="text-highlighted font-normal">{{ detail.customerStyle || \'-\' }}</b>')
    expect(source).toContain('报价日期：<b class="text-highlighted font-normal">{{ detail.quoteDate || \'-\' }}</b>')
    expect(source).toContain('基准汇率：<b class="text-highlighted font-normal">{{ detail.rate ?? \'-\' }}</b>')
  })

  it('手机端详情栏展示国家、客户性质、报价日期、基准汇率', () => {
    // 手机端在 phoneInfoOpen 展开条中有单独的 grid 渲染
    expect(source).toMatch(/<div>国家：<b class="text-highlighted font-normal">\{\{\s*detail\.country\s*\|\|\s*'-'\s*\}\}<\/b><\/div>/)
    expect(source).toMatch(/<div>客户性质：<b class="text-highlighted font-normal">\{\{\s*detail\.customerStyle\s*\|\|\s*'-'\s*\}\}<\/b><\/div>/)
    expect(source).toMatch(/<div>报价日期：<b class="text-highlighted font-normal">\{\{\s*detail\.quoteDate\s*\|\|\s*'-'\s*\}\}<\/b><\/div>/)
    expect(source).toMatch(/<div>基准汇率：<b class="text-highlighted font-normal">\{\{\s*detail\.rate\s*\?\?\s*'-'\s*\}\}<\/b><\/div>/)
  })

  it('详情弹窗 TkQuotationGrid 绑定了汇率 :rate', () => {
    expect(source).toContain(':rate="Number(detail?.rate) || 6.7"')
  })

  it('openRecord 具备从明细首行安全回退国家、客户性质、报价日期、基准汇率的保护', () => {
    expect(source).toContain("country: response.data?.country || firstLine.country || ''")
    expect(source).toContain("customerStyle: response.data?.customerStyle || firstLine.customerStyle || ''")
    expect(source).toContain("quoteDate: response.data?.quoteDate || firstLine.quoteDate || ''")
    expect(source).toContain("rate: response.data?.rate ?? firstLine.rate ?? null")
  })
})
