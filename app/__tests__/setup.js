import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), '../assets/styles')
const tokenStyle = document.createElement('style')
tokenStyle.textContent = [
  readFileSync(join(stylesDir, 'dark.css'), 'utf8'),
  readFileSync(join(stylesDir, 'global.css'), 'utf8'),
  readFileSync(join(stylesDir, 'sidebar.css'), 'utf8'),
].join('\n')
document.head.appendChild(tokenStyle)

if (typeof globalThis.localStorage?.getItem !== 'function') {
  const testWindow = new Window({ url: 'http://localhost/' })
  globalThis.localStorage = testWindow.localStorage
}