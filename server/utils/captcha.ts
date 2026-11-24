import { randomInt } from 'node:crypto'

export interface CaptchaResult {
  uuid: string
  code: string
  image: string
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] || char)
}

function svgData(text: string): string {
  const noise = Array.from({ length: 7 }, (_, index) => {
    const x1 = randomInt(5, 150)
    const y1 = randomInt(8, 38)
    const x2 = randomInt(5, 150)
    const y2 = randomInt(8, 38)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${randomInt(0x888888, 0xffffff).toString(16)}" stroke-width="1" opacity=".55"/>`
  }).join('')
  const encoded = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48"><rect width="160" height="48" fill="#f8fafc"/>${noise}<text x="80" y="33" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="3" fill="#1e3a8a">${escapeXml(text)}</text></svg>`).toString('base64')
  return encoded
}

export function createMathCaptcha(): CaptchaResult {
  const left = randomInt(1, 20)
  const right = randomInt(1, 20)
  const operation = randomInt(0, 3)
  if (operation === 0) return { uuid: crypto.randomUUID(), code: String(left + right), image: svgData(`${left} + ${right}`) }
  if (operation === 1) {
    const high = Math.max(left, right)
    const low = Math.min(left, right)
    return { uuid: crypto.randomUUID(), code: String(high - low), image: svgData(`${high} - ${low}`) }
  }
  if (operation === 2) return { uuid: crypto.randomUUID(), code: String(left * right), image: svgData(`${left} × ${right}`) }
  return { uuid: crypto.randomUUID(), code: String(left + right), image: svgData(`${left} + ${right}`) }
}
