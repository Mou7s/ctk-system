import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  queryK3Inventory: vi.fn(),
}))

vi.mock('h3', () => ({ getRouterParam: vi.fn(() => 'mat-001') }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/stock-document.ts', () => ({ queryK3Inventory: state.queryK3Inventory }))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro local stock staging source inventory route', () => {
  let staging

  beforeEach(async () => {
    state.authenticated = { session: { userId: 1 } }
    state.queryK3Inventory.mockReset()
    staging = (await import('../../server/routes/prod-api/tk_custom/localStock/staging/material/[materialCode].get.ts')).default
  })

  it('returns selectable inventory from every warehouse, location, and lot', async () => {
    state.queryK3Inventory.mockResolvedValue({ rows: [
      {
        materialNumber: 'MAT-001', materialName: '物料一', specification: 'SOT-23/6R', unitNumber: 'PCS',
        stockNumber: 'CTK10', stockName: '塑封成品仓', stockLocationNumber: 'A-01', stockLocationName: 'SOT-23成品仓', stockLocationFlexId: '100008', lotNumber: 'LOT-1', baseQty: 9, availableQty: 9,
      },
      {
        materialNumber: 'MAT-001', materialName: '物料一', specification: 'SOT-23/6R', unitNumber: 'PCS',
        stockNumber: 'CTK11', stockName: 'OEM成品仓', stockLocationNumber: 'B-01', stockLocationName: 'OEM成品仓', stockLocationFlexId: '100011', lotNumber: 'LOT-2', baseQty: 4, availableQty: 4,
      },
      {
        materialNumber: 'MAT-001', materialName: '物料一', specification: 'SOT-23/6R', unitNumber: 'PCS',
        stockNumber: 'WH-OTHER', stockName: '其他仓', stockLocationNumber: 'C-01', stockLocationName: '其他库位', stockLocationFlexId: '100010', lotNumber: 'LOT-3', baseQty: 8, availableQty: 8,
      },
    ] })

    await expect(staging({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: [
        expect.objectContaining({
          materialCode: 'MAT-001', sourceStockNumber: 'CTK10', sourceStockLocationNumber: 'A-01',
          sourceStockLocationFlexId: '100008', lotNumber: 'LOT-1', sourceOnHandQty: 9, sourceAvailableQty: 9, transferableQty: 9,
        }),
        expect.objectContaining({
          materialCode: 'MAT-001', sourceStockNumber: 'CTK11', sourceStockLocationNumber: 'B-01',
          sourceStockLocationFlexId: '100011', lotNumber: 'LOT-2', transferableQty: 4,
        }),
        expect.objectContaining({
          materialCode: 'MAT-001', sourceStockNumber: 'WH-OTHER', sourceStockLocationNumber: 'C-01',
          sourceStockLocationFlexId: '100010', lotNumber: 'LOT-3', transferableQty: 8,
        }),
      ],
    })
    expect(state.queryK3Inventory).toHaveBeenCalledWith({ material: 'MAT-001', availableOnly: true, pageNum: 1, pageSize: 100 })
  })

  it('does not subtract previous successful transfers from current K3 availability', async () => {
    state.queryK3Inventory.mockResolvedValue({ rows: [{
      materialNumber: 'MAT-001', materialName: '物料一', specification: 'SOT-23/6R', unitNumber: 'PCS',
      stockNumber: 'CTK20', stockName: '塑封成品仓1', stockLocationNumber: '1', stockLocationName: 'SOD-123成品仓', stockLocationFlexId: '100008', lotNumber: '1', baseQty: 6, availableQty: 6,
    }] })

    const response = await staging({})
    expect(response.data[0]).toEqual(expect.objectContaining({ sourceOnHandQty: 6, sourceAvailableQty: 6, transferableQty: 6, transferredQty: 0 }))
  })

  it('keeps authentication explicit', async () => {
    state.authenticated = null
    await expect(staging({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.queryK3Inventory).not.toHaveBeenCalled()
  })
})
