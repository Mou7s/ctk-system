// 轻量静态检查（2026-09-18 起）：只开「几乎不可能误报、且能挡住真实事故」的四条规则。
// 明确不做的事（见 .hermes/plans/2026-09-18_142118-code-quality-remediation.md）：
//   - 不引入 TS 类型检查（server/**/*.ts 需要 typescript-eslint，属后续议题）
//   - 不解析 .vue（需要 eslint-plugin-vue），因此 app/** 里 script setup 的「脚本有、模板删了」
//     这类半残 handler 仍靠人工与 page 级 spec 兜
//   - app/** 不开 no-undef：Nuxt 自动导入（ref/computed/useRuntimeConfig/defineEventHandler…）
//     会让该规则满屏误报；仅在 tools/ scripts/ 根脚本这类「必须显式导入」的 Node 代码里开启
import globals from 'globals'

export default [
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'node_modules/**',
      'public/**',
      'output/**',
      'outputs/**',
      'logs/**',
      'runtime/**',
      'dist/**',
      'coverage/**',
    ],
  },
  {
    files: ['app/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
    },
  },
  {
    files: ['tools/**/*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', '*.{js,mjs,cjs}', 'vite/**/*.{js,mjs}', 'types/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-unsafe-negation': 'error',
      'no-console': 'off',
    },
  },
  {
    // Element Plus → Nuxt UI 的一次性迁移脚本（已执行完毕，保留作历史参考）。
    // 里面大量「算了但没用到」的中间变量是迁移过程的产物，清理它们没有收益，
    // 反而会让这些只读参考脚本的 diff 变脏 —— 按目录关掉这条规则。
    files: ['tools/migration/**/*.{js,mjs}'],
    rules: { 'no-unused-vars': 'off' },
  },
  {
    // 这两个脚本是「贴到浏览器控制台/页面上下文里跑」的探针，不是 Node 脚本
    files: ['tools/probes-tests/scan-pages.js', 'scripts/check-pic-components.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
]
