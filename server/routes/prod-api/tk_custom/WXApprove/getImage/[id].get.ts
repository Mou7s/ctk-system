import { getWxApproveImage } from '../../../../../utils/wx-approve-read'

export default defineEventHandler((event) => getWxApproveImage(event, 'wx_pic'))
