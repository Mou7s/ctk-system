import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'

const PAGE_PATH = resolve(process.cwd(), 'app/pages/tk_custom/itAsset/index.vue')
const source = readFileSync(PAGE_PATH, 'utf8')

function compilePage(sfcSource) {
  const { descriptor, errors } = parse(sfcSource, { filename: PAGE_PATH })
  if (errors.length) return { parseErrors: errors, templateErrors: [] }
  const script = compileScript(descriptor, { id: 'it-asset-page-check' })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: PAGE_PATH,
    id: 'it-asset-page-check',
    compilerOptions: { bindingMetadata: script.bindings },
  })
  return { parseErrors: [], templateErrors: template.errors }
}

describe('IT asset management page SFC & guards', () => {
  it('compiles template and script setup without SFC errors', () => {
    const { parseErrors, templateErrors } = compilePage(source)
    expect(parseErrors).toEqual([])
    expect(templateErrors).toEqual([])
  })

  it('uses Nuxt UI calendar/range-picker components without native type="date" or Element Plus', () => {
    const templatePart = source.slice(0, source.indexOf('<script'))
    expect(templatePart).toContain('<UCalendar')
    expect(templatePart).toContain('<TkDateRangePicker')
    expect(templatePart).not.toMatch(/type="date"/)
    expect(templatePart).not.toMatch(/<el-[a-z-]+/i)
  })

  it('guards Excel blob downloads against JSON error payloads and integrates 70x50mm QR printing without pagination limits', () => {
    expect(source).toContain('isJsonBlob')
    expect(source).toContain('readBlobErrorMessage')
    expect(source).toContain('BrowserQRCodeSvgWriter')
    expect(source).toContain('buildItAssetPrintHtml')
    expect(source).toContain('useTkListQuery')
    expect(source).toContain("id: 'select'")
    expect(source).not.toContain('<TkPagination')
    expect(source).not.toContain('TkPagination')
    expect(source).toContain('all: true')
    expect(source).not.toMatch(/\bpageSize\s*:/)
  })
})
