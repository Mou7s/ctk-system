// 用法: node tools/check-unresolved-bindings.mjs [glob...]
// 退出码 1 表示存在「被引用但未声明」的标识符（线上会抛 ReferenceError）。
import { loadNuxtAutoImports, scanPages } from './unresolved-bindings.mjs'

const patterns = process.argv.slice(2)
const autoImports = loadNuxtAutoImports()
if (!autoImports) {
  console.error('缺少 .nuxt/imports.d.ts，无法判定自动导入（先跑一次 bun run dev 生成 .nuxt 产物）')
  process.exit(2)
}

const findings = scanPages(patterns.length ? patterns : 'app/pages/**/*.vue', {
  autoImports,
  extraGlobals: ['AndroidJs', 'webkit'],
})

if (!findings.length) {
  console.log('OK: 所有页面 script setup 的标识符均可解析')
  process.exit(0)
}

for (const { file, unresolved } of findings) {
  console.log(`${file}: ${unresolved.join(', ')}`)
}
console.error(`FAIL: ${findings.length} 个文件存在未解析标识符`)
process.exit(1)
