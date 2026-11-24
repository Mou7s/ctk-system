import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  canned: [],
  requests: [],
}))

vi.mock('../../server/utils/sqlserver.ts', () => ({
  queryK3SqlServer: async (execute) => {
    const request = {
      inputs: {},
      sqlText: '',
      input(name, type, value) {
        request.inputs[name] = value
        return request
      },
      async query(text) {
        request.sqlText = text
        const next = state.canned.shift()
        return { recordset: next || [] }
      },
    }
    state.requests.push(request)
    const result = await execute(request)
    return result.recordset || []
  },
  sqlStringParameter: (request, name, value) => request.input(name, 'nvarchar', value),
}))

describe('queryMoData paging and grouping', () => {
  let queryMoData

  beforeAll(async () => {
    ({ queryMoData } = await import('../../server/utils/mo-read.ts'))
  })

  beforeEach(() => {
    state.canned = []
    state.requests = []
  })

  function detailRow(overrides) {
    return {
      FFullName: null,
      FMONumber: 'MO1',
      FMOEntrySeq: 1,
      FBillNo: 'TX1',
      FNUMBER: 'M1',
      FNAME: '物料1',
      FSPECIFICATION: null,
      gongyiluxian: null,
      FOperQty: 100,
      reportDate: '2026-09-07 01:12:59.957',
      FOperNumber: 10,
      zuoye: '固晶',
      jiagongchejian: null,
      FQualifiedQty: 90,
      FUnqualifiedQty: 10,
      ...overrides,
    }
  }

  it('pages by planning row, correlates the report date and groups by MO entry', async () => {
    state.canned = [
      [{ total: 2 }],
      [{ fid: 101 }, { fid: 102 }],
      [
        detailRow({}),
        detailRow({ FOperNumber: 20, zuoye: '焊线', FQualifiedQty: 80, FUnqualifiedQty: 5 }),
        detailRow({ FMONumber: 'MO2', FBillNo: 'TX2', FOperNumber: 10, FQualifiedQty: 50, FUnqualifiedQty: 0 }),
      ],
    ]

    const result = await queryMoData({ FNAME: '物料', pageNum: 1, pageSize: 10 })

    expect(result.total).toBe(2)
    expect(result.pageNum).toBe(1)
    expect(result.pageSize).toBe(10)
    expect(result.rows).toHaveLength(2)
    // sorted by MO number desc: MO2 first
    expect(result.rows[0].FMONumber).toBe('MO2')
    expect(result.rows[0].details).toHaveLength(1)
    expect(result.rows[1].FMONumber).toBe('MO1')
    expect(result.rows[1].details).toHaveLength(2)
    // header date is the latest detail report date (millis kept, display truncates to minutes)
    expect(result.rows[1].reportDate).toBe('2026-09-07 01:12:59.957')
    expect(result.rows[1].details[0].reportDate).toBe('2026-09-07 01:12:59.957')

    const detailQuery = state.requests[2]
    expect(detailQuery.sqlText).toContain('rpt_entry.FOPTPLANID = op.FID')
    expect(detailQuery.sqlText).toContain('IN (')
    expect(detailQuery.inputs.moFid0).toBe(101)
    expect(detailQuery.inputs.moFid1).toBe(102)
    expect(detailQuery.inputs.FNAME).toBe('%物料%')

    const keyQuery = state.requests[1]
    expect(keyQuery.sqlText).toContain('OFFSET @moOffset ROWS FETCH NEXT @moPageSize ROWS ONLY')
    expect(keyQuery.inputs.moOffset).toBe(0)
    expect(keyQuery.inputs.moPageSize).toBe(10)
  })

  it('splits one flow bill shared by two production orders into two cards', async () => {
    state.canned = [
      [{ total: 2 }],
      [{ fid: 201 }, { fid: 202 }],
      [
        detailRow({ FMONumber: 'MO-A', FMOEntrySeq: 1, FBillNo: 'TW010077' }),
        detailRow({ FMONumber: 'MO-B', FMOEntrySeq: 2, FBillNo: 'TW010077' }),
      ],
    ]

    const result = await queryMoData({ FBillNo: 'TW010077', pageNum: 1, pageSize: 10 })

    expect(result.total).toBe(2)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row.FMONumber).sort()).toEqual(['MO-A', 'MO-B'])
  })

  it('short-circuits to an empty page when nothing matches', async () => {
    state.canned = [[{ total: 0 }]]

    const result = await queryMoData({ FNAME: '__no_match__', pageNum: 3, pageSize: 10 })

    expect(result).toEqual({ rows: [], total: 0, pageNum: 3, pageSize: 10 })
    expect(state.requests).toHaveLength(1)
  })

  it('keeps the total when the requested page is beyond the range', async () => {
    state.canned = [[{ total: 5 }], []]

    const result = await queryMoData({ pageNum: 99, pageSize: 10 })

    expect(result).toEqual({ rows: [], total: 5, pageNum: 99, pageSize: 10 })
  })

  it('clamps page size and offsets by page number', async () => {
    state.canned = [[{ total: 250 }], [{ fid: 1 }], [detailRow({})]]

    const result = await queryMoData({ pageNum: 3, pageSize: 500 })

    expect(result.pageSize).toBe(100)
    expect(state.requests[1].inputs.moPageSize).toBe(100)
    expect(state.requests[1].inputs.moOffset).toBe(200)
  })
})
