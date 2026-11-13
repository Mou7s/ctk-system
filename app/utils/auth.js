import Cookies from 'js-cookie'

const TokenKey = 'Admin-Token'
// During the Nitro migration, legacy Java endpoints still need the token in
// an Authorization header. Keep that compatibility copy separate from
// Nitro's HttpOnly cookie so the browser can read it without overwriting the
// secure session cookie.
const LegacyTokenKey = 'Admin-Token-Legacy'

export function getToken() {
  if (typeof document === 'undefined') return undefined
  return Cookies.get(LegacyTokenKey) || Cookies.get(TokenKey)
}

export function refreshToken(token) {
  if (typeof document === 'undefined' || !token) return token
  Cookies.set(LegacyTokenKey, token, { path: '/', sameSite: 'lax' })
  return token
}

export function setToken(token) {
  if (typeof document === 'undefined') return token
  if (token) Cookies.set(LegacyTokenKey, token, { path: '/', sameSite: 'lax' })
  return token
}

export function removeToken() {
  if (typeof document === 'undefined') return undefined
  Cookies.remove(LegacyTokenKey, { path: '/' })
  Cookies.remove(TokenKey, { path: '/' })
}
