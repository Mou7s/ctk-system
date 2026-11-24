import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  body: {},
  connection: { query: vi.fn() },
  resolveMaterialById: vi.fn(),
}))

vi.mock('h3', () => ({
  getRouterParam: vi.fn(),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

vi.mock('../../server/utils/material-read.ts', () => ({
  resolveMaterialById: state.resolveMaterialById,
}))

vi.mock('../../server/utils/write.ts', () => ({
  affectedRows: vi.fn((result) => Number(result?.affectedRows || 0)),
  bodyOf: vi.fn(async () => state.body),
  idList: vi.fn(),
  insertOperationLog: vi.fn(async () => {}),
  text: vi.fn((value) => String(value ?? '').trim()),
  writeFail: vi.fn((message) => { throw new Error(message) }),
  withWriteSession: vi.fn(async (_event, _label, _permission, work) => (
    work({ userId: 1, userName: 'admin', user: { nickName: '管理员' } }, state.connection)
  )),
  withIdempotentWriteSession: vi.fn(async (_event, _label, _permission, _requestId, _body, work) => (
    work({ userId: 1, userName: 'admin', user: { nickName: '管理员' } }, state.connection, { requestId: 'req-1' })
  )),
}))

describe('sample test material writes', () => {
  let addSampleTest
  let signSampleTest

  beforeAll(async () => {
    ({ addSampleTest, signSampleTest } = await import('../../server/utils/sample-test-write.ts'))
  })

  beforeEach(() => {
    state.body = {
      productName: '测试产品',
      supplierId: 7,
      supplierName: 'AVL供应商',
      materialId: 101,
      materialNumber: '被篡改料号',
      materialName: '被篡改名称',
      materialSpec: '被篡改规格',
      materialNameSpec: '被篡改组合字段',
      materialModel: '被篡改型号',
      applyDate: '2026-09-02',
    }
    state.resolveMaterialById.mockReset().mockResolvedValue({
      id: 101,
      number: '101010002',
      name: '稳压管芯片',
      spec: '2V4S',
    })
    state.connection.query.mockReset().mockImplementation(({ sql }) => {
      if (sql.includes('SELECT test_no')) return Promise.resolve([[], []])
      if (sql.includes('FROM tk_supplier_access')) return Promise.resolve([[{ id: 7, supplier_name: 'AVL供应商' }], []])
      if (sql.includes('INSERT INTO tk_sample_test')) return Promise.resolve([{ insertId: 9, affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
  })

  it('ignores editable material text and persists canonical Kingdee fields', async () => {
    await addSampleTest({ headers: {} })

    expect(state.resolveMaterialById).toHaveBeenCalledWith(101)
    const insertCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('INSERT INTO tk_sample_test'))
    expect(insertCall).toBeTruthy()
    const insertSql = insertCall[0].sql
    const columnCount = insertSql.match(/INSERT INTO tk_sample_test\s*\((.*?)\)\s*VALUES/s)[1].split(',').length
    expect(insertSql.match(/\?/g)).toHaveLength(columnCount)
    expect(insertCall[1]).toHaveLength(columnCount)
    expect(insertCall[1].slice(0, 10)).toEqual([
      expect.stringMatching(/^TK-SY-\d{8}-001$/),
      '测试产品',
      '稳压管芯片 2V4S',
      7,
      'AVL供应商',
      101,
      '101010002',
      '稳压管芯片',
      '2V4S',
      '101010002',
    ])
  })

  it('forces draft on create even when caller sends approved status', async () => {
    state.body.status = 'approved'
    state.body.finalResult = '合格'
    await addSampleTest({ headers: {} })

    const insertCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('INSERT INTO tk_sample_test'))
    expect(insertCall).toBeTruthy()
    // 状态恒为 draft、结论恒为空，由签批流转决定
    expect(insertCall[1]).toContain('draft')
    expect(insertCall[1]).not.toContain('approved')
    expect(insertCall[1]).not.toContain('合格')
  })

  it('sign rejects skipping steps (testing cannot approve directly)', async () => {
    state.body = { id: '9', step: 'approve', opinion: '直接过', finalResult: '合格' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_sample_test')) {
        return Promise.resolve([[{ id: 9, status: 'testing', tester_remark: null }], []])
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await expect(signSampleTest({ headers: {} })).rejects.toThrow('当前不在待总经理助理环节')
  })

  it('sign requires opinion', async () => {
    state.body = { id: '9', step: 'tester', opinion: '' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_sample_test')) {
        return Promise.resolve([[{ id: 9, status: 'testing', tester_remark: null }], []])
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await expect(signSampleTest({ headers: {} })).rejects.toThrow('请输入意见')
  })

  it('sign rejects mid-flow reject (only ren_review can reject)', async () => {
    state.body = { id: '9', step: 'reject', opinion: '不行' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_sample_test')) {
        return Promise.resolve([[{ id: 9, status: 'ipqc_review', tester_remark: null }], []])
      }
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await expect(signSampleTest({ headers: {} })).rejects.toThrow('只有总经理助理能驳回终结')
  })

  it('sign tester advances testing to ipqc_review', async () => {
    state.body = { id: '9', step: 'tester', opinion: '已测，无异常' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_sample_test')) {
        return Promise.resolve([[{ id: 9, status: 'testing', tester_remark: null }], []])
      }
      if (sql.includes('UPDATE tk_sample_test')) return Promise.resolve([{ affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await signSampleTest({ headers: {} })

    const updateCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('UPDATE tk_sample_test'))
    expect(updateCall).toBeTruthy()
    expect(updateCall[1]).toContain('ipqc_review')
  })
})