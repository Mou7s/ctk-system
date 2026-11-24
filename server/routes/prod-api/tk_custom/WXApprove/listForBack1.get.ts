import { listWxApprove } from '../../../../utils/wx-approve-read'

export default defineEventHandler((event) => listWxApprove(event, 'back1'))
