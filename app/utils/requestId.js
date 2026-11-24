let fallbackSequence = 0

/** UUID-shaped idempotency key for APIs backed by CHAR(36), including HTTP pages. */
export function createClientRequestUuid() {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    // This is an idempotency key, never an authentication/security token.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    const timestamp = Date.now()
    fallbackSequence += 1
    for (let i = 0; i < 6; i += 1) bytes[i] ^= Math.floor(timestamp / 2 ** (8 * i)) & 255
    for (let i = 0; i < 4; i += 1) bytes[12 + i] ^= (fallbackSequence >>> (8 * i)) & 255
  }
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Generate an opaque client request id that also works on the HTTP production
 * entry point where Web Crypto may not be exposed by the browser.
 *
 * This id is only an idempotency key, not an authentication or security token.
 */
export function createClientRequestId(prefix = 'request') {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (typeof uuid === 'string' && uuid) return uuid

  fallbackSequence += 1
  const safePrefix = String(prefix || 'request').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 16) || 'request'
  return `${safePrefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
