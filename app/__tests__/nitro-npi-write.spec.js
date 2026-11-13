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
    work({ userId: 1, userName: 'admin', user: { nickName: '管理员' } }, state.connection, {})
  )),
  withIdempotentWriteSession: vi.fn(async (_event, _label, _permission, _requestId, _body, work) => (
    work({ userId: 1, userName: 'admin', user: { nickName: '管理员' } }, state.connection, { requestId: 'req-1' })
  )),
}))

describe('npi unified flow writes', () => {
  let addNpi
  let signNpi

  beforeAll(async () => {
    ({ addNpi, signNpi } = await import('../../server/utils/npi-write.ts'))
  })

  beforeEach(() => {
    state.resolveMaterialById.mockReset().mockResolvedValue({
      id: 101,
      number: '101010002',
      name: '稳压管芯片',
      spec: '2V4S',
    })
    state.connection.query.mockReset()
  })

  it('adds draft NPI with free-text supplier and canonical K3 material', async () => {
    state.body = {
      supplierName: '新供应商HHCK',
      materialId: 101,
      applyDate: '2026-09-04',
    }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT npi_no')) return Promise.resolve([[], []])
      if (sql.includes('INSERT INTO tk_npi')) return Promise.resolve([{ insertId: 9, affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await addNpi({ headers: {} })

    expect(state.resolveMaterialById).toHaveBeenCalledWith(101)
    const insertCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('INSERT INTO tk_npi'))
    expect(insertCall).toBeTruthy()
    const insertSql = insertCall[0].sql
    const columnCount = insertSql.match(/INSERT INTO tk_npi\s*\((.*?)\)\s*VALUES/s)[1].split(',').length
    expect(insertSql.match(/\?/g)).toHaveLength(columnCount)
    expect(insertCall[1]).toHaveLength(columnCount)
    // 新供应商直接写名（无 AVL 校验），状态恒为 draft；产品名统一用金蝶物料名
    expect(insertCall[1]).toContain('新供应商HHCK')
    expect(insertCall[1]).toContain('draft')
    expect(insertCall[1]).toContain('稳压管芯片')
    expect(insertCall[1][0]).toMatch(/^NPI-\d{8}-001$/)
  })

  it('final approve creates AVL access archive and links access_id', async () => {
    state.body = { id: '9', step: 'approve', opinion: '同意准入', accessResult: '准入' }
    const npiRow = {
      id: 9, npi_no: 'NPI-20260904-001', status: 'manager_review', supplier_name: '新供应商HHCK',
      contact_name: '张三', contact_phone: '13800000000', contact_email: null, main_materials: '黑胶',
      address: null, business_license_no: null, certificates: 'ISO9001', supply_capacity: null,
      apply_date: '2026-09-04', applicant: '采购员', attachments: null,
      final_result: null, access_result: null, tester_target_qty: null, tester_actual_qty: null, tester_usage: null,
    }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[npiRow], []])
      if (sql.includes("FROM tk_supplier_access WHERE supplier_name")) return Promise.resolve([[], []])
      if (sql.includes('SELECT access_no')) return Promise.resolve([[], []])
      if (sql.includes('INSERT INTO tk_supplier_access')) return Promise.resolve([{ insertId: 55, affectedRows: 1 }, []])
      if (sql.includes('UPDATE tk_npi')) return Promise.resolve([{ affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await signNpi({ headers: {} })

    const accessCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('INSERT INTO tk_supplier_access'))
    expect(accessCall).toBeTruthy()
    // 自动建档：SQL 字面量直接写 approved + is_avl=1，参数里带准入结论与新单号
    expect(accessCall[0].sql).toContain("'approved'")
    expect(accessCall[0].sql).toContain('?, 1,')
    expect(accessCall[1]).toContain('准入')
    expect(accessCall[1][0]).toMatch(/^SQ-RZ-\d{8}-001$/)

    const updateCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('UPDATE tk_npi'))
    expect(updateCall).toBeTruthy()
    expect(updateCall[1]).toContain('approved')
    expect(updateCall[1]).toContain(55)
    expect(updateCall[1]).toContain('准入')
    expect(updateCall[1]).not.toContain('合格')
  })

  it('final approve reuses existing AVL archive instead of duplicating', async () => {
    state.body = { id: '9', step: 'approve', opinion: '同意准入', accessResult: '准入' }
    const npiRow = {
      id: 9, npi_no: 'NPI-20260904-002', status: 'manager_review', supplier_name: '老供应商AVL',
      contact_name: null, contact_phone: null, contact_email: null, main_materials: null,
      address: null, business_license_no: null, certificates: null, supply_capacity: null,
      apply_date: '2026-09-04', applicant: '采购员', attachments: null,
      final_result: null, access_result: null, tester_target_qty: null, tester_actual_qty: null, tester_usage: null,
    }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[npiRow], []])
      if (sql.includes('FROM tk_supplier_access WHERE supplier_name')) return Promise.resolve([[{ id: 77 }], []])
      if (sql.includes('UPDATE tk_npi')) return Promise.resolve([{ affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })

    await signNpi({ headers: {} })

    const accessCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('INSERT INTO tk_supplier_access'))
    expect(accessCall).toBeFalsy()
    const updateCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('UPDATE tk_npi'))
    expect(updateCall).toBeTruthy()
    expect(updateCall[1]).toContain(77)
  })

  it('rejects approve with 不准入 (must use reject path)', async () => {
    state.body = { id: '9', step: 'approve', opinion: '不同意', accessResult: '不准入' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[{ id: 9, status: 'manager_review' }], []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
    await expect(signNpi({ headers: {} })).rejects.toThrow('不准入请走驳回')
  })

  it('blocks tester sign before 采购提交 (strict chain order)', async () => {
    state.body = { id: '9', step: 'tester', opinion: '开始测试' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[{ id: 9, status: 'draft' }], []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
    await expect(signNpi({ headers: {} })).rejects.toThrow('待测试')
  })

  it('blocks reject outside 总经理环节 (only GM can terminate)', async () => {
    state.body = { id: '9', step: 'reject', opinion: '不同意' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[{ id: 9, status: 'ipqc_review' }], []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
    await expect(signNpi({ headers: {} })).rejects.toThrow('只有总经理能驳回终结')
  })

  it('flows supervisor -> assistant -> manager in order', async () => {
    // 主管签后进入待总经理助理
    state.body = { id: '9', step: 'supervisor', opinion: '同意' }
    state.connection.query.mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[{ id: 9, status: 'supervisor_review' }], []])
      if (sql.includes('UPDATE tk_npi')) return Promise.resolve([{ affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
    await signNpi({ headers: {} })
    const supCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('UPDATE tk_npi'))
    expect(supCall[1]).toContain('assistant_review')
    expect(supCall[0].sql).toContain('supervisor_opinion')

    // 总经理助理签后进入待总经理
    state.connection.query.mockReset().mockImplementation(({ sql }) => {
      if (sql.includes('SELECT * FROM tk_npi')) return Promise.resolve([[{ id: 9, status: 'assistant_review' }], []])
      if (sql.includes('UPDATE tk_npi')) return Promise.resolve([{ affectedRows: 1 }, []])
      throw new Error(`unexpected SQL: ${sql}`)
    })
    state.body = { id: '9', step: 'assistant', opinion: '同意转总经理' }
    await signNpi({ headers: {} })
    const asstCall = state.connection.query.mock.calls.find(([query]) => query.sql.includes('UPDATE tk_npi'))
    expect(asstCall[1]).toContain('manager_review')
    expect(asstCall[0].sql).toContain('assistant_opinion')
  })
})
