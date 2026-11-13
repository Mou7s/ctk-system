import { describe, expect, it } from 'vitest'
import { encodeCode128, generateCode128Svg } from '../packages/shared/code128.js'

describe('Code 128 generator', () => {
  it('encodes username in Code 128B correctly', () => {
    const text = 'ChenJiaBin'
    const symbols = encodeCode128(text)
    expect(symbols.length).toBeGreaterThan(0)
    // Start B is 104, Stop is 106
    expect(symbols[0]).toBe(104)
    expect(symbols[symbols.length - 1]).toBe(106)
  })

  it('encodes 6-digit numeric password in Code 128C with pair compression', () => {
    const text = '839201'
    const symbols = encodeCode128(text)
    // Start C is 105, 83, 92, 01, checksum, stop 106
    expect(symbols[0]).toBe(105)
    expect(symbols[1]).toBe(83)
    expect(symbols[2]).toBe(92)
    expect(symbols[3]).toBe(1)
    expect(symbols[symbols.length - 1]).toBe(106)
    expect(symbols.length).toBe(6) // 105 + 3 pairs + checksum + 106
  })

  it('generates valid SVG output with rect elements', () => {
    const svg = generateCode128Svg('ChenGang', {
      height: 30,
      moduleWidth: 2,
    })
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<rect')
    expect(svg).toContain('</svg>')
  })

  it('handles empty text gracefully', () => {
    expect(encodeCode128('')).toEqual([])
    expect(generateCode128Svg('')).toBe('')
  })
})
