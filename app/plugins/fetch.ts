import { getToken, refreshToken, removeToken } from '@/utils/auth'
import errorCode from '@/utils/errorCode'
import { tansParams } from '@/utils/helpers'
import cache from '@/plugins-legacy/cache'
import useUserStore from '@/store/modules/user.js'

function getToast() {
  if (typeof window !== 'undefined' && (window as any).__nuxt_ui_toast__) {
    return (window as any).__nuxt_ui_toast__
  }
  return null
}

function nuxtMsg(message: string, type?: string) {
  const t = getToast()
  if (t) {
    t.add({
      title: message,
      color: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'neutral',
      duration: 5000
    })
  }
}

function nuxtNotify(title: string) {
  const t = getToast()
  if (t) {
    t.add({ title, color: 'error', duration: 5000, icon: 'i-lucide-x-circle' })
  }
}

function getHeader(headers: any, key: string): any {
  if (!headers) return undefined
  if (headers instanceof Headers) {
    return headers.get(key)
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === key.toLowerCase())
    return found ? found[1] : undefined
  }
  const realKey = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase())
  return realKey ? headers[realKey] : undefined
}

function setHeader(headers: any, key: string, value: string) {
  if (!headers) return
  if (headers instanceof Headers) {
    headers.set(key, value)
  } else if (Array.isArray(headers)) {
    const index = headers.findIndex(([k]) => k.toLowerCase() === key.toLowerCase())
    if (index !== -1) {
      headers[index] = [key, value]
    } else {
      headers.push([key, value])
    }
  } else {
    const realKey = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase()) || key
    headers[realKey] = value
  }
}

function deleteHeader(headers: any, key: string) {
  if (!headers) return
  if (headers instanceof Headers) {
    headers.delete(key)
  } else if (Array.isArray(headers)) {
    const index = headers.findIndex(([k]) => k.toLowerCase() === key.toLowerCase())
    if (index !== -1) {
      headers.splice(index, 1)
    }
  } else {
    const realKey = Object.keys(headers).find(k => k.toLowerCase() === key.toLowerCase())
    if (realKey) {
      delete headers[realKey]
    }
  }
}

export const isRelogin = { show: false }

export default defineNuxtPlugin((nuxtApp) => {
  // 覆写全局的 $fetch 默认实例
  globalThis.$fetch = $fetch.create({
    baseURL: import.meta.env.VITE_APP_BASE_API,
    timeout: 1000 * 60 * 10,

    async onRequest(context) {
      const { request, options } = context
      options.headers = options.headers || {}

      // 是否需要设置 token
      const isToken = getHeader(options.headers, 'isToken') === false || getHeader(options.headers, 'isToken') === 'false'
      // 是否需要防止数据重复提交
      const isRepeatSubmit = getHeader(options.headers, 'repeatSubmit') === false || getHeader(options.headers, 'repeatSubmit') === 'false'

      // Nitro authentication uses an HttpOnly same-origin cookie. Keep
      // Authorization support for legacy clients, but never require the
      // browser to expose the new token to JavaScript.
      if (getToken() && !isToken) {
        setHeader(options.headers, 'Authorization', 'Bearer ' + getToken())
      }
      if (import.meta.server) {
        const requestHeaders = useRequestHeaders(['cookie', 'user-agent'])
        if (requestHeaders.cookie) setHeader(options.headers, 'cookie', requestHeaders.cookie)
        if (requestHeaders['user-agent']) setHeader(options.headers, 'user-agent', requestHeaders['user-agent'])
      }
      ;(options as any).credentials = 'include'

      // 移除辅助参数，不发送给后端
      deleteHeader(options.headers, 'isToken')
      deleteHeader(options.headers, 'repeatSubmit')

      // 兼容 Axios 的 params 传参，映射为 query
      if ((options as any).params) {
        options.query = (options as any).params
        delete (options as any).params
      }

      // 自动把 GET 请求 the query 对象通过 tansParams 序列化，并直接加到 url 尾部，与若依行为保持一致
      if (options.method?.toUpperCase() === 'GET' && options.query) {
        const requestUrl = typeof request === 'string' ? request : (request as any).url
        let url = requestUrl + '?' + tansParams(options.query)
        url = url.slice(0, -1)
        options.query = {}
        // 覆写真实请求地址
        context.request = url
      }

      // 兼容 Axios 的 data 传参，映射为 body
      if ((options as any).data) {
        options.body = (options as any).data
        delete (options as any).data
      }

      // 防重复提交拦截 (客户端运行时有效)
      if (import.meta.client && !isRepeatSubmit && (options.method?.toUpperCase() === 'POST' || options.method?.toUpperCase() === 'PUT')) {
        const bodyContent = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
        const requestObj = {
          url: context.request,
          data: bodyContent,
          time: new Date().getTime()
        }
        const requestSize = Object.keys(JSON.stringify(requestObj)).length
        const limitSize = 5 * 1024 * 1024 // 5M
        if (requestSize < limitSize) {
          const sessionObj = cache.session.getJSON('sessionObj')
          if (sessionObj === undefined || sessionObj === null || sessionObj === '') {
            cache.session.setJSON('sessionObj', requestObj)
          } else {
            const s_url = sessionObj.url
            const s_data = sessionObj.data
            const s_time = sessionObj.time
            const interval = 1000 // 1s
            if (s_url !== '/tk_custom/pic/dkPic' && s_data === requestObj.data && requestObj.time - s_time < interval && s_url === requestObj.url) {
              const message = '数据正在处理，请勿重复提交'
              console.warn(`[${s_url}]: ` + message)
              throw new Error(message)
            } else {
              cache.session.setJSON('sessionObj', requestObj)
            }
          }
        }
      }
    },

    async onResponse({ response, options }) {
      const resData = response._data
      const refreshedToken = response.headers?.get?.('x-nitro-token')
      if (refreshedToken) refreshToken(refreshedToken)
      // 二进制数据流则直接返回
      if (resData instanceof Blob || resData instanceof ArrayBuffer) {
        return
      }

      const code = resData?.code || 200
      const msg = errorCode[code] || resData?.msg || errorCode['default']
      const silentError = getHeader(options?.headers, 'silentError') === true || getHeader(options?.headers, 'silentError') === 'true'

      if (code === 401) {
        if (import.meta.client) {
          if (!isRelogin.show) {
            isRelogin.show = true
            const currentPath = window.location.pathname
            if (currentPath === '/login' || currentPath.endsWith('/login')) {
              isRelogin.show = false
            } else {
              nuxtMsg('登录状态已过期，请重新登录', 'warning')
              const doRedirect = () => {
                isRelogin.show = false
                navigateTo('/login')
              }
              try {
                const store = useUserStore()
                store.logOut().then(doRedirect).catch(() => {
                  store.token = ''
                  store.roles = []
                  store.permissions = []
                  store.menuIds = []
                  removeToken()
                  if (typeof window !== 'undefined') {
                    window.sessionStorage.removeItem('HAS_PROMPTED_DEFAULT_PWD')
                  }
                  doRedirect()
                })
              } catch {
                removeToken()
                doRedirect()
              }
            }
          }
        }
        throw new Error('无效的会话，或者会话已过期，请重新登录。')
      } else if (code === 500) {
        if (import.meta.client && !silentError) {
          nuxtMsg(msg, 'error')
        }
        throw new Error(msg)
      } else if (code === 601) {
        if (import.meta.client && !silentError) {
          nuxtMsg(msg, 'warning')
        }
        throw new Error(msg)
      } else if (code !== 200) {
        if (import.meta.client && !silentError) {
          nuxtNotify(msg)
        }
        throw new Error(msg)
      }

      // 将解包后的结果直接赋给 _data，让页面最终拿到的是 resData
      response._data = resData
    },

    async onResponseError({ response, options, error }) {
      if (import.meta.client) {
        // ofetch 在 HTTP 4xx/5xx 触发 onResponseError 时 error 为 undefined，
        // 真实响应体在 response._data 上；网络断连类错误才走 error。
        const body = response?._data ?? (error as any)?.data
        const serverMessage = String(body?.msg || body?.message || body?.statusMessage || '').trim()
        const statusFallback = response?.status ? `请求失败（HTTP ${response.status}）` : ''
        let message = serverMessage || error?.message || statusFallback || '网络连接异常'
        if (!serverMessage) {
          if (message === 'Fetch Error' || message.includes('Failed to fetch') || message.includes('connect ECONNREFUSED')) {
            message = '后端接口连接异常'
          } else if (message.includes('timeout')) {
            message = '系统接口请求超时'
          }
        }
        const silentError = getHeader(options?.headers, 'silentError') === true || getHeader(options?.headers, 'silentError') === 'true'
        if (!silentError) {
          nuxtMsg(message, 'error')
        }
      }
      if (error) return Promise.reject(error)
    }
  })
})
