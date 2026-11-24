import { describe, expect, it } from 'vitest'
import { loadNuxtAutoImports, scanPages } from '../../tools/unresolved-bindings.mjs'

// 回归护栏：删除死代码时把仍在使用的辅助函数一起删掉，编译期不会报错，
// 只有用户点保存/粘贴时才抛 ReferenceError（例如 pasteNumber is not defined）。
const autoImports = loadNuxtAutoImports()

describe('pages script setup bindings', () => {
  it.skipIf(!autoImports)('每个页面引用的标识符都能解析到声明、导入或 Nuxt 自动导入', () => {
    const findings = scanPages('app/pages/**/*.vue', {
      autoImports,
      extraGlobals: ['AndroidJs', 'webkit'],
    })
    const detail = findings.map(({ file, unresolved }) => `${file}: ${unresolved.join(', ')}`).join('\n')
    expect(findings, detail).toEqual([])
  })
})
