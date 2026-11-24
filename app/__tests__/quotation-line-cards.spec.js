// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  buildQuotationGridSource,
  buildQuotationLineCardModel,
  buildQuotationLineCardModels,
  computeQuotationUsdKpcs,
  isQuotationZeroPriceValue,
  QUOTATION_LINE_CARD_DETAIL_FIELDS,
  QUOTATION_LINE_CARD_METRICS,
} from '@ctk-system/shared'
import TkQuotationLineCards from '../packages/ui/TkQuotationLineCards.vue'

/**
 * 手机端明细卡片（初审人在手机上核对价格用）：
 * - 首屏必须看得见 单价(人民币/千只)、汇率、千只美元价、数量、交期，不用横滑 24 列；
 *   1只美元价是千只价 ÷1000 的派生值，收进「全部字段」；
 * - 0 价要显眼（初审就是拦这个），口径与页面 isZeroPrice、网格显示三处一致；
 * - 美元两列必须复用 quotationGrid 的换算，卡片不能自己算一套。
 */

function line(overrides = {}) {
  return {
    id: 1,
    lineNo: 1,
    quoteDate: '2026-09-17',
    country: '中国',
    customerStyle: '终端',
    quoteTo: '深圳客户A',
    endUser: '终端B',
    application: '电源',
    manufacturer: 'Vishay',
    manufacturerMpn: 'SMBJ22CA',
    qty: 5,
    unit: 'kpcs',
    ctkMpn: 'AD-3.0SMDJ22CA',
    packageName: 'SMC',
    dieSize: '5寸',
    spqReel: '3000',
    originalPriceRmb: 12.4444,
    rate: 7.1,
    leadTime: '1-30days',
    datasheet: 'https://example.com/1.pdf',
    remark: '备注A',
    ...overrides,
  }
}

function metricOf(model, key) {
  return model.metrics.find((metric) => metric.key === key)
}

describe('报价明细手机卡片：展示模型', () => {
  it('首屏 5 格：单价/千只、汇率、千只美元价、数量、交期；1只美元价收进全部字段', () => {
    expect(QUOTATION_LINE_CARD_METRICS.map((metric) => metric.key)).toEqual([
      'originalPriceRmb', 'rate', 'usdKpcs', 'qty', 'leadTime',
    ])
    // 标签必须写「/千只」：模板列本来就是 KPCS 价，只写「单价(人民币)」会被读成单只价
    expect(QUOTATION_LINE_CARD_METRICS[0].label).toBe('单价(人民币/千只)')
    expect(QUOTATION_LINE_CARD_DETAIL_FIELDS.map((field) => field.key)).toContain('usdPc')
    expect(QUOTATION_LINE_CARD_DETAIL_FIELDS.map((field) => field.key)).toContain('remark')
    // 型号/封装/数量已在卡片头部与首屏，不重复放进「全部字段」
    expect(QUOTATION_LINE_CARD_DETAIL_FIELDS.map((field) => field.key)).not.toContain('ctkMpn')
  })

  it('价格按项目口径格式化：单价两位小数、1只美元价五位小数（在后者的展开字段里）', () => {
    const model = buildQuotationLineCardModel(line())
    expect(model.title).toBe('AD-3.0SMDJ22CA')
    expect(model.packageName).toBe('SMC')
    expect(metricOf(model, 'originalPriceRmb').value).toBe('￥12.44')
    expect(metricOf(model, 'rate').value).toBe('7.1')
    expect(metricOf(model, 'usdKpcs').value).toBe('$1.75')
    expect(metricOf(model, 'qty').value).toBe('5 kpcs')
    expect(metricOf(model, 'leadTime').value).toBe('1-30days')
    expect(model.detailFields.find((field) => field.key === 'usdPc').value).toBe('$0.00175')
    expect(model.hasZeroPrice).toBe(false)
  })

  it('数量加千分位（手机上一个 80000 看不出几个零）', () => {
    expect(metricOf(buildQuotationLineCardModel(line({ qty: 80000 })), 'qty').value).toBe('80,000 kpcs')
  })

  it('美元两列复用 quotationGrid 的换算，不自己算一套', () => {
    const source = buildQuotationGridSource([line()])[0]
    const model = buildQuotationLineCardModel(line())
    expect(metricOf(model, 'usdKpcs').value).toBe(`$${source.usdKpcs}`)
    expect(model.detailFields.find((field) => field.key === 'usdPc').value).toBe(`$${source.usdPc}`)
    expect(computeQuotationUsdKpcs(line().originalPriceRmb, line().rate)).toBe(1.75)
  })

  it('0 价被单独标出来，且分清是哪一列', () => {
    const model = buildQuotationLineCardModel(line({ originalPriceRmb: 0 }))
    expect(model.hasZeroPrice).toBe(true)
    // 徽章要短：一行放不下「单价(人民币/千只) 为 0」
    expect(model.zeroPriceLabels).toEqual(['单价'])
    expect(metricOf(model, 'originalPriceRmb').zero).toBe(true)

    const zeroRate = buildQuotationLineCardModel(line({ rate: 0 }))
    expect(zeroRate.zeroPriceLabels).toEqual(['汇率'])
  })

  it('0 价口径与其他地方一致：空值/非数值不算 0 价', () => {
    expect(isQuotationZeroPriceValue(0)).toBe(true)
    expect(isQuotationZeroPriceValue('0')).toBe(true)
    expect(isQuotationZeroPriceValue(null)).toBe(false)
    expect(isQuotationZeroPriceValue('')).toBe(false)
    expect(isQuotationZeroPriceValue(undefined)).toBe(false)
    // 未核价 = 空值，不能冒充「0 价」
    expect(buildQuotationLineCardModel(line({ originalPriceRmb: null })).hasZeroPrice).toBe(false)
  })

  it('缺汇率时美元价显示「待算」，未核价显示「待核价」，空值统一「未填」', () => {
    const model = buildQuotationLineCardModel(line({ rate: null, originalPriceRmb: null, leadTime: '', qty: null }))
    expect(metricOf(model, 'rate').value).toBe('未填')
    expect(metricOf(model, 'rate').missing).toBe(true)
    expect(metricOf(model, 'usdKpcs').value).toBe('待算')
    expect(metricOf(model, 'originalPriceRmb').value).toBe('待核价')
    // 交期与数量为空也写「未填」——原来交期写 '-'、汇率写「未填」，两种写法让人以为是两种状态
    expect(metricOf(model, 'leadTime').value).toBe('未填')
    expect(metricOf(model, 'qty').value).toBe('未填')
    expect(model.detailFields.find((field) => field.key === 'usdPc').value).toBe('未填')
  })

  it('卡片 key 优先用行 id，方便展开状态跟着行走', () => {
    expect(buildQuotationLineCardModel(line()).key).toBe('id:1')
    expect(buildQuotationLineCardModel(line({ id: null })).key).toBe('line:1')
    expect(buildQuotationLineCardModels([line(), line({ id: 2, lineNo: 2 })])).toHaveLength(2)
    expect(buildQuotationLineCardModels(null)).toEqual([])
  })
})

describe('报价明细手机卡片：组件渲染', () => {
  it('渲染型号、封装与首屏价格，其余字段默认收起', () => {
    const wrapper = mount(TkQuotationLineCards, { props: { lines: [line()] } })
    const html = wrapper.html()
    expect(html).toContain('AD-3.0SMDJ22CA')
    expect(html).toContain('SMC')
    expect(html).toContain('￥12.44')
    expect(html).toContain('$1.75')
    // 密排用短标签，完整口径挂在 title 上（一行两列才放得下）
    expect(html).toContain('单价/千只')
    expect(html).toContain('title="单价(人民币/千只)"')
    expect(html).toContain('千只$')
    // 展开后才出现的字段默认不渲染（手机上不要一次糊 21 列）
    expect(html).not.toContain('规格书')
    wrapper.unmount()
  })

  it('密排：5 条字段走「标签左 / 值右」的行式布局，不再一条一个边框格子', () => {
    const wrapper = mount(TkQuotationLineCards, { props: { lines: [line()] } })
    const html = wrapper.html()
    // 原来每条指标是一个带边框的格子（rounded-xl border …/60 px-2.5 py-2），一张卡被撑到 1/4 屏
    expect(html).not.toContain('border-app-border/60 px-2.5 py-2')
    // 卡片本身也收到 px-2.5 py-2（原来 p-3.5）+ 卡片间距 gap-1.5
    expect(html).toContain('bg-app-surface px-2.5 py-2')
    expect(html).toContain('flex flex-col gap-1.5 px-2.5 pt-2.5 pb-6')
    expect(html.split('items-baseline justify-between').length - 1).toBe(QUOTATION_LINE_CARD_METRICS.length)
    // 奇数条时最后一条（交期）占满整行
    expect(html).toContain('col-span-2')
    wrapper.unmount()
  })

  it('0 价给出警示徽章文案', () => {
    const wrapper = mount(TkQuotationLineCards, { props: { lines: [line({ originalPriceRmb: 0 })] } })
    expect(wrapper.html()).toContain('单价=0')
    wrapper.unmount()
  })

  it('展开「全部字段」后显示模板其余列', async () => {
    const wrapper = mount(TkQuotationLineCards, { props: { lines: [line()] } })
    // 展开开关现在挂在标题行上（整行可点）
    wrapper.vm.$.setupState.toggle('id:1')
    await wrapper.vm.$nextTick()
    const html = wrapper.html()
    expect(html).toContain('规格书')
    expect(html).toContain('终端客户')
    expect(html).toContain('备注A')
    // 派生值在展开区里也要能看到
    expect(html).toContain('1只单价(美元)')
    wrapper.unmount()
  })

  it('没有明细时给出空态文案，不渲染空白卡片框', () => {
    const wrapper = mount(TkQuotationLineCards, { props: { lines: [], emptyText: '没有匹配的明细行' } })
    expect(wrapper.html()).toContain('没有匹配的明细行')
    expect(wrapper.findAll('li')).toHaveLength(0)
    wrapper.unmount()
  })
})
