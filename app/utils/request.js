import { tansParams, blobValidate } from '@/utils/helpers'
import { getToken } from '@/utils/auth'

function getToast() {
  if (typeof window !== 'undefined' && window.__nuxt_ui_toast__) {
    return window.__nuxt_ui_toast__
  }
  return null
}

function nuxtMsg(message, type) {
  const t = getToast()
  if (t) {
    t.add({
      title: message,
      color: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'neutral',
      duration: 5000
    })
  }
}

// 兼容老页面 import { isRelogin } from '@/utils/request' 的导出
export const isRelogin = { show: false }

function serverRequestUrl(url) {
  if (!import.meta.server || /^https?:\/\//i.test(url)) return url
  const base = String(import.meta.env.VITE_APP_BASE_API || '/prod-api').replace(/\/$/, '')
  const path = String(url || '')
  return path === base || path.startsWith(`${base}/`)
    ? path
    : `${base}/${path.replace(/^\//, '')}`
}

/**
 * 兼容层：将历史 request 调用签名适配并转发到全局 Nuxt $fetch
 */
export default function request(config) {
  const method = (config.method || 'GET').toUpperCase()
  const options = {
    method,
    headers: config.headers || {},
    ...config
  }

  // 兼容 Axios 的 params 传参，映射为 query
  if (config.params) {
    options.query = config.params
    delete options.params
  }

  // 兼容 Axios 的 data 传参，映射为 body
  if (config.data) {
    options.body = config.data
    delete options.data
  }

  // 发送请求，这里会走全局在 app/plugins/fetch.ts 中重写的拦截逻辑
  const fetcher = import.meta.server && typeof useRequestFetch === 'function'
    ? useRequestFetch()
    : globalThis.$fetch
  return fetcher(serverRequestUrl(config.url), options)
}

/**
 * Multipart upload helper with browser-native progress events.
 * The API package accesses this through request.upload so business pages do not
 * need to duplicate token and base-URL handling.
 */
export function upload(url, formData, config = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const baseUrl = import.meta.env.VITE_APP_BASE_API || ''
    const target = /^https?:\/\//i.test(url) ? url : `${baseUrl}${url}`
    const token = getToken()
    let settled = false

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (config.signal) config.signal.removeEventListener('abort', abort)
      callback(value)
    }

    const abort = () => {
      xhr.abort()
      finish(reject, new Error('上传已取消'))
    }

    xhr.open('POST', target, true)
    xhr.timeout = config.timeout || 10 * 60 * 1000
    xhr.withCredentials = true
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('repeatSubmit', 'false')

    xhr.upload.onprogress = (event) => {
      if (typeof config.onProgress === 'function') {
        config.onProgress(event.loaded, event.total || 0)
      }
    }

    xhr.onload = () => {
      let response
      try {
        response = JSON.parse(xhr.responseText || '{}')
      } catch {
        finish(reject, new Error('上传接口返回格式异常'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300 || response.code !== 200) {
        finish(reject, new Error(response.msg || `上传失败（${xhr.status}）`))
        return
      }
      finish(resolve, response)
    }
    xhr.onerror = () => finish(reject, new Error('上传网络连接失败'))
    xhr.ontimeout = () => finish(reject, new Error('上传超时，请检查网络后重试'))
    xhr.onabort = () => finish(reject, new Error('上传已取消'))
    if (config.signal) {
      if (config.signal.aborted) {
        abort()
        return
      }
      config.signal.addEventListener('abort', abort, { once: true })
    }
    xhr.send(formData)
  })
}

request.upload = upload

/**
 * 通用下载方法 (Fetch 版本兼容)
 */
export function download(url, params, filename, config = {}) {
  const bodyData = tansParams(params)
  const fetcher = import.meta.server && typeof useRequestFetch === 'function'
    ? useRequestFetch()
    : globalThis.$fetch
  return fetcher(serverRequestUrl(url), {
    method: 'POST',
    body: bodyData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...config.headers
    },
    responseType: 'blob',
    ...config
  }).then(async (data) => {
    const isBlob = blobValidate(data)
    if (isBlob) {
      const blob = new Blob([data])
      const { saveAs } = await import('file-saver')
      saveAs(blob, filename)
    } else {
      const resText = await data.text()
      const rspObj = JSON.parse(resText)
      nuxtMsg(rspObj.msg || '下载文件出现错误，请联系管理员！', 'error')
    }
  }).catch((r) => {
    console.error(r)
    nuxtMsg('下载文件出现错误，请联系管理员！', 'error')
  })
}
