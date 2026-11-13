import { listPd } from '../../../../utils/pd-read'

export default defineEventHandler((event) => listPd(event, 'pd'))
