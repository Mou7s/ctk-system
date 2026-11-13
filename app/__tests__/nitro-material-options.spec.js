import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: { keyword: '稳压', limit: '20' },
  request: {
    input: vi.fn(),
    query: vi.fn(),
  },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => ({ session: { userId: 1 } })),
}))

vi.mock('../../server/utils/sqlserver.ts', () => ({
  sqlStringParameter: vi.fn((request, name, value) => request.input(name, value)),
  sqlBigIntParameter: vi.fn((request, name, value) => request.input(name, value)),
  queryK3SqlServer: vi.fn(async (execute) => {
    const result = await execute(state.request)
    return result.recordset || []
  }),
}))

describe('K3 material options', () => {
  let listMaterialOptions
  let resolveMaterialById

  beforeAll(async () => {
    ({ listMaterialOptions, resolveMaterialById } = await import('../../server/utils/material-read.ts'))
  })

  beforeEach(() => {
    state.query = { keyword: '稳压', limit: '20' }
    state.request.input.mockReset().mockReturnValue(state.request)
    state.request.query.mockReset().mockResolvedValue({
      recordset: [{ id: 101, number: 'N101010002', name: '稳压管芯片', spec: '5V' }],
    })
  })

  it('reads query parameters through H3 and returns matching options', async () => {
    const result = await listMaterialOptions({ context: {} })

    expect(result).toEqual({
      code: 200,
      msg: '操作成功',
      data: [{
        value: 'N101010002',
        id: 101,
        label: 'N101010002 稳压管芯片',
        name: '稳压管芯片',
        spec: '5V',
        number: 'N101010002',
        packageName: '5V',
        minPackCount: null,
        ctkMpn: '稳压管芯片',
      }],
    })
    expect(state.request.input).toHaveBeenCalledWith('kw', '稳压')
    expect(state.request.input).toHaveBeenCalledWith('kwLike', '%稳压%')
    expect(state.request.query.mock.calls[0][0]).toContain('FinishedGroups AS')
    expect(state.request.query.mock.calls[0][0]).toContain("g.FNUMBER IN ('A', 'B', 'D')")
    expect(state.request.query.mock.calls[0][0]).toContain("m.FNUMBER LIKE 'N%'")
  })

  it('filters out non-N prefixed legacy/forbidden material numbers', async () => {
    state.request.query.mockResolvedValueOnce({
      recordset: [
        { id: 101, number: 'AD0010001', name: 'LL4148', spec: 'LL-34' },
        { id: 102, number: 'NAD0010001', name: 'LL4148', spec: 'LL-34' },
      ],
    })
    const result = await listMaterialOptions({ context: {} })
    expect(result.data).toHaveLength(1)
    expect(result.data[0].number).toBe('NAD0010001')
  })

  it('resolves the canonical Kingdee name and specification by material id', async () => {
    const result = await resolveMaterialById(101)

    expect(result).toEqual({
      id: 101,
      number: 'N101010002',
      name: '稳压管芯片',
      spec: '5V',
      packageName: '5V',
      minPackCount: null,
    })
    expect(state.request.input).toHaveBeenCalledWith('materialId', 101)
    expect(state.request.query.mock.calls[0][0]).toContain("m.FDOCUMENTSTATUS = 'C'")
    expect(state.request.query.mock.calls[0][0]).toContain("m.FFORBIDSTATUS = 'A'")
    expect(state.request.query.mock.calls[0][0]).toContain("m.FNUMBER LIKE 'N%'")
  })
})
