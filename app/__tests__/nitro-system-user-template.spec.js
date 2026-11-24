import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  setResponseHeader: vi.fn(),
}))

vi.mock('h3', () => ({ setResponseHeader: state.setResponseHeader }))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
globalThis.defineEventHandler = (handler) => handler

describe('Nitro system user import template route', () => {
  let handler

  beforeAll(async () => {
    handler = (await import('../../server/routes/prod-api/system/user/importTemplate.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.setResponseHeader.mockReset()
  })

  it('keeps the Java SysUser IMPORT columns and workbook name', async () => {
    const result = await handler({})
    const workbook = XLSX.read(Buffer.from(result), { type: 'buffer' })
    expect(workbook.SheetNames).toEqual(['用户数据'])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['用户数据'], { header: 1, raw: true })).toEqual([
      ['部门编号', '登录名称', '用户名称', '用户邮箱', '手机号码', '用户性别', '帐号状态'],
    ])
    expect(decodeURIComponent(state.setResponseHeader.mock.calls[1][2])).toContain('用户数据.xlsx')
  })

  it('keeps the Java authentication boundary', async () => {
    state.authenticated = null
    await expect(handler({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })
  })
})
