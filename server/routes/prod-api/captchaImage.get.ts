import { getHeader } from 'h3'
import { createMathCaptcha } from '../../utils/captcha'
import { getGarnet } from '../../utils/redis'
import { apiError, apiSuccessFields, errorMessage } from '../../utils/response'
import { getConfigValue } from '../../utils/user-repository'

export default defineEventHandler(async (event) => {
  try {
    const configured = await getConfigValue('sys.account.captchaEnabled')
    const enabled = configured == null ? true : configured.toLowerCase() === 'true'
    if (!enabled) return apiSuccessFields({ captchaEnabled: false })

    const captcha = createMathCaptcha()
    await getGarnet().set(`captcha_codes:${captcha.uuid}`, captcha.code, 'EX', 120)
    void getHeader(event, 'user-agent')
    return apiSuccessFields({
      captchaEnabled: true,
      uuid: captcha.uuid,
      img: captcha.image,
    })
  } catch (error) {
    console.error('[NitroAuth] captcha generation failed:', errorMessage(error, 'unknown error'))
    return apiError('验证码服务暂不可用', 500)
  }
})
