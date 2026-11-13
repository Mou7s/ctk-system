/**
 * v-copyText directive: copy text to clipboard on click using Clipboard API.
 */
async function writeClipboard(text) {
  const value = String(text ?? '')
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall through to legacy textarea fallback when clipboard permission is unavailable.
    }
  }
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  textarea.remove()
  return copied
}

export default {
  beforeMount(el, { value, arg }) {
    if (arg === 'callback') {
      el.$copyCallback = value
      return
    }
    el.$copyValue = value
    const onClick = async () => {
      await writeClipboard(el.$copyValue)
      if (typeof el.$copyCallback === 'function') {
        el.$copyCallback(el.$copyValue)
      }
    }
    el.addEventListener('click', onClick)
    el.$destroyCopy = () => el.removeEventListener('click', onClick)
  },
  updated(el, { value, arg }) {
    if (arg === 'callback') {
      el.$copyCallback = value
    } else {
      el.$copyValue = value
    }
  },
  unmounted(el) {
    el.$destroyCopy?.()
  },
}
