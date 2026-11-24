const profilePathPattern = /^\/(?:profile|upload)(?:\/|$)/i

function baseApiPath() {
  return String(import.meta.env.VITE_APP_BASE_API || "/prod-api").replace(/\/$/, "")
}

export function resolveProfileImageUrl(value) {
  let normalized = String(value ?? "").trim().replaceAll("\\", "/")
  if (!normalized) return ""
  if (/^(?:https?:|data:|blob:|\/\/)/i.test(normalized)) return normalized

  if (!normalized.startsWith("/")) normalized = `/${normalized}`
  normalized = normalized.replace(/^\/prod-api(?=\/(?:profile|upload)(?:\/|$))/i, "")

  if (/^\/upload(?:\/|$)/i.test(normalized)) {
    normalized = `/profile${normalized}`
  }
  if (profilePathPattern.test(normalized)) return normalized

  const base = baseApiPath()
  if (normalized === base || normalized.startsWith(`${base}/`)) return normalized
  return `${base}${normalized}`
}

export function normalizeProfileImageList(value) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",")
  return values
    .map((item) => (item && typeof item === "object" ? item.url : item))
    .map(resolveProfileImageUrl)
    .filter(Boolean)
}
