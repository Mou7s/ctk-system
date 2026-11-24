import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

// 与 quotation-page.spec 同套路：只编译 SFC、不 import 页面，
// 避免把 store/插件整条链拖进测试进程（矩阵与抽屉的交互由各自 mount 型 spec 验证）。
const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/wip/index.vue')
const SOURCE = readFileSync(PAGE, 'utf8')

function compilePage() {
  const { descriptor, errors } = parse(SOURCE, { filename: PAGE })
  const script = compileScript(descriptor, { id: 'wip' })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: PAGE,
    id: 'wip',
    compilerOptions: { bindingMetadata: script.bindings },
  })
  return { descriptor, errors, script, template }
}

describe('车间半成品在制页面（单视图：封装 × 工序矩阵）', () => {
  it('compiles the template and the script setup block', () => {
    const { errors, script, template } = compilePage()

    expect(errors).toEqual([])
    expect(template.errors).toEqual([])
    expect(script.content).toContain('WipPackageMatrix')
    expect(script.content).toContain('WipDetailSheet')
  })

  it('has no view tabs any more — the matrix is the only view', () => {
    expect(SOURCE).not.toContain('viewModeOptions')
    expect(SOURCE).not.toContain("viewMode === 'list'")
    // 旧的「工序 → 物料 → 流程单」三层树整块撤掉（明细改由抽屉承载）
    expect(SOURCE).not.toContain('wip-table material-table')
    expect(SOURCE).not.toContain('wip-table detail-table')
    expect(SOURCE).not.toContain('expandAll')
    // 页面上那个分段控件只是「塑封 / 玻封」工艺切换，不是视图切换
    expect(SOURCE).toContain('<TkSegmented')
    expect(SOURCE).toContain('label="封装工艺"')
  })

  it('splits 玻封 and 塑封 with a two-option switch, defaulting to 塑封', () => {
    // 只有两个选项，没有「全部」：两条线的工序不同，混在一张矩阵里列头会互相串
    expect(SOURCE).toContain('packageType: \'塑封\'')
    const options = SOURCE.slice(SOURCE.indexOf('const PACKAGE_TYPE_OPTIONS'), SOURCE.indexOf('function handlePackageType'))
    expect(options).toContain("label: '塑封'")
    expect(options).toContain("label: '玻封'")
    expect(options).not.toContain('全部')
    // 切换要重新取数（服务端按工艺过滤，矩阵两轴、合计、导出都跟着变）
    const handler = SOURCE.slice(SOURCE.indexOf('function handlePackageType'), SOURCE.indexOf('const hasKeyword'))
    expect(handler).toContain('queryParams.value.packageType = next')
    expect(handler).toContain('fetchReport()')
    // 抽屉跟着当前工艺走
    expect(SOURCE).toContain('packageType: queryParams.value.packageType')
  })

  it('loads a full-plant matrix on mount without asking for a filter', () => {
    expect(SOURCE).toContain('onMounted(fetchReport)')
    // 首屏不再被「至少一个筛选条件」拦住
    expect(SOURCE).not.toContain('请至少填写一个筛选条件后查询')
    const fetchBody = SOURCE.slice(SOURCE.indexOf('function fetchReport()'), SOURCE.indexOf('function handleExport()'))
    expect(fetchBody).toContain('getWipList({ ...queryParams.value })')
    expect(fetchBody).not.toContain('hasQueryFilter')
    // 首屏等待时给骨架（形状与矩阵一致），不是空白
    expect(SOURCE).toContain('<WipMatrixSkeleton v-if="!queried"')
  })

  it('keeps exactly one search field — the old five-input toolbar and the checkbox are gone', () => {
    // 页面上只留一个搜索框（订单 / 流程单 / 物料），封装与工序靠点矩阵的行列头下钻
    const inputs = SOURCE.match(/<input\b/g) || []
    expect(inputs).toHaveLength(1)
    expect(SOURCE).toContain('placeholder="搜索订单 / 流程单 / 物料"')
    expect(SOURCE).toContain('queryParams.keyword')

    // 旧工具条的 5 个输入框、复选框、查询/重置按钮全部撤掉
    expect(SOURCE).not.toContain('query-input-main')
    expect(SOURCE).not.toContain('query-input-sub')
    expect(SOURCE).not.toContain('UCheckbox')
    expect(SOURCE).not.toContain('只看有量')
    expect(SOURCE).not.toContain('handlereset')
    expect(SOURCE).not.toContain('重置')
    expect(SOURCE).not.toContain('class="query-form"')
  })

  it('shows no methodology prose — only the title, the numbers and the matrix', () => {
    // 这些解释段落都被判定为「没人看的」，一并去掉
    expect(SOURCE).not.toContain('scopeNote')
    expect(SOURCE).not.toContain('total-banner')
    expect(SOURCE).not.toContain('已隐藏在制 ≤ 0 的行')
    expect(SOURCE).not.toContain('矩阵覆盖当前筛选')
    expect(SOURCE).not.toContain('点格子看')
    expect(SOURCE).not.toContain('工序计划已下发但一道都没汇报的单')
    // 保留下来的只有标题 + 一行数字摘要
    expect(SOURCE).toContain('车间半成品在制')
    expect(SOURCE).toContain('wip-summary__value')
  })

  it('opens the detail sheet from a cell or an axis header instead of switching views', () => {
    expect(SOURCE).toContain('@drill-cell="openCellDetail"')
    expect(SOURCE).toContain('@drill-axis="openAxisDetail"')
    expect(SOURCE).toContain(':open="detailOpen"')
    expect(SOURCE).toContain(':filters="detailFilters"')
    // 抽屉的筛选 = 当前搜索 + 被点的那一格
    expect(SOURCE).toContain('packageName: detailScope.value.packageName')
    expect(SOURCE).toContain('processName: detailScope.value.processName')
    expect(SOURCE).toContain('keyword: queryParams.value.keyword')
    // 格子里的合计含负值行，明细就必须让点开的人看见那些行；
    // 但在制为 0 的行（料已走完、不在这个工序上）不进清单
    expect(SOURCE).toContain('onlyPositive: false')
    expect(SOURCE).toContain('hideZeroWip: true')
  })

  it('feeds the matrix from the full filtered set and gates the export on a search', () => {
    expect(SOURCE).toContain(':matrix="matrixData"')
    expect(SOURCE).toContain('report.value.matrix')
    expect(SOURCE).toContain(':transposed="transposed"')
    expect(SOURCE).toContain('@set-transposed="transposed = $event"')
    // 全量导出会把几万行写进 Excel，导出按钮必须先有关键词
    expect(SOURCE).toContain(':disabled="!canExport"')
    expect(SOURCE).toContain('const canExport = computed(() => hasKeyword.value)')
  })
})
