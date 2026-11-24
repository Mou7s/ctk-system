import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  body: {
    requestId: 'staging-1',
    legacyMaterialCode: 'MAT-001',
    sourceStockNumber: 'CTK10',
    sourceLotNumber: 'LOT-1',
    qty: 2,
    locationCode: 'A-05',
    remark: '测试上架',
  },
  authenticated: {
    session: {
      userId: 1,
      userName: 'admin',
      roles: [],
      permissions: [],
    },
  },
  transferRecord: null,

  k3Status: 'A',
  connection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(),
  },
  pool: {
    getConnection: vi.fn(),
    query: vi.fn(),
  },
  garnet: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  executeBillQuery: vi.fn(),
  saveBill: vi.fn(),
  submitBill: vi.fn(),
  auditBill: vi.fn(),
  queryLine: vi.fn(),
  queryLocation: vi.fn(),
  queryOne: vi.fn(),
  recordLog: vi.fn(),
  finishWrite: vi.fn(),
  stockLookupCount: 0,
  permissionAllowed: true,
}))

vi.mock('h3', () => ({
  getHeader: vi.fn((_event, name) => name === 'idempotency-key' ? state.body.requestId : ''),
}))

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.authenticated),
  hasPermission: vi.fn(() => state.permissionAllowed),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => state.garnet),
}))

vi.mock('../../server/utils/k3.ts', () => ({
  executeBillQuery: state.executeBillQuery,
  saveBill: state.saveBill,
  submitBill: state.submitBill,
  auditBill: state.auditBill,
  K3CloudError: class K3CloudError extends Error {
    constructor(_kind, message, statusCode) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))

vi.mock('../../server/utils/local-stock-staging-read.ts', () => ({
  queryLocalStockLegacyStaging: state.queryLine,
}))

vi.mock('../../server/utils/wms-structure.ts', () => ({
  normalizeLocationCode: (value) => String(value || '').trim().toUpperCase().replace(/^LOC:/, ''),
  queryWmsLocation: state.queryLocation,
}))

vi.mock('../../server/utils/sqlserver.ts', () => ({
  queryK3SqlServer: vi.fn(),
  sqlStringParameter: vi.fn(),
}))

vi.mock('../../server/utils/write.ts', () => {
  class MockNitroWriteError extends Error {
    constructor(message, statusCode = 500) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return {
  bodyOf: vi.fn(async () => state.body),
  claimWriteRequest: vi.fn(async () => ({ key: 'claim', requestId: state.body.requestId, fingerprint: 'fp' })),
  finishWriteRequest: state.finishWrite,
  releaseWriteRequest: vi.fn(async () => {}),
  recordStandaloneOperationLog: state.recordLog,
  queryOne: state.queryOne,
  text: (value) => String(Array.isArray(value) ? value[0] || '' : value || '').trim(),
  writeFail: (message, statusCode = 500) => {
    throw new MockNitroWriteError(message, statusCode)
  },
  NitroWriteError: MockNitroWriteError,
  }
})

describe('Nitro local stock staging write route', () => {
  let transferStagingStock

  beforeEach(async () => {
    ({ transferStagingStock } = await import('../../server/utils/local-stock-staging-write.ts'))
    state.body = {
      requestId: 'staging-1',
      legacyMaterialCode: 'MAT-001',
      sourceStockNumber: 'CTK10',
      sourceLotNumber: 'LOT-1',
      qty: 2,
      locationCode: 'A-05',
      remark: '测试上架',
    }
    state.authenticated = { session: { userId: 1, userName: 'admin', roles: [], permissions: [] } }
    state.transferRecord = null

    state.k3Status = 'A'
    state.stockLookupCount = 0
    state.permissionAllowed = true
    state.connection.beginTransaction.mockReset()
    state.connection.commit.mockReset()
    state.connection.rollback.mockReset()
    state.connection.release.mockReset()
    state.connection.query.mockReset().mockResolvedValue([{ affectedRows: 1 }, []])
    state.pool.getConnection.mockReset().mockResolvedValue(state.connection)
    state.pool.query.mockReset().mockImplementation(async (queryOptions) => {
      const sql = String(queryOptions?.sql || '')
      if (sql.includes('SELECT * FROM tk_staging_transfer WHERE request_id')) {
        return [state.transferRecord ? [state.transferRecord] : [], []]
      }
      if (sql.includes('SELECT * FROM tk_staging_transfer')) return [[], []]
      return [[], []]
    })
    state.garnet.get.mockReset().mockResolvedValue(null)
    state.garnet.set.mockReset().mockResolvedValue('OK')
    state.garnet.del.mockReset().mockResolvedValue(1)
    state.executeBillQuery.mockReset().mockImplementation(async ({ filterString }) => {
      if (String(filterString).startsWith('FNote')) return []
      return [[123, 'ZJDB-001', state.k3Status, '']]
    })
    state.saveBill.mockReset().mockResolvedValue({ successEntities: [{ Id: 123, Number: 'ZJDB-001' }] })
    state.submitBill.mockReset().mockImplementation(async () => {
      state.k3Status = 'B'
      return {}
    })
    state.auditBill.mockReset().mockImplementation(async () => {
      state.k3Status = 'C'
      return {}
    })
    state.queryLine.mockReset().mockResolvedValue([{
      materialCode: 'MAT-001',
      materialName: '物料一',
      specification: 'SOT-23/6R',
      packageName: 'SOT-23',
      marking: '6R',
      lotNumber: 'LOT-1',
      unitNumber: 'PCS',
      receiptQty: 10,
      sourceStockNumber: 'CTK10',
      sourceStockName: '塑封成品仓',
      sourceStockLocationNumber: 'SOT-23-LOC',
      sourceStockLocationName: 'SOT-23成品仓',
      transferredQty: 0,
      sourceOnHandQty: 10,
      sourceAvailableQty: 10,
      transferableQty: 10,
    }])
    state.queryLocation.mockReset().mockResolvedValue({
      locationCode: 'A-05',
      status: '0',
      kingdeeStockNumber: 'CTK10',
      kingdeeStockLocationNumber: 'A-05',
    })
    state.queryOne.mockReset().mockImplementation(async (_connection, sql) => {
      if (String(sql).includes('SELECT id FROM tk_local_stock_txn')) return null
      if (String(sql).includes('FROM tk_local_stock')) {
        state.stockLookupCount += 1
        return { id: 'stock-1', material_code: 'MAT-001', qty: state.stockLookupCount > 1 ? 3 : 1 }
      }
      return null
    })
    state.recordLog.mockReset().mockResolvedValue(undefined)
    state.finishWrite.mockReset().mockResolvedValue(undefined)
  })

  it('requires authentication before creating a processing record', async () => {
    state.authenticated = null
    await expect(transferStagingStock({ node: { req: { method: 'POST' } } })).resolves.toEqual({
      code: 401,
      msg: '登录状态已过期',
    })
    expect(state.pool.getConnection).not.toHaveBeenCalled()
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('requires the WMS staging permission before creating a processing record', async () => {
    state.authenticated = { session: { userId: 2, userName: 'warehouse-user', roles: [], permissions: [] } }
    state.permissionAllowed = false

    await expect(transferStagingStock({ node: { req: { method: 'POST' } } })).resolves.toEqual({
      code: 403,
      msg: '没有权限访问该接口',
    })
    expect(state.pool.getConnection).not.toHaveBeenCalled()
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('saves, submits, and audits a legacy material transfer without local projection', async () => {
    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({ code: 200, msg: '金蝶已调拨到实际库位' }))
    expect(response.data).toEqual(expect.objectContaining({
      requestId: 'staging-1',
      materialCode: 'MAT-001',
      qty: 2,
      kingdeeBillNo: 'ZJDB-001',
      locationCode: 'A-05',
      status: 'SUCCESS',
    }))
    expect(response.data).not.toHaveProperty('localBalanceQty')
    expect(state.saveBill).toHaveBeenCalledWith('STK_TransferDirect', expect.objectContaining({
      Model: expect.objectContaining({ FNote: 'WMS:staging-1;来源旧标签物料:MAT-001' }),
    }), '保存金蝶直接调拨单', true)
    expect(state.submitBill).toHaveBeenCalledWith('STK_TransferDirect', ['ZJDB-001'], '提交金蝶直接调拨单')
    expect(state.auditBill).toHaveBeenCalledWith('STK_TransferDirect', ['ZJDB-001'], '审核金蝶直接调拨单')
    expect(state.connection.commit).toHaveBeenCalled()
    expect(state.finishWrite).toHaveBeenCalledWith(expect.objectContaining({ key: 'claim' }), expect.objectContaining({ code: 200 }))
    expect(state.recordLog).toHaveBeenCalled()
  })

  it('supports CTK20 塑封成品仓1 as a source warehouse', async () => {
    state.body.sourceStockNumber = 'CTK20'
    state.queryLine.mockResolvedValue([{
      materialCode: 'MAT-001',
      materialName: '物料一',
      specification: 'SOT-23/6R',
      packageName: 'SOT-23',
      marking: '6R',
      lotNumber: 'LOT-1',
      unitNumber: 'PCS',
      receiptQty: 10,
      sourceStockNumber: 'CTK20',
      sourceStockName: '塑封成品仓1',
      sourceStockLocationNumber: 'SOT-23-LOC',
      sourceStockLocationName: 'SOT-23成品仓',
      transferredQty: 0,
      sourceOnHandQty: 10,
      sourceAvailableQty: 10,
      transferableQty: 10,
    }])

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({ code: 200, msg: '金蝶已调拨到实际库位' }))
    expect(state.saveBill).toHaveBeenCalledWith('STK_TransferDirect', expect.objectContaining({
      Model: expect.objectContaining({
        FBillEntry: [expect.objectContaining({
          FSrcStockId: { FNumber: 'CTK20' },
          FSrcStockLocId: { FSRCSTOCKLOCID__FF100008: { FNumber: 'SOT-23-LOC' } },
        })],
      }),
    }), '保存金蝶直接调拨单', true)
  })

  it('uses the selected warehouse-specific location dimension for an arbitrary source warehouse', async () => {
    state.body.sourceStockNumber = 'WH-OTHER'
    state.body.sourceStockLocationNumber = 'C-01'
    state.queryLine.mockResolvedValue([{
      materialCode: 'MAT-001',
      materialName: '物料一',
      specification: 'SOT-23/6R',
      packageName: 'SOT-23',
      marking: '6R',
      lotNumber: 'LOT-1',
      unitNumber: 'PCS',
      receiptQty: 10,
      sourceStockNumber: 'WH-OTHER',
      sourceStockName: '其他仓',
      sourceStockLocationNumber: 'C-01',
      sourceStockLocationName: '其他库位',
      sourceStockLocationFlexId: '100010',
      transferredQty: 0,
      sourceOnHandQty: 10,
      sourceAvailableQty: 10,
      transferableQty: 10,
    }])

    await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(state.saveBill.mock.calls[0][1].Model.FBillEntry[0].FSrcStockLocId).toEqual({
      FSRCSTOCKLOCID__FF100010: { FNumber: 'C-01' },
    })
  })

  it('uses the manually selected warehouse and lot when the material exists in multiple warehouses', async () => {
    state.body.sourceStockNumber = 'CTK11'
    state.body.sourceLotNumber = 'LOT-2'
    state.queryLine.mockResolvedValue([
      {
        materialCode: 'MAT-001',
        materialName: '物料一',
        specification: 'SOT-23/6R',
        packageName: 'SOT-23',
        marking: '6R',
        lotNumber: 'LOT-1',
        unitNumber: 'PCS',
        receiptQty: 10,
        sourceStockNumber: 'CTK10',
        sourceStockName: '塑封成品仓',
        sourceStockLocationNumber: 'SOT-23-LOC',
        sourceStockLocationName: 'SOT-23成品仓',
        transferredQty: 0,
        sourceOnHandQty: 10,
        sourceAvailableQty: 10,
        transferableQty: 10,
      },
      {
        materialCode: 'MAT-001',
        materialName: '物料一',
        specification: 'SOT-23/6R',
        packageName: 'SOT-23',
        marking: '6R',
        lotNumber: 'LOT-2',
        unitNumber: 'PCS',
        receiptQty: 6,
        sourceStockNumber: 'CTK11',
        sourceStockName: 'OEM成品仓',
        sourceStockLocationNumber: 'SOT-23-LOC',
        sourceStockLocationName: 'SOT-23成品仓',
        transferredQty: 0,
        sourceOnHandQty: 6,
        sourceAvailableQty: 6,
        transferableQty: 6,
      },
    ])

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({ code: 200 }))
    expect(state.saveBill).toHaveBeenCalledWith('STK_TransferDirect', expect.objectContaining({
      Model: expect.objectContaining({
        FBillEntry: [expect.objectContaining({
          FSrcStockId: { FNumber: 'CTK11' },
          FSrcStockLocId: { FSRCSTOCKLOCID__FF100011: { FNumber: 'SOT-23-LOC' } },
          FLot: { FNumber: 'LOT-2' },
        })],
      }),
    }), '保存金蝶直接调拨单', true)
  })

  it('does not choose a source warehouse automatically when the request omits it', async () => {
    state.body.sourceStockNumber = ''
    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual({ code: 500, msg: '请选择来源仓库' })
    expect(state.queryLine).not.toHaveBeenCalled()
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('requires a batch when the selected warehouse has multiple batches', async () => {
    state.body.sourceLotNumber = ''
    state.queryLine.mockResolvedValue([
      { sourceStockNumber: 'CTK10', lotNumber: 'LOT-1', transferableQty: 10 },
      { sourceStockNumber: 'CTK10', lotNumber: 'LOT-2', transferableQty: 5 },
    ])

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual({ code: 500, msg: '来源仓库 CTK10 存在多个批次，请先选择批次' })
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('replays an existing completed transfer without creating another K3 bill', async () => {
    state.transferRecord = {
      request_id: 'staging-1',
      label_id: null,
      source_bill_no: null,
      source_entry_id: null,
      source_kingdee_stock_number: 'CTK10',
      source_kingdee_stock_location_number: 'SOT-23-LOC',
      material_code: 'MAT-001',
      lot_number: 'LOT-1',
      transfer_qty: 2,
      location_code: 'A-05',
      kingdee_stock_number: 'CTK10',
      kingdee_stock_location_number: 'A-05',
      kingdee_bill_id: 123,
      kingdee_bill_no: 'ZJDB-001',
      status: 'SUCCESS',
    }

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })
    expect(response.data).toEqual(expect.objectContaining({ requestId: 'staging-1', kingdeeBillNo: 'ZJDB-001' }))
    expect(state.saveBill).not.toHaveBeenCalled()
    expect(state.submitBill).not.toHaveBeenCalled()
    expect(state.auditBill).not.toHaveBeenCalled()
  })

  it('rejects a quantity above the current transferable amount before K3 write', async () => {
    state.body.qty = 11
    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })
    expect(response).toEqual({ code: 500, msg: '上架数量超过可上架剩余数量：10' })
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('rejects a reused request id when the transfer contents differ', async () => {
    state.transferRecord = {
      request_id: 'staging-1',
      label_id: null,
      source_bill_no: null,
      source_entry_id: null,
      source_kingdee_stock_number: 'CTK10',
      source_kingdee_stock_location_number: 'SOT-23-LOC',
      material_code: 'MAT-001',
      lot_number: 'LOT-1',
      receipt_qty: 10,
      transfer_qty: 2,
      location_code: 'A-05',
      kingdee_stock_number: 'CTK10',
      kingdee_stock_location_number: 'A-05',
      kingdee_bill_id: 123,
      kingdee_bill_no: 'ZJDB-001',
      status: 'SUCCESS',
    }
    state.body.qty = 3

    await expect(transferStagingStock({ node: { req: { method: 'POST' } } })).resolves.toEqual({
      code: 409,
      msg: '同一幂等键对应的请求内容不一致',
    })
    expect(state.saveBill).not.toHaveBeenCalled()
  })


  it('does not write a local stock projection after K3 is audited', async () => {
    state.transferRecord = {
      request_id: 'staging-1',
      label_id: null,
      source_bill_no: null,
      source_entry_id: null,
      source_kingdee_stock_number: 'CTK10',
      source_kingdee_stock_location_number: 'SOT-23-LOC',
      material_code: 'MAT-001',
      lot_number: 'LOT-1',
      receipt_qty: 10,
      transfer_qty: 2,
      location_code: 'A-05',
      kingdee_stock_number: 'CTK10',
      kingdee_stock_location_number: 'A-05',
      kingdee_bill_id: 123,
      kingdee_bill_no: 'ZJDB-001',
      status: 'K3_SAVED',
    }
    state.k3Status = 'C'
    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({ code: 200, msg: '金蝶已调拨到实际库位' }))
    expect(state.connection.query.mock.calls.map(([query]) => String(query?.sql || '')).join(' ')).not.toContain('tk_local_stock')
    expect(state.saveBill).not.toHaveBeenCalled()
  })

  it('recovers the orphan K3 bill by trace note when save times out after creating it', async () => {
    state.saveBill.mockRejectedValueOnce(Object.assign(new Error('K3Cloud 请求超时'), { statusCode: 504 }))
    let traceCalls = 0
    state.executeBillQuery.mockImplementation(async ({ filterString }) => {
      const condition = String(filterString)
      // 保存前查无此单（真实时序），保存超时后备注追踪找回孤儿单
      if (condition.startsWith('FNote')) {
        traceCalls += 1
        return traceCalls === 1 ? [] : [[456, 'ZJDB-ORPHAN', 'A', 'WMS:staging-1;来源旧标签物料:MAT-001']]
      }
      if (condition.includes('ZJDB-ORPHAN')) return [[456, 'ZJDB-ORPHAN', state.k3Status, '']]
      return [[123, 'ZJDB-001', state.k3Status, '']]
    })

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({ code: 200, msg: '金蝶已调拨到实际库位' }))
    expect(response.data).toEqual(expect.objectContaining({ kingdeeBillNo: 'ZJDB-ORPHAN', status: 'SUCCESS' }))
    expect(state.saveBill).toHaveBeenCalledTimes(1)
  })

  it('still fails when save errors and no orphan bill exists in K3', async () => {
    state.saveBill.mockRejectedValueOnce(Object.assign(new Error('K3Cloud 请求超时'), { statusCode: 504 }))

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual({ code: 502, msg: 'K3Cloud 请求超时' })
    expect(state.saveBill).toHaveBeenCalledTimes(1)
  })

  it('reverses the legacy staging record when the K3 bill was deleted', async () => {
    state.body = {
      requestId: 'staging-1',
      legacyMaterialCode: 'MAT-001',
      sourceStockNumber: 'CTK10',
      sourceStockLocationNumber: 'SOT-23-LOC',
      sourceLotNumber: 'LOT-1',
      qty: 2,
      locationCode: 'A-05',
      remark: '旧标签恢复',
    }
    state.transferRecord = {
      request_id: 'staging-1',
      label_id: null,
      source_bill_no: null,
      source_entry_id: null,
      source_kingdee_stock_number: 'CTK10',
      source_kingdee_stock_location_number: 'SOT-23-LOC',
      material_code: 'MAT-001',
      lot_number: 'LOT-1',
      receipt_qty: 10,
      transfer_qty: 2,
      location_code: 'A-05',
      kingdee_stock_number: 'CTK10',
      kingdee_stock_location_number: 'A-05',
      kingdee_bill_id: 123,
      kingdee_bill_no: 'ZJDB-001',
      status: 'SUCCESS',
    }
    state.connection.query.mockImplementation(async (queryOptions) => {
      const sql = String(queryOptions?.sql || '')
      if (sql.includes("SET status = 'REVERSED'")) return [{ affectedRows: 1 }, []]
      return [{ affectedRows: 1 }, []]
    })
    state.queryOne.mockImplementation(async (_connection, sql) => {
      if (String(sql).includes('SELECT status FROM tk_staging_transfer')) return { status: 'SUCCESS' }
      return null
    })
    state.executeBillQuery.mockResolvedValue([])

    const response = await transferStagingStock({ node: { req: { method: 'POST' } } })

    expect(response).toEqual(expect.objectContaining({
      code: 409,
      msg: '金蝶直接调拨单 ZJDB-001 已删除，上架记录已撤回，请使用新的请求编号重新上架',
    }))
    expect(state.connection.query.mock.calls.map(([query]) => String(query?.sql || '')).join(' ')).not.toContain('tk_local_stock')
  })
})
