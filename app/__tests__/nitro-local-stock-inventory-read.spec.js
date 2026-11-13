import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  executeBillQuery: vi.fn(),
}))

vi.mock('h3', () => ({ getRouterParam: vi.fn(() => 'mat-001') }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/k3.ts', () => ({
  executeBillQuery: state.executeBillQuery,
  K3CloudError: class K3CloudError extends Error {},
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro local stock material inventory route', () => {
  let inventory

  beforeEach(async () => {
    state.authenticated = { session: { userId: 1 } }
    state.executeBillQuery.mockReset()
    inventory = (await import('../../server/routes/prod-api/tk_custom/localStock/staging/inventory/[materialCode].get.ts')).default
  })

  it('aggregates K3 inventory by warehouse, location, and lot', async () => {
    state.executeBillQuery
      .mockResolvedValueOnce([
        ['100008', '100008', '封装库位', 'A1', 'A1'],
        ['100011', '100011', 'OEM库位', 'B1', 'B1'],
      ])
      .mockResolvedValueOnce([
        ['MAT-001', '物料一', 'SOT-23/6R', 'PCS', '个', '100', 'CTK10', '塑封成品仓', '', 'LOT-1', '2.000', '0', 'KCZT01_SYS', '可用', '0', 'A-01', 'A-01', '', ''],
        ['MAT-001', '物料一', 'SOT-23/6R', 'PCS', '个', '100', 'CTK10', '塑封成品仓', '', 'LOT-1', '3.000', '0', 'KCZT01_SYS', '可用', '1.500', 'A-01', 'A-01', '', ''],
      ])

    await expect(inventory({})).resolves.toEqual({
      code: 200,
      msg: '操作成功',
      data: expect.objectContaining({
        materialCode: 'MAT-001',
        materialName: '物料一',
        totalOnHandQty: 5,
        totalAvailableQty: 3.5,
        rowCount: 1,
        rows: [{
          stockNumber: 'CTK10',
          stockName: '塑封成品仓',
          stockLocationNumber: 'A-01',
          stockLocationName: 'A-01',
          lotNumber: 'LOT-1',
          onHandQty: 5,
          availableQty: 3.5,
        }],
      }),
    })
    expect(state.executeBillQuery.mock.calls[1][0]).toMatchObject({
      formId: 'STK_Inventory',
      filterString: "FStockOrgId.FNumber='100' and FMaterialId.FNumber='MAT-001' and FBaseQty<>0",
    })
  })

  it('keeps authentication and K3 failures explicit', async () => {
    state.authenticated = null
    await expect(inventory({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
    expect(state.executeBillQuery).not.toHaveBeenCalled()
  })
})
