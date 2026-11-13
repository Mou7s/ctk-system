import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ rows: [], query: vi.fn() }))
vi.mock('../../server/utils/sqlserver.ts', () => ({
  queryK3SqlServer: vi.fn(async (handler) => { await handler({ input: vi.fn(), query: state.query }); return state.rows }),
  sqlBigIntParameter: vi.fn(), sqlStringParameter: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => ({ userId: 1 })) }))
vi.mock('h3', () => ({ getQuery: vi.fn(() => ({ keyword: 'CTK-1' })) }))
import { listMaterialOptions, resolveMaterialById } from '../../server/utils/material-read.ts'

describe('金蝶物料最小包装数查询', () => {
  beforeEach(() => { vi.clearAllMocks(); state.rows = [{ id: 1, number: 'NA1', name: 'CTK-1', spec: 'SOT-23/环保', minPackCount: 3000 }] })
  it('候选接口与精确物料查询返回采购资料包装数', async () => {
    const response = await listMaterialOptions({})
    expect(response.data[0]).toMatchObject({ ctkMpn: 'CTK-1', packageName: 'SOT-23', minPackCount: 3000 })
    expect(await resolveMaterialById(1)).toMatchObject({ minPackCount: 3000 })
    for (const [sql] of state.query.mock.calls) {
      expect(sql).toContain('p.FMINPACKCOUNT AS minPackCount')
      expect(sql).toContain('LEFT JOIN T_BD_MATERIALPURCHASE p ON p.FMATERIALID = m.FMATERIALID')
      expect(sql).toContain("m.FNUMBER LIKE 'N%'")
    }
  })
  it.each([null, 0])('无有效包装数 %s 时返回空值', async (minPackCount) => {
    state.rows[0].minPackCount = minPackCount
    expect((await listMaterialOptions({})).data[0].minPackCount).toBeNull()
  })
})
