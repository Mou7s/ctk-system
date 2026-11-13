// 找出 app/pages/**/*.vue 的 <script setup> 里「被引用但从未声明」的标识符。
// 典型故障：删除死代码时把仍在使用的辅助函数（如 pasteNumber）一起删掉，
// 保存/粘贴时才抛 ReferenceError，编译期和 SFC 编译测试都发现不了。
import { existsSync, readFileSync } from 'node:fs'
import { parse as parseSfc, compileScript } from '@vue/compiler-sfc'
import { parse as parseJs } from '@babel/parser'
import _traverse from '@babel/traverse'
import fg from 'fast-glob'

const traverse = _traverse.default || _traverse

// 运行时环境提供的全局，白名单外的未解析标识符都视为疑似漏删/漏导入
export const RUNTIME_GLOBALS = new Set([
  'console', 'window', 'document', 'globalThis', 'JSON', 'Math', 'Number', 'String', 'Object', 'Array', 'Boolean',
  'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError', 'RangeError',
  'BigInt', 'Intl', 'Proxy', 'Reflect', 'undefined', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'fetch', 'URL', 'URLSearchParams', 'FormData',
  'Blob', 'File', 'FileReader', 'AbortController', 'TextEncoder', 'TextDecoder', 'crypto', 'performance',
  'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'alert', 'confirm', 'prompt',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'IntersectionObserver',
  'MutationObserver', 'CustomEvent', 'Event', 'HTMLElement', 'Element', 'Node', 'DOMParser', 'XMLHttpRequest',
  'WebSocket', 'Response', 'Request', 'Headers', 'arguments', 'require', 'module', 'process', 'exports', '__dirname',
  'eval', 'Function', 'escape', 'unescape',
  // 仅出现在 JSDoc / 类型标注里的 DOM 类型
  'HTMLInputElement', 'HTMLMediaElement', 'HTMLDivElement', 'HTMLTextAreaElement', 'KeyboardEvent', 'MouseEvent',
  'ClipboardEvent', 'DragEvent', 'FileList', 'Iterable', 'Record',
])

// Nuxt 自动导入 / 全局注册组件来自 .nuxt 产物；产物不存在时无法判定，调用方应跳过
export function loadNuxtAutoImports(rootDir = process.cwd()) {
  const files = [`${rootDir}/.nuxt/imports.d.ts`, `${rootDir}/.nuxt/components.d.ts`]
  if (!files.some((file) => existsSync(file))) return null
  const names = new Set()
  for (const file of files) {
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    for (const pattern of [/export\s*\{([^}]*)\}/g, /import\s+(?:type\s+)?\{([^}]*)\}/g]) {
      for (const block of src.matchAll(pattern)) {
        for (const raw of block[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/).pop()?.trim()
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
        }
      }
    }
    for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
    for (const m of src.matchAll(/^\s*(?:type\s+)?([A-Za-z_$][\w$]*)\s*[:(]/gm)) names.add(m[1])
    for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*),?\s*$/gm)) names.add(m[1])
  }
  return names
}

export function findUnresolvedBindings(file, { autoImports = new Set(), extraGlobals = [] } = {}) {
  const source = readFileSync(file, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: file })
  if (errors.length || !descriptor.scriptSetup) return []
  const content = compileScript(descriptor, { id: 'check' }).content
  const ast = parseJs(content, { sourceType: 'module', plugins: ['jsx', 'typescript', 'topLevelAwait'] })
  const allowed = new Set([...RUNTIME_GLOBALS, ...extraGlobals, ...autoImports])
  const unresolved = new Set()
  traverse(ast, {
    ReferencedIdentifier(path) {
      const { name } = path.node
      if (path.scope.getBinding(name)) return
      if (allowed.has(name)) return
      unresolved.add(name)
    },
  })
  return [...unresolved]
}

export function scanPages(patterns = 'app/pages/**/*.vue', options = {}) {
  const files = fg.sync(patterns, { cwd: options.cwd || process.cwd(), absolute: true })
  const findings = []
  for (const file of files.sort()) {
    const unresolved = findUnresolvedBindings(file, options)
    if (unresolved.length) findings.push({ file, unresolved })
  }
  return findings
}
