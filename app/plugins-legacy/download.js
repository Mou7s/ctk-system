import { saveAs } from 'file-saver'
import errorCode from '@/utils/errorCode'
import { blobValidate } from '@/utils/helpers'

function getToast() {
  if (typeof window !== 'undefined' && window.__nuxt_ui_toast__) {
    return window.__nuxt_ui_toast__
  }
  return null
}

function toastError(msg) {
  const t = getToast()
  if (t) t.add({ title: msg, color: 'error', duration: 4000 })
}

async function fetchBlob(url, options = {}) {
  return globalThis.$fetch.raw(url, {
    method: 'get',
    responseType: 'blob',
    ...options,
  })
}

function getDownloadFilename(headers) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return headers.get('download-filename') || ''
  }
  return headers['download-filename'] || headers['Download-Filename'] || ''
}

export default {
  name(name, isDelete = true) {
    const url = '/common/download?fileName=' + encodeURIComponent(name) + '&delete=' + isDelete
    fetchBlob(url).then(async (res) => {
      const data = res._data
      const isBlob = blobValidate(data)
      if (isBlob) {
        const blob = new Blob([data])
        this.saveAs(blob, decodeURIComponent(getDownloadFilename(res.headers)))
      } else {
        this.printErrMsg(data)
      }
    })
  },
  resource(resource) {
    const url = '/common/download/resource?resource=' + encodeURIComponent(resource)
    fetchBlob(url).then(async (res) => {
      const data = res._data
      const isBlob = blobValidate(data)
      if (isBlob) {
        const blob = new Blob([data])
        this.saveAs(blob, decodeURIComponent(getDownloadFilename(res.headers)))
      } else {
        this.printErrMsg(data)
      }
    })
  },
  zip(url, name) {
    fetchBlob(url)
      .then(async (res) => {
        const data = res._data
        const isBlob = blobValidate(data)
        if (isBlob) {
          const blob = new Blob([data], { type: 'application/zip' })
          this.saveAs(blob, name)
        } else {
          this.printErrMsg(data)
        }
      })
      .catch((r) => {
        console.error(r)
        toastError('下载文件出现错误，请联系管理员！')
      })
  },
  saveAs(text, name, opts) {
    saveAs(text, name, opts)
  },
  async printErrMsg(data) {
    const resText = await data.text()
    const rspObj = JSON.parse(resText)
    const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode['default']
    toastError(errMsg)
  },
}
