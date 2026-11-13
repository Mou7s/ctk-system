import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 回归护栏：在 app/packages/shared 里加了新函数，却忘了在 index.js 里 re-export 时，
// 页面会以「does not provide an export named 'xxx'」在浏览器里直接白屏
// （vitest 里页面 mount 不触发那条 import 路径，所以本地测试全绿也照样炸）。
// vitest 的 cwd 就是仓库根（bun run test 在根目录执行）
const repoRoot = process.cwd()
const sharedIndex = join(repoRoot, 'app/packages/shared/index.js')

function collectExportedNames(source) {
  const names = new Set()
  const pattern = /export\s*(?:\{([^}]*)\}|(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+))/g
  let match
  while ((match = pattern.exec(source))) {
    if (match[1]) {
      for (const raw of match[1].split(',')) {
        const name = raw.trim()
        if (!name) continue
        names.add(name.includes(' as ') ? name.split(' as ').pop().trim() : name)
      }
    } else if (match[2]) {
      names.add(match[2])
    }
  }
  return names
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.nuxt', '.output', 'dist'].includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(vue|js|ts|mjs)$/u.test(entry.name)) out.push(full)
  }
  return out
}

describe('shared package exports', () => {
  it('页面与组件从 @ctk-system/shared 导入的每个符号都真的被导出', () => {
    expect(existsSync(sharedIndex), `未找到 ${sharedIndex}`).toBe(true)
    const exported = collectExportedNames(readFileSync(sharedIndex, 'utf8'))
    expect(exported.size).toBeGreaterThan(40)

    const missing = []
    const importPattern = /import\s*\{([^}]*)\}\s*from\s*'@ctk-system\/shared'/gs

    for (const file of walk(join(repoRoot, 'app'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(importPattern)) {
        for (const raw of match[1].split(',')) {
          const name = raw.trim()
          if (!name) continue
          const imported = name.includes(' as ') ? name.split(' as ')[0].trim() : name
          if (!exported.has(imported)) missing.push(`${relative(repoRoot, file)}: ${imported}`)
        }
      }
    }

    expect([...new Set(missing)]).toEqual([])
  })
})
