import { isJsonBlob } from './blob-download'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

type DictItem = {
  value?: string | number
  label?: string
}

type DictSource = DictItem[] | Record<string, DictItem>

/**
 * Format a date/timestamp into a readable string.
 */
export function parseTime(
  time?: Date | string | number | null,
  pattern = '{y}-{m}-{d} {h}:{i}:{s}',
): string | null {
  if (time === undefined || time === null || time === '') {
    return null
  }

  let date: Date
  if (time instanceof Date) {
    date = time
  } else if (typeof time === 'object') {
    date = new Date(time as unknown as string)
  } else if (typeof time === 'string') {
    if (/^\d+$/.test(time)) {
      const numeric = Number.parseInt(time, 10)
      date = new Date(time.length === 10 ? numeric * 1000 : numeric)
    } else {
      const normalized = time
        .replace(/-/g, '/')
        .replace('T', ' ')
        .replace(/\.\d{3}/g, '')
      date = new Date(normalized)
    }
  } else {
    const ms = String(time).length === 10 ? time * 1000 : time
    date = new Date(ms)
  }

  const tokens: Record<string, number> = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay(),
  }

  return pattern.replace(/{(y|m|d|h|i|s|a)+}/g, (match, key: string) => {
    const val = tokens[key] ?? 0
    if (key === 'a') {
      return WEEKDAYS[val] ?? ''
    }
    if (match.length > 0 && val < 10) {
      return `0${val}`
    }
    return String(val)
  })
}

/**
 * Reset a form ref by calling its resetFields method when available.
 */
export function resetForm(this: { $refs?: Record<string, any> } | undefined, refName: string): void {
  this?.$refs?.[refName]?.resetFields?.()
}

/**
 * Attach begin/end date range fields onto `params.params`.
 */
export function addDateRange<T extends Record<string, any>>(
  params: T,
  dateRange?: unknown[],
  propName?: string,
): T {
  const target = params as Record<string, any>
  const current = target.params
  if (typeof current !== 'object' || current === null || Array.isArray(current)) {
    target.params = {}
  }

  const [begin, end] = Array.isArray(dateRange) ? dateRange : []
  if (propName === undefined) {
    target.params.beginTime = begin
    target.params.endTime = end
  } else {
    target.params[`begin${propName}`] = begin
    target.params[`end${propName}`] = end
  }
  return params
}

function listDictItems(datas: DictSource | null | undefined): DictItem[] {
  if (!datas) return []
  return Array.isArray(datas) ? datas : Object.values(datas)
}

/**
 * Resolve a single dictionary value to its display label.
 */
export function selectDictLabel(datas: DictSource, value: unknown): string {
  if (value === undefined) {
    return ''
  }
  const needle = String(value)
  const found = listDictItems(datas).find((item) => String(item?.value) === needle)
  return found?.label !== undefined ? String(found.label) : needle
}

/**
 * Resolve multiple dictionary values (array or delimited string) to labels.
 */
export function selectDictLabels(
  datas: DictSource,
  value: unknown,
  separator = ',',
): string {
  if (value === undefined || value === null) {
    return ''
  }
  const raw = Array.isArray(value) ? value.join(separator) : String(value)
  if (raw.length === 0) {
    return ''
  }
  const items = listDictItems(datas)
  return raw
    .split(separator)
    .map((token) => {
      const found = items.find((item) => String(item?.value) === token)
      return found?.label !== undefined ? String(found.label) : token
    })
    .join(separator)
}

/**
 * Simple `%s` string interpolation.
 */
export function sprintf(template: string, ...args: unknown[]): string {
  let idx = 0
  let missing = false
  const rendered = template.replace(/%s/g, () => {
    const arg = args[idx++]
    if (arg === undefined) {
      missing = true
      return ''
    }
    return String(arg)
  })
  return missing ? '' : rendered
}

/**
 * Normalize nullish or sentinel string values to an empty string.
 */
export function parseStrEmpty(value: unknown): string {
  if (!value || value === 'undefined' || value === 'null') {
    return ''
  }
  return String(value)
}

/**
 * Deeply merge plain object properties from `target` into `source`.
 */
export function mergeRecursive<T extends Record<string, any>>(
  source: T,
  target: Record<string, any>,
): T {
  const out = source as Record<string, any>
  for (const key of Object.keys(target)) {
    const val = target[key]
    const isPlainObj = val !== null && typeof val === 'object' && !Array.isArray(val) && val.constructor === Object
    if (isPlainObj && out[key] && typeof out[key] === 'object') {
      out[key] = mergeRecursive(out[key], val)
    } else {
      out[key] = val
    }
  }
  return source
}

/**
 * Convert a flat list of nodes into a nested tree structure.
 */
export function handleTree<T extends Record<string, any>>(
  data: T[],
  idKey = 'id',
  parentIdKey = 'parentId',
  childrenKey = 'children',
): T[] {
  const childrenMap = new Map<unknown, T[]>()
  const nodeIds = new Set<unknown>()

  for (const item of data) {
    const id = item[idKey]
    const parentId = item[parentIdKey]
    nodeIds.add(id)
    const siblings = childrenMap.get(parentId)
    if (siblings) {
      siblings.push(item)
    } else {
      childrenMap.set(parentId, [item])
    }
  }

  const roots = data.filter((item) => !nodeIds.has(item[parentIdKey]))

  const attachChildren = (node: T) => {
    const children = childrenMap.get(node[idKey])
    if (children) {
      ;(node as Record<string, any>)[childrenKey] = children
      for (const child of children) {
        attachChildren(child)
      }
    }
  }

  for (const root of roots) {
    attachChildren(root)
  }

  return roots
}

/**
 * Serialize query parameters, supporting nested one-level objects.
 */
export function tansParams(params: Record<string, any>): string {
  const parts: string[] = []
  for (const propName of Object.keys(params)) {
    const value = params[propName]
    if (value === null || value === '' || value === undefined) {
      continue
    }
    if (typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const nested = value[key]
        if (nested !== null && nested !== '' && nested !== undefined) {
          parts.push(`${encodeURIComponent(`${propName}[${key}]`)}=${encodeURIComponent(nested)}`)
        }
      }
    } else {
      parts.push(`${encodeURIComponent(propName)}=${encodeURIComponent(value)}`)
    }
  }
  return parts.length > 0 ? `${parts.join('&')}&` : ''
}

/**
 * Normalize duplicate slashes and trailing slash on a route path.
 */
export function getNormalPath(path?: string): string | undefined {
  if (!path || path.length === 0 || path === 'undefined') {
    return path
  }
  const normalized = path.replace('//', '/')
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

/**
 * Validate that a downloaded payload is a binary Blob rather than a JSON error.
 */
export function blobValidate(data: unknown): boolean {
  return !isJsonBlob(data)
}
