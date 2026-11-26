import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import {
  calculateSampleProgressColumnWidth,
  calculateSampleProgressColumnWidths,
  estimateTextWidthFallback,
  resolveSampleProgressColumnWidth,
  resolveSampleProgressDisplayText,
} from '../packages/ui/sampleProgressColumnWidth.js'

describe('sampleProgressColumnWidth', () => {
  it('distinguishes CJK and ASCII widths and respects font size scaling', () => {
    const cjk = estimateTextWidthFallback('客户名称', false, 14)
    const ascii = estimateTextWidthFallback('abcd', false, 14)
    const larger = estimateTextWidthFallback('CTK印字或中性', false, 16)
    const smaller = estimateTextWidthFallback('CTK印字或中性', false, 12)

    expect(cjk).toBeGreaterThan(ascii)
    expect(larger).toBeGreaterThan(smaller)
  })

  it('maps select values to display labels before measuring', () => {
    const statusField = {
      key: 'progressStatus',
      header: '流程状态',
      type: 'select',
      size: 94,
      minSize: 80,
      maxSize: 150,
      items: [{ value: 'waiting_sample', label: '待到样' }],
    }

    expect(resolveSampleProgressDisplayText(statusField, 'waiting_sample')).toBe('待到样')
    const width = calculateSampleProgressColumnWidth(statusField, [{ progressStatus: 'waiting_sample' }])
    expect(width).toBeGreaterThanOrEqual(80)
    expect(width).toBeLessThanOrEqual(115)
  })

  it('expands datasheet column to fit Chinese + ASCII text without truncating and clamps to [minSize, maxSize]', () => {
    const datasheetField = {
      key: 'datasheet',
      header: '规格书',
      size: 128,
      minSize: 90,
      maxSize: 260,
    }
    const shortWidth = calculateSampleProgressColumnWidth(datasheetField, [{ datasheet: 'CTK印字' }])
    const mediumWidth = calculateSampleProgressColumnWidth(datasheetField, [{ datasheet: 'CTK印字或中性印字' }])
    const longWidth = calculateSampleProgressColumnWidth(datasheetField, [{ datasheet: '超长规格书说明'.repeat(20) }])

    expect(shortWidth).toBeGreaterThanOrEqual(90)
    expect(mediumWidth).toBeGreaterThan(shortWidth)
    expect(mediumWidth).toBeGreaterThanOrEqual(140)
    expect(longWidth).toBe(260)
  })

  it('falls back to default size when rows are empty and resolves autoWidths over defaultSize', () => {
    const field = { key: 'customerName', header: '客户名称', size: 124, minSize: 96, maxSize: 240 }
    expect(calculateSampleProgressColumnWidth(field, [])).toBe(124)
    expect(resolveSampleProgressColumnWidth(field, { autoWidths: { customerName: 188 } })).toBe(188)
    expect(resolveSampleProgressColumnWidth(field, { autoWidths: {} })).toBe(124)

    const all = calculateSampleProgressColumnWidths([field], [{ customerName: '示例客户名称有限公司' }])
    expect(all.customerName).toBeGreaterThan(124)
  })

  it('compiles TkSampleProgressGrid.vue and sampleProgress/index.vue without SFC errors and keeps compact defaults + pageSize 100', () => {
    const files = [
      resolve(process.cwd(), 'app/packages/ui/TkSampleProgressGrid.vue'),
      resolve(process.cwd(), 'app/pages/tk_custom/sampleProgress/index.vue'),
    ]
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8')
      const { descriptor, errors } = parse(source, { filename: filePath })
      expect(errors).toEqual([])
      const script = compileScript(descriptor, { id: filePath })
      expect(script.content.length).toBeGreaterThan(0)
      const tpl = compileTemplate({ source: descriptor.template.content, filename: filePath, id: filePath })
      expect(tpl.errors).toEqual([])
    }

    const pageSource = readFileSync(files[1], 'utf8')
    const gridSource = readFileSync(files[0], 'utf8')
    expect(pageSource).toContain('pageSize: 100')
    expect(gridSource).toContain(':resize="false"')

    const sizes = [...pageSource.matchAll(/\{\s*key:\s*'[^']+',[\s\S]*?size:\s*(\d+)/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBe(33)
    const firstNineTotal = sizes.slice(0, 9).reduce((sum, n) => sum + n, 0)
    expect(firstNineTotal).toBeLessThanOrEqual(800)
  })
})
