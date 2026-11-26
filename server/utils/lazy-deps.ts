import { createRequire } from 'node:module'

type MssqlModule = typeof import('mssql')
type Ssh2Module = typeof import('ssh2')
type SharpFn = (typeof import('sharp'))['default']
type XlsxModule = typeof import('xlsx')

let mssqlPromise: Promise<MssqlModule> | null = null
let mssqlCached: MssqlModule | null = null
let ssh2Promise: Promise<Ssh2Module> | null = null
let sharpPromise: Promise<SharpFn> | null = null
let xlsxPromise: Promise<XlsxModule> | null = null
let xlsxCached: XlsxModule | null = null
let xlsxStylePromise: Promise<any> | null = null
let xlsxStyleCached: any = null

let cachedRequire: NodeRequire | null = null

function getRequire(): NodeRequire {
  if (!cachedRequire) {
    cachedRequire = createRequire(import.meta.url)
  }
  return cachedRequire
}

function unwrapDefault<T>(mod: any): T {
  return (mod?.default ?? mod) as T
}

export async function loadMssql(): Promise<MssqlModule> {
  if (!mssqlPromise) {
    mssqlPromise = import('mssql').then((mod) => {
      const resolved = unwrapDefault<MssqlModule>(mod)
      mssqlCached = resolved
      return resolved
    })
  }
  return mssqlPromise
}

/**
 * 同步获取已加载的 mssql 模块；若尚未通过 loadMssql() 加载则按需 require。
 * 主要供 sqlStringParameter / sqlDateParameter / sqlBigIntParameter 等同步参数绑定 helper 使用。
 */
export function getMssqlSync(): MssqlModule {
  if (!mssqlCached) {
    mssqlCached = unwrapDefault<MssqlModule>(getRequire()('mssql'))
  }
  return mssqlCached
}

export async function loadSsh2(): Promise<Ssh2Module> {
  if (!ssh2Promise) {
    ssh2Promise = import('ssh2').then((mod) => unwrapDefault<Ssh2Module>(mod))
  }
  return ssh2Promise
}

export async function loadSharp(): Promise<SharpFn> {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((mod) => unwrapDefault<SharpFn>(mod))
  }
  return sharpPromise
}

export async function loadXlsx(): Promise<XlsxModule> {
  if (xlsxCached) return xlsxCached
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx/xlsx.mjs').then((mod) => {
      const resolved = (mod?.utils ? mod : unwrapDefault<XlsxModule>(mod)) as XlsxModule
      xlsxCached = resolved
      return resolved
    })
  }
  return xlsxPromise
}

/**
 * 同步按需加载 xlsx（保持既有纯同步解析/构建函数签名不变，且不触发 Nitro dev 顶层静态 import）。
 */
export function getXlsxSync(): XlsxModule {
  if (!xlsxCached) {
    const mod = getRequire()('xlsx')
    xlsxCached = (mod?.utils ? mod : unwrapDefault<XlsxModule>(mod)) as XlsxModule
  }
  return xlsxCached
}

export async function loadXlsxStyle(): Promise<any> {
  if (xlsxStyleCached) return xlsxStyleCached
  if (!xlsxStylePromise) {
    xlsxStylePromise = import('xlsx-js-style').then((mod) => {
      const resolved = mod?.utils ? mod : unwrapDefault<any>(mod)
      xlsxStyleCached = resolved
      return resolved
    })
  }
  return xlsxStylePromise
}

/**
 * 同步按需加载 xlsx-js-style（保持既有纯同步渲染函数签名不变，且不触发 Nitro dev 顶层静态 import）。
 */
export function getXlsxStyleSync(): any {
  if (!xlsxStyleCached) {
    const mod = getRequire()('xlsx-js-style')
    xlsxStyleCached = mod?.utils ? mod : unwrapDefault<any>(mod)
  }
  return xlsxStyleCached
}
