import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  query: {},
  sqlCalls: [],
  rowsResult: [],
  countResult: [{ total: 0 }],
  customQuery: null,
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  mysqlQueryOptions: vi.fn((sql) => ({ sql, timeout: 10000 })),
  getMysqlPool: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual('h3')
  return {
    ...actual,
    getQuery: vi.fn(() => state.query),
  }
})

vi.mock('../../server/utils/read.ts', async () => {
  const actual = await vi.importActual('../../server/utils/read.ts')
  return {
    ...actual,
    withReadSession: vi.fn(async (_event, _tag, handler) => {
      const fakeSession = { userId: 1, roles: ['admin'], permissions: ['*:*:*'] }
      const fakePool = {
        query: vi.fn(async (opts, params) => {
          const sqlText = typeof opts === 'string' ? opts : String(opts?.sql || '')
          state.sqlCalls.push({ sql: sqlText, params: params || [] })
          if (typeof state.customQuery === 'function') {
            return [state.customQuery(sqlText, params || []), []]
          }
          if (sqlText.includes('COUNT(*) AS total')) {
            return [state.countResult, []]
          }
          return [state.rowsResult, []]
        }),
      }
      return handler(fakeSession, fakePool)
    }),
  }
})

import { getItAssetOptions, isItAssetLoadAllQuery, listItAssets } from '../../server/utils/it-asset-read.ts'

describe('IT asset read utils & all=true support', () => {
  beforeEach(() => {
    state.query = {}
    state.sqlCalls = []
    state.rowsResult = []
    state.countResult = [{ total: 0 }]
  })

  it('recognizes all=true/1/yes and rejects false/0/empty/undefined', () => {
    expect(isItAssetLoadAllQuery({ all: 'true' })).toBe(true)
    expect(isItAssetLoadAllQuery({ all: 'TRUE' })).toBe(true)
    expect(isItAssetLoadAllQuery({ all: '1' })).toBe(true)
    expect(isItAssetLoadAllQuery({ all: 'yes' })).toBe(true)
    expect(isItAssetLoadAllQuery({ all: true })).toBe(true)

    expect(isItAssetLoadAllQuery({})).toBe(false)
    expect(isItAssetLoadAllQuery({ all: undefined })).toBe(false)
    expect(isItAssetLoadAllQuery({ all: '' })).toBe(false)
    expect(isItAssetLoadAllQuery({ all: 'false' })).toBe(false)
    expect(isItAssetLoadAllQuery({ all: '0' })).toBe(false)
    expect(isItAssetLoadAllQuery({ all: 'no' })).toBe(false)
  })

  it('returns all matching rows in a single query without LIMIT/OFFSET when all=true', async () => {
    state.query = { all: 'true', status: 'in_use' }
    state.rowsResult = [
      { id: 2, asset_no: 'TK-PC-0002', asset_name: '台式机B' },
      { id: 1, asset_no: 'TK-PC-0001', asset_name: '台式机A' },
    ]

    const res = await listItAssets({})
    expect(res.code).toBe(200)
    expect(res.total).toBe(2)
    expect(res.rows).toHaveLength(2)
    expect(res.rows[0].assetNo).toBe('TK-PC-0002')
    expect(state.sqlCalls).toHaveLength(1)
    expect(state.sqlCalls[0].sql).not.toMatch(/\bLIMIT\b/i)
    expect(state.sqlCalls[0].sql).not.toMatch(/\bOFFSET\b/i)
    expect(state.sqlCalls[0].params).toEqual(['in_use'])
  })

  it('keeps paginated LIMIT/OFFSET + COUNT(*) queries when all is omitted', async () => {
    state.query = { pageNum: '2', pageSize: '25', status: 'in_use' }
    state.rowsResult = [{ id: 26, asset_no: 'TK-PC-0026', asset_name: '台式机Z' }]
    state.countResult = [{ total: 107 }]

    const res = await listItAssets({})
    expect(res.code).toBe(200)
    expect(res.total).toBe(107)
    expect(res.rows).toHaveLength(1)
    expect(state.sqlCalls).toHaveLength(2)
    expect(state.sqlCalls[0].sql).toMatch(/\bLIMIT\s+\?\s+OFFSET\s+\?/i)
    expect(state.sqlCalls[0].params).toEqual(['in_use', 25, 25])
    expect(state.sqlCalls[1].sql).toContain('COUNT(*) AS total')
    expect(state.sqlCalls[1].params).toEqual(['in_use'])
  })

  it('returns assetDeptOptions containing only departments that have assets while keeping full deptOptions', async () => {
    state.rowsResult = []
    const origQuery = state.sqlCalls
    const mockMap = new Map([
      ['FROM sys_dept', [{ dept_name: '供应链中心' }, { dept_name: '品质部' }]],
      ['DISTINCT dept FROM wxuser', [{ dept: '供应链中心' }, { dept: '物控' }]],
      ['DISTINCT use_dept FROM tk_it_asset', [{ use_dept: '物控' }, { use_dept: '品质部' }]],
      ['FROM wxuser WHERE status', [{ userid: 'LiuJia', name: '刘佳', dept: '物控', position: '跟单' }]],
      ['REGEXP', [{ asset_no: 'TK-PC-0120' }]],
    ])
    state.customQuery = (sql) => {
      for (const [needle, res] of mockMap.entries()) {
        if (sql.includes(needle)) return res
      }
      return []
    }

    const res = await getItAssetOptions({})
    state.customQuery = null
    expect(res.code).toBe(200)
    expect(res.data.assetDeptOptions).toEqual(['品质部', '物控'])
    expect(res.data.assetDeptOptions).not.toContain('供应链中心')
    expect(res.data.deptOptions).toContain('供应链中心')
    expect(res.data.deptOptions).toContain('品质部')
    expect(origQuery.length).toBeGreaterThan(0)
  })
})
