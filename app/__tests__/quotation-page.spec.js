import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

// 直接编译 SFC（不 import 页面），避免把 store/插件整条链拖进测试进程。
const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/quotation/index.vue')

describe('Quotation page SFC', () => {
  it('compiles the template and the script setup block', () => {
    const source = readFileSync(PAGE, 'utf8')
    const { descriptor, errors } = parse(source, { filename: PAGE })
    expect(errors).toEqual([])

    const script = compileScript(descriptor, { id: 'quotation' })
    // 草稿编辑链路必须保持接线：入口函数 + PUT 接口
    expect(script.content).toContain('openEdit')
    expect(script.content).toContain('updateQuotation')
    // 提交时间范围走统一日期区间控件，且区间值在请求前展开成服务端 from/to
    expect(script.content).toContain('withDateRange')
    expect(script.content).toContain('listDateRange')
    expect(script.content).toContain('TkQuotationAnalysis')
    expect(script.content).toContain('listQuotations(withDateRange(listQuery, listDateRange.value))')
    expect(source).toContain('<TkQuotationAnalysis v-else')
    expect(script.bindings.updateReviewPrice).toBeTruthy()

    const template = compileTemplate({
      source: descriptor.template.content,
      filename: PAGE,
      id: 'quotation',
      compilerOptions: { bindingMetadata: script.bindings },
    })
    expect(template.errors).toEqual([])
  })

  it('uses unified TkDateRangePicker instead of duplicated calendar popovers or raw inputs', () => {
    const source = readFileSync(PAGE, 'utf8') + readFileSync(resolve(process.cwd(), 'app/packages/ui/TkQuotationAnalysis.vue'), 'utf8')
    // 列表筛选 + 分析筛选各一处
    const pickers = source.match(/<TkDateRangePicker\b/g) || []
    expect(pickers).toHaveLength(2)
    expect((source.match(/<UCalendar[^>]*>/g) || []).filter((tag) => /\brange\b/.test(tag))).toHaveLength(0)
    // 裸 <input type="date"> 一旦回归（原生控件无预设、占两列）这条守卫就该变红
    expect(source.match(/type="date"/g) || []).toHaveLength(0)
  })

  it('reports template errors when the SFC is broken', () => {
    const broken = '<template><div><span></div></template>\n<script setup>\nconst a = 1\n</script>\n'
    const { descriptor, errors } = parse(broken, { filename: 'broken.vue' })
    const template = compileTemplate({ source: descriptor.template.content, filename: 'broken.vue', id: 'broken' })
    expect(errors.length + template.errors.length).toBeGreaterThan(0)
  })
})
