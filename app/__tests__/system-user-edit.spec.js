import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { parse as parseJs } from '@babel/parser'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync('app/pages/system/user/index.vue', 'utf8')
const { descriptor } = parse(source)
const ast = parseJs(descriptor.scriptSetup.content, { sourceType: 'module' })
const declarations = ast.program.body.filter(node => node.type === 'FunctionDeclaration')
function setup(overrides = {}) {
  const deps = {
    form: { userId: 9, nickName: '测试用户', userName: 'test' },
    saving: { value: false }, open: { value: true }, sendWecomNotify: { value: false },
    rules: { nickName: [{ required: true, message: '请输入姓名' }] },
    toast: { add: vi.fn() }, updateUser: vi.fn(async () => ({ code: 200 })),
    addUser: vi.fn(async () => ({ code: 200 })), getList: vi.fn(async () => {}),
    buildUserPayload: vi.fn(form => ({ ...form })),
    ...overrides,
  }
  const node = declarations.find(node => node.id.name === 'submitForm')
  const fn = new Function(...Object.keys(deps), `${descriptor.scriptSetup.content.slice(node.start, node.end)}; return submitForm`)(...Object.values(deps))
  return { ...deps, submit: fn }
}

describe('用户编辑保存与表格兼容', () => {
  it('保存只调用一次接口，成功后关闭并刷新列表', async () => {
    let finish
    const state = setup({ updateUser: vi.fn(() => new Promise(resolve => { finish = resolve })) })
    const first = state.submit()
    await state.submit()
    expect(state.updateUser).toHaveBeenCalledTimes(1)
    expect(state.saving.value).toBe(true)
    finish({ code: 200 })
    await first
    expect(state.open.value).toBe(false)
    expect(state.getList).toHaveBeenCalledTimes(1)
    expect(state.saving.value).toBe(false)
  })
  it('失败保留弹窗和输入，可重新保存', async () => {
    const state = setup({ updateUser: vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue({ code: 200 }) })
    await state.submit()
    expect(state.open.value).toBe(true)
    expect(state.saving.value).toBe(false)
    expect(state.form.nickName).toBe('测试用户')
    expect(state.getList).not.toHaveBeenCalled()
    await state.submit()
    expect(state.open.value).toBe(false)
  })
  it('必填校验不触发保存请求', async () => {
    const state = setup({ form: { userId: 9, nickName: '' } })
    await state.submit()
    expect(state.updateUser).not.toHaveBeenCalled()
    expect(state.open.value).toBe(true)
  })
  it('使用TkUTable选择事件，不再调用旧表格实例方法', () => {
    expect(source).not.toMatch(/\.(?:clearSelection|setCurrentRow|toggleRowSelection)\(/u)
    expect(source).toContain(':get-row-id="row => String(row.userId)"')
    expect(source).toContain('@selection-change="handleSelectionChange"')
    expect(source).toContain('table.toggleAllPageRowsSelected')
    expect(source).toContain('row.toggleSelected')
  })
  it('弹窗组件和模板编译通过', () => {
    compileScript(descriptor, { id: 'system-user-test' })
    const result = compileTemplate({ source: descriptor.template.content, filename: 'system-user.vue', id: 'system-user-test' })
    expect(result.errors).toEqual([])
  })
})
