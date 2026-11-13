import { readMultipartFormData } from 'h3'
import { getAuthSession } from '../../../../utils/auth'
import { apiError } from '../../../../utils/response'
import { getNitroServerConfig } from '../../../../utils/runtime'
import { PicUploadError, savePicUpload } from '../../../../utils/pic-upload'

export default defineEventHandler(async (event) => {
  if (!(await getAuthSession(event))) return apiError('登录状态已过期', 401)

  try {
    const parts = await readMultipartFormData(event)
    const file = parts?.find((part) => part.name === 'file' && part.filename)
    if (!file) return apiError('上传图片异常，请联系管理员')

    const result = await savePicUpload(file, getNitroServerConfig().profilePath)
    return { code: 200, msg: result.publicPath }
  } catch (error) {
    if (error instanceof PicUploadError) return apiError(error.message)
    console.error('[Nitro:PicUpload] failed:', error instanceof Error ? error.message : 'unknown error')
    return apiError('图片上传失败，请稍后重试')
  }
})
