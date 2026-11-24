import { updateWxApproveTime } from '../../../../utils/wx-approve-read'

export default defineEventHandler((event) => updateWxApproveTime(event, 'out'))
