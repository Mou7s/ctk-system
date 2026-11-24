import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  diffWecomContacts,
  fetchWecomContacts,
} from '../../server/utils/wecom-contacts.ts'

describe('WeCom contacts synchronization helpers', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input)
      if (url.includes('/gettoken')) {
        const token = url.includes('app-secret-for-test') ? 'app-token-for-test' : 'contact-token-for-test'
        return new Response(JSON.stringify({ errcode: 0, access_token: token, expires_in: 7200 }), { status: 200 })
      }
      if (url.includes('/department/list')) {
        if (!url.includes('app-token-for-test')) throw new Error('department API must use application token')
        return new Response(JSON.stringify({
          errcode: 0,
          department: [{ id: 1, name: '固晶部' }, { id: 2, name: '焊线部' }],
        }), { status: 200 })
      }
      if (url.includes('/user/list_id')) {
        if (!url.includes('contact-token-for-test')) throw new Error('member API must use contacts token')
        return new Response(JSON.stringify({
          errcode: 0,
          dept_user: [{ userid: 'u1' }, { userid: 'u2' }],
          next_cursor: '',
        }), { status: 200 })
      }
      if (url.includes('/user/get') && url.includes('userid=u1')) {
        if (!url.includes('app-token-for-test')) throw new Error('user detail API must use application token')
        return new Response(JSON.stringify({
          errcode: 0,
          userid: 'u1',
          name: '张三',
          position: '操作员',
          department: [1],
          is_leader_in_dept: [1],
        }), { status: 200 })
      }
      if (url.includes('/user/get') && url.includes('userid=u2')) {
        if (!url.includes('app-token-for-test')) throw new Error('user detail API must use application token')
        return new Response(JSON.stringify({
          errcode: 0,
          userid: 'u2',
          name: '李四',
          position: '技术员',
          department: [2],
        }), { status: 200 })
      }
      throw new Error(`unexpected url: ${url}`)
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('loads employee details and resolves department names from WeCom', async () => {
    await expect(fetchWecomContacts({
      corpId: 'corp-for-test',
      corpSecretContacts: 'secret-for-test',
      corpSecret: 'app-secret-for-test',
    })).resolves.toEqual([
      { userid: 'u1', name: '张三', dept: '固晶部', position: '操作员', leaderDept: '固晶部' },
      { userid: 'u2', name: '李四', dept: '焊线部', position: '技术员', leaderDept: null },
    ])
  })

  it('classifies added, changed, unchanged, and missing employees by userid', () => {
    expect(diffWecomContacts(
      [
        { userid: 'u1', name: '张三', dept: '固晶部', position: '主管' },
        { userid: 'u3', name: '王五', dept: '测试分选', position: '操作员' },
      ],
      [
        { userid: 'u1', name: '张三', dept: '固晶部', position: '操作员', status: 'active' },
        { userid: 'u2', name: '李四', dept: '焊线部', position: '技术员', status: 'active' },
      ],
    )).toEqual({
      added: [{ userid: 'u3', name: '王五', dept: '测试分选', position: '操作员' }],
      updated: [{
        userid: 'u1',
        before: { userid: 'u1', name: '张三', dept: '固晶部', position: '操作员', status: 'active' },
        after: { userid: 'u1', name: '张三', dept: '固晶部', position: '主管' },
      }],
      unchanged: [],
      missing: [{ userid: 'u2', name: '李四', dept: '焊线部', position: '技术员', status: 'active' }],
    })
  })
})
