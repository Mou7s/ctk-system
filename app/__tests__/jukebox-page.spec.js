import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const JUKEBOX_FILES = [
  'app/pages/tk_custom/jukebox/index.vue',
  'app/components/tk_custom/jukebox/JukeboxPlayerBar.vue',
  'app/components/tk_custom/jukebox/JukeboxTrackList.vue',
  'app/components/tk_custom/jukebox/JukeboxScheduleTab.vue',
  'app/components/tk_custom/jukebox/JukeboxQueueTab.vue',
  'app/components/tk_custom/jukebox/JukeboxDiagnosticsTab.vue',
]

function compileSfcFile(relativePath) {
  const fullPath = resolve(process.cwd(), relativePath)
  const source = readFileSync(fullPath, 'utf8')
  const { descriptor, errors } = parse(source, { filename: fullPath })
  if (errors.length) return { source, parseErrors: errors, templateErrors: [] }
  const script = compileScript(descriptor, { id: relativePath })
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: fullPath,
    id: relativePath,
    compilerOptions: { bindingMetadata: script.bindings },
  })
  return { source, parseErrors: [], templateErrors: template.errors }
}

describe('Jukebox redesigned page & components', () => {
  it.each(JUKEBOX_FILES)('compiles %s cleanly with @vue/compiler-sfc', (file) => {
    const { parseErrors, templateErrors } = compileSfcFile(file)
    expect(parseErrors).toEqual([])
    expect(templateErrors).toEqual([])
  })

  it('removes legacy layout bugs, invalid Tailwind shades, and fake user chrome', () => {
    const allSources = JUKEBOX_FILES.map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')

    expect(allSources).not.toContain('h-[calc(100vh-112px)]')
    expect(allSources).not.toContain('fixed bottom-6')
    expect(allSources).not.toContain('window.prompt')
    expect(allSources).not.toContain('window.confirm')
    expect(allSources).not.toContain('mou7s')
    expect(allSources).not.toContain('let playerStateLoading = false')
    expect(allSources).toContain('const playerStateLoading = ref(false)')
    expect(allSources).not.toMatch(/slate-(?:350|450|455|550|650|655|855)|rose-555/)
  })

  it('uses Nuxt UI components, fine-grained permissions, and silent polling', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'app/pages/tk_custom/jukebox/index.vue'), 'utf8')
    const barSource = readFileSync(resolve(process.cwd(), 'app/components/tk_custom/jukebox/JukeboxPlayerBar.vue'), 'utf8')
    const trackSource = readFileSync(resolve(process.cwd(), 'app/components/tk_custom/jukebox/JukeboxTrackList.vue'), 'utf8')
    const scheduleSource = readFileSync(resolve(process.cwd(), 'app/components/tk_custom/jukebox/JukeboxScheduleTab.vue'), 'utf8')

    expect(pageSource).toContain('tk_custom:jukebox:play')
    expect(pageSource).toContain('tk_custom:jukebox:manage')
    expect(pageSource).toContain('tk_custom:jukebox:schedule')
    expect(pageSource).toContain('tk_custom:jukebox:diagnostics')
    expect(pageSource).toContain("silentError: 'true'")
    expect(pageSource).toContain('<UTabs')
    expect(pageSource).toContain('<USlideover')

    expect(barSource).toContain('<USlider')
    expect(trackSource).toContain('<UFileUpload')
    expect(scheduleSource).toContain('<USlideover')
  })
})
