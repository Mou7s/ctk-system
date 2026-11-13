import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parse } from '@vue/compiler-sfc'
import { createDomesticQuotationApi } from '../packages/api/modules/domesticQuotation.js'
import {
  DOMESTIC_QUOTATION_COLUMNS,
  DOMESTIC_QUOTATION_INITIAL_LINES,
  groupDomesticQuotationsByCustomer,
} from '../packages/ui/domesticQuotationGrid.js'

const PAGE = resolve(process.cwd(), 'app/pages/tk_custom/domesticQuotation/index.vue')
const GRID = resolve(process.cwd(), 'app/packages/ui/TkDomesticQuotationGrid.vue')
const CREATE_ROUTE = resolve(process.cwd(), 'server/routes/prod-api/tk_custom/quotation/domestic/index.post.ts')
const UPDATE_ROUTE = resolve(process.cwd(), 'server/routes/prod-api/tk_custom/quotation/domestic/[id].put.ts')
const pageSource = readFileSync(PAGE, 'utf8')
const gridSource = readFileSync(GRID, 'utf8')
const createRouteSource = readFileSync(CREATE_ROUTE, 'utf8')
const updateRouteSource = readFileSync(UPDATE_ROUTE, 'utf8')
const { descriptor, errors } = parse(pageSource, { filename: PAGE })

describe('内贸报价单在线表格', () => {
  it('页面和网格 SFC 可解析并绑定在线录入', () => {
    expect(errors).toEqual([])
    expect(descriptor.template?.ast).toBeTruthy()
    expect(pageSource).toContain('<TkDomesticQuotationGrid')
    expect(pageSource).toContain('v-model="formData.lines"')
    expect(pageSource).toContain("submitCurrent('save')")
    expect(pageSource).toContain("submitCurrent('submit')")
    expect(gridSource).toContain('@paste.capture="handlePaste"')
    expect(gridSource).toContain('DOMESTIC_QUOTATION_INITIAL_LINES')
  })

  it('客户物料名称在前、CTK物料名称在后，保留必填校验并允许动态扩展', () => {
    expect(DOMESTIC_QUOTATION_INITIAL_LINES).toBe(5)
    expect(DOMESTIC_QUOTATION_COLUMNS[0]).toMatchObject({ key: 'customerMaterialName', label: '客户物料名称' })
    expect(DOMESTIC_QUOTATION_COLUMNS[1]).toMatchObject({ key: 'ctkMpn', label: 'CTK物料名称', required: true })
    expect(DOMESTIC_QUOTATION_COLUMNS.map(({ key }) => key)).toEqual([
      'customerMaterialName', 'ctkMpn', 'packageName', 'originalPriceRmb', 'minPackCount', 'remark',
    ])
    expect(pageSource).toContain("inputMode.value === 'form' ? submitOnlineForm(action) : uploadFile(action)")
    expect(pageSource).toContain('updateDomesticQuotationDraft(editingId.value, payload)')
    expect(pageSource).toContain('createDomesticQuotation(payload)')
  })

  it('registers JSON create and draft update API methods at the domestic routes', async () => {
    const request = vi.fn(async () => ({ code: 200 }))
    const api = createDomesticQuotationApi(request)

    await api.createDomesticQuotation({ action: 'save' })
    await api.updateDomesticQuotationDraft(17, { action: 'save' })

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/tk_custom/quotation/domestic', method: 'post', data: { action: 'save' },
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/tk_custom/quotation/domestic/17', method: 'put', data: { action: 'save' },
    })
    expect(createRouteSource).toContain('createDomesticQuotation')
    expect(updateRouteSource).toContain('updateDomesticQuotationDraft')
  })

  it('默认按客户收录折叠展示，支持一键切换按单据平铺及展开/收起', () => {
    expect(pageSource).toContain("const listViewMode = ref('customer')")
    expect(pageSource).toContain("switchListViewMode('customer')")
    expect(pageSource).toContain("switchListViewMode('flat')")
    expect(pageSource).toContain('按客户收录')
    expect(pageSource).toContain('按单据平铺')
    expect(pageSource).toContain('data-customer-group-row')
    expect(pageSource).toContain('data-customer-quote-row')
    expect(pageSource).not.toContain('查看最新')

    const grouped = groupDomesticQuotationsByCustomer([
      {
        id: 101,
        quoteNo: 'CTK2026110204',
        customerName: ' 示例客户甲有限公司 ',
        salespersonName: '业务员甲',
        lineCount: 1,
        status: 'APPROVED',
        statusLabel: '已通过',
        updateTime: '2026-11-02 13:53:34',
      },
      {
        id: 102,
        quoteNo: 'CTK2026110303',
        customerName: '示例客户乙科技有限公司',
        salespersonName: '业务员甲',
        lineCount: 2,
        status: 'PENDING_FINAL',
        statusLabel: '待终审',
        canFinalReview: true,
        updateTime: '2026-11-03 11:55:29',
      },
      {
        id: 103,
        quoteNo: 'CTK2026102910',
        customerName: '示例客户甲有限公司',
        salespersonName: '业务员乙',
        lineCount: 3,
        status: 'APPROVED',
        statusLabel: '已通过',
        updateTime: '2026-11-03 06:19:49',
      },
      {
        id: 104,
        quoteNo: 'CTK2026110101',
        customerName: '',
        salespersonName: '业务员甲',
        lineCount: 1,
        status: 'DRAFT',
        statusLabel: '草稿',
        updateTime: '2026-11-01 09:00:00',
      },
    ])

    expect(grouped).toHaveLength(3)
    expect(grouped[0]).toMatchObject({
      customerName: '示例客户乙科技有限公司',
      quoteCount: 1,
      totalLineCount: 2,
      latestQuoteNo: 'CTK2026110303',
      pendingCount: 1,
      reviewableCount: 1,
    })
    expect(grouped[1]).toMatchObject({
      customerName: '示例客户甲有限公司',
      quoteCount: 2,
      totalLineCount: 4,
      salespersonNames: ['业务员乙', '业务员甲'],
      latestQuoteNo: 'CTK2026102910',
      latestUpdateTime: '2026-11-03 06:19:49',
      approvedCount: 2,
    })
    expect(grouped[1].quotations.map((q) => q.quoteNo)).toEqual(['CTK2026102910', 'CTK2026110204'])
    expect(grouped[2]).toMatchObject({
      customerName: '未填写',
      quoteCount: 1,
      totalLineCount: 1,
    })
  })
})
