import { describe, expect, it } from 'vitest'

import {
  summarizeProcessReportQuantities,
  validateProcessReportDraft,
} from '../../packages/shared/processReportDraft.js'

const operation = { canReport: true, remainingQty: 100 }

describe('process report draft validation', () => {
  it('sums all report quantity categories', () => {
    expect(summarizeProcessReportQuantities({
      qualifiedQty: '10',
      processFailQty: 2,
      materialFailQty: 1,
      reworkQty: '',
      wastageQty: 0.5,
    })).toMatchObject({ total: 13.5 })
  })

  it('rejects an empty report', () => {
    expect(validateProcessReportDraft(operation, {})).toMatchObject({
      ok: false,
      message: '请至少填写一项本次汇报数量',
    })
  })

  it('rejects negative and invalid quantities', () => {
    expect(validateProcessReportDraft(operation, { qualifiedQty: -1 }).ok).toBe(false)
    expect(validateProcessReportDraft(operation, { qualifiedQty: 'not-a-number' }).ok).toBe(false)
  })

  it('rejects a report above the remaining quantity', () => {
    expect(validateProcessReportDraft(operation, { qualifiedQty: 100.001 })).toMatchObject({
      ok: false,
      message: '本次汇报总量 100.001 超过剩余可报数量 100',
    })
  })

  it('accepts a positive report within the remaining quantity', () => {
    expect(validateProcessReportDraft(operation, { qualifiedQty: 80 })).toMatchObject({
      ok: true,
      total: 80,
    })
  })

  it('rejects completed operations', () => {
    expect(validateProcessReportDraft({ canReport: false, remainingQty: 0 }, { qualifiedQty: 1 })).toMatchObject({
      ok: false,
      message: '请先选择一道可汇报工序',
    })
  })
})
