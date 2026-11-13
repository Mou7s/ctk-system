import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getNormalPath } from '../utils/helpers'

const layout = readFileSync('app/layout/index.vue', 'utf8')
const resolveSource = layout.slice(layout.indexOf('function resolvePath('), layout.indexOf('function convertRoutes('))
const resolvePath = new Function('isExternal', 'getNormalPath', `${resolveSource}; return resolvePath`)(
  (path) => /^(https?:|mailto:|tel:)/.test(path),
  getNormalPath,
)

describe('侧栏菜单路径解析', () => {
  it('首页始终保留根路径，使导航项可以生成链接', () => {
    expect(resolvePath('/')).toBe('/')
    expect(resolvePath('/', '/system')).toBe('/')
  })
  it('保留普通菜单和外链的解析行为', () => {
    expect(resolvePath('/user/profile')).toBe('/user/profile')
    expect(resolvePath('user', '/system')).toBe('/system/user')
    expect(resolvePath('https://example.com/')).toBe('https://example.com/')
  })
})
