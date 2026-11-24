import { describe, expect, it, vi, beforeEach } from 'vitest'

const query = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/sqlserver', () => ({ queryK3SqlServer: query }))
vi.mock('../../server/utils/k3', () => ({ executeBillQuery: vi.fn() }))

import { finishedInventoryOnly, finishedInventoryMaterials, inventoryMaterialPredicate } from '../../server/utils/inventory-visibility'

describe('finished inventory visibility', () => {
  beforeEach(() => { query.mockReset() })

  it('restricts sales and followup even with another inventory or manager role', () => {
    for (const role of ['domestic_trade_sales', 'foreign_trade_sales', 'domestic_merchandiser']) {
      expect(finishedInventoryOnly({ userId: 2, roles: [role, 'inventory_viewer', 'sales_manager'] })).toBe(true)
    }
    expect(finishedInventoryOnly({ userId: 1, roles: ['foreign_trade_sales'] })).toBe(false)
    expect(finishedInventoryOnly({ userId: 2, roles: ['warehouse_keeper'] })).toBe(false)
  })

  it('loads exact material codes by the actual recursive group hierarchy', async () => {
    const request = { query: vi.fn(async () => [{ number: 'FIN-1' }, { number: 'FIN-1' }]) }
    query.mockImplementation(work => work(request))
    expect(await finishedInventoryMaterials()).toEqual(['FIN-1'])
    const sql = request.query.mock.calls[0][0]
    expect(sql).toContain("FNUMBER IN ('A', 'B', 'D')")
    expect(sql).toContain('c.FPARENTID = p.FID')
    expect(sql).toContain('g.FID = m.FMATERIALGROUP')
  })

  it('fails closed when the classification database is unavailable', async () => {
    query.mockRejectedValue(new Error('offline'))
    await expect(finishedInventoryMaterials()).rejects.toThrow('offline')
  })

  it('denies empty classifications and parameterizes exact local material codes', () => {
    expect(inventoryMaterialPredicate([]).sql).toBe('1 = 0')
    expect(inventoryMaterialPredicate()).toEqual({ sql: '', params: [] })
    expect(inventoryMaterialPredicate(["x' OR 1=1", 'N0001'])).toEqual({ sql: 'kd_wlbm IN (?,?)', params: ["x' OR 1=1", 'N0001'] })
  })
})
