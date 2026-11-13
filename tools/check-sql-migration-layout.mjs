#!/usr/bin/env bun
/**
 * 迁移目录规约检查（零依赖，只读）
 *
 * 背景：db/sql 顶层曾把「结构变更」与「数据回填/修正」混在一起（截至 2026-09-18 有 92 个
 * 文件含 DML，最大的单文件 6,749 行），重放语义只能靠人记。本脚本从 2026-09-18 起只约束
 * 新文件，历史文件走 baseline 白名单（tools/sql-migration-layout-baseline.json）。
 *
 * 规则（新文件）：
 *   1. db/sql 顶层 .sql 不允许再出现 INSERT/UPDATE/DELETE/REPLACE → 数据变更放 db/sql/data/
 *   2. db/sql/schema/*.sql 不允许出现 DML（结构目录只放 DDL）
 *   3. db/sql/{schema,data}/*.sql 文件名必须是 YYYYMMDD_描述.sql
 *   4. db/sql/data/*.sql 出现 DDL 只警告（回填前后顺手补列的场景仍需人工判断）
 *
 * 用法：
 *   bun tools/check-sql-migration-layout.mjs                 # 校验（有违规 exit 1）
 *   bun tools/check-sql-migration-layout.mjs --baseline      # 打印当前命中清单
 *   bun tools/check-sql-migration-layout.mjs --update-baseline  # 把当前命中写进白名单
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL_DIR = 'db/sql'
const BASELINE_FILE = 'tools/sql-migration-layout-baseline.json'
const NEW_LAYOUT_DIRS = ['schema', 'data']
const NAME_PATTERN = /^\d{8}_[^\\/:*?"<>|]+\.sql$/
const DML_PATTERN = /^[ \t]*(INSERT|UPDATE|DELETE|REPLACE)\b/gim
const DDL_PATTERN = /^[ \t]*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/gim

const mode = process.argv.includes('--update-baseline')
  ? 'update'
  : process.argv.includes('--baseline')
    ? 'report'
    : 'check'

function listSql(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length
}

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return new Set()
  const raw = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  return new Set(Array.isArray(raw.files) ? raw.files : [])
}

const topLevel = listSql(SQL_DIR)
const topLevelDml = topLevel.filter((name) => countMatches(readFileSync(join(SQL_DIR, name), 'utf8'), DML_PATTERN) > 0)

const errors = []
const warnings = []

for (const dir of NEW_LAYOUT_DIRS) {
  for (const name of listSql(join(SQL_DIR, dir))) {
    const path = join(SQL_DIR, dir, name)
    const text = readFileSync(path, 'utf8')
    const dml = countMatches(text, DML_PATTERN)
    const ddl = countMatches(text, DDL_PATTERN)
    if (dir === 'schema' && dml > 0) errors.push(`${path}: 结构目录里出现 ${dml} 处数据变更语句，请放到 db/sql/data/`)
    if (dir === 'data' && ddl > 0) warnings.push(`${path}: 数据目录里出现 ${ddl} 处 DDL，确认是回填必需的顺带结构变更`)
    if (!NAME_PATTERN.test(name)) errors.push(`${path}: 文件名不符合 YYYYMMDD_描述.sql`)
  }
}

if (mode === 'report' || mode === 'update') {
  console.log(`db/sql 顶层含数据变更的迁移文件：${topLevelDml.length} 个`)
  for (const name of topLevelDml) console.log(`  ${name}`)
  if (mode === 'update') {
    writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify({ note: '2026-09-18 之前的历史文件：结构/数据混放，按 D2 决策不追溯改名', files: topLevelDml }, null, 2)}\n`,
      'utf8',
    )
    console.log(`\n已写入白名单 ${BASELINE_FILE}`)
  }
  process.exit(0)
}

const baseline = loadBaseline()
const newViolations = topLevelDml.filter((name) => !baseline.has(name))
for (const name of newViolations) {
  errors.push(`db/sql/${name}: 顶层出现数据变更语句，请改放 db/sql/data/YYYYMMDD_描述.sql`)
}

if (warnings.length) {
  console.log('警告：')
  for (const item of warnings) console.log(`  - ${item}`)
}

if (errors.length) {
  console.error(`迁移目录规约检查未通过（${errors.length} 项）：`)
  for (const item of errors) console.error(`  - ${item}`)
  console.error(`\n历史文件白名单：${BASELINE_FILE}（${baseline.size} 个）；如需认领新文件请先确认口径再 --update-baseline`)
  process.exit(1)
}

console.log(`迁移目录规约检查通过：顶层 ${topLevel.length} 个历史文件（白名单 ${baseline.size} 个），新增目录 schema/ data/ 未发现违规`)
