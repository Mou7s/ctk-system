import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import Fuse from 'fuse.js'

// 全局搜索（Ctrl/⌘+K，layout 里的 UDashboardSearch）用 Fuse 过滤菜单。
// Nuxt UI 的 DashboardSearch 默认打开 useTokenSearch，而本项目解析到的 fuse.js（根依赖，
// @vueuse/integrations 用的就是这份）在开启分词后连整条菜单名都匹配不上——
// 中文菜单一个都搜不到（实测「半成品」「车间」「在制」全为空）。
// 这条守卫钉住 layout 必须显式关掉它，并顺带用同一份依赖复现匹配行为。
const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout/index.vue'), 'utf8')

// UCommandPalette 的默认 fuseOptions（Nuxt UI 内部注入），与 layout 传的 fuse 合并后的结果
function mergedFuseOptions(userFuse) {
  const base = { ignoreLocation: true, threshold: 0.1, keys: ['label', 'description', 'suffix'] }
  return { ...base, ...(userFuse?.fuseOptions || {}) }
}

describe('全局搜索的 Fuse 配置', () => {
  it('layout 给 UDashboardSearch 传了 fuse 且关掉 useTokenSearch 并包含 to/href 键', () => {
    expect(layoutSource).toContain('UDashboardSearch')
    expect(layoutSource).toMatch(/:fuse="searchFuseOptions"/)
    expect(layoutSource).toMatch(/useTokenSearch:\s*false/)
    expect(layoutSource).toMatch(/keys:\s*\[[\s\S]*?["']to["'][\s\S]*?["']href["'][\s\S]*?\]/)
    expect(layoutSource).toContain('#item-trailing')
  })

  it('关掉分词后中文与英文菜单名都能按子串命中', () => {
    const items = [
      { label: '车间半成品在制', group: 'menu-车间管理', to: '/workshop/wip-detail' },
      { label: '用户管理', group: 'menu-系统管理', to: '/system/user' },
      { label: '角色管理', group: 'menu-系统管理', to: '/system/role' },
      { label: 'Production Receipt', group: 'menu-warehouse', to: '/warehouse/receipt' },
    ]
    const fuse = new Fuse(items, mergedFuseOptions({
      fuseOptions: {
        useTokenSearch: false,
        keys: ['label', 'description', 'to', 'href', 'suffix'],
      },
    }))
    const labels = (term) => fuse.search(term).map((result) => result.item.label)

    // 中文子串搜索
    expect(labels('半成品')).toEqual(['车间半成品在制'])
    expect(labels('车间')).toEqual(['车间半成品在制'])
    expect(labels('车间半成品在制')).toEqual(['车间半成品在制'])
    expect(labels('用户')).toEqual(['用户管理'])
    expect(labels('Receipt')).toEqual(['Production Receipt'])

    // 英文路由地址搜索
    expect(labels('user')).toEqual(['用户管理'])
    expect(labels('USER')).toEqual(['用户管理'])
    expect(labels('/system/user')).toEqual(['用户管理'])
    expect(labels('role')).toEqual(['角色管理'])
    expect(labels('wip')).toEqual(['车间半成品在制'])
    expect(labels('system')).toEqual(expect.arrayContaining(['用户管理', '角色管理']))
  })
})
