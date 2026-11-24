import { getPd } from '../../../../utils/pd-read'

export default defineEventHandler((event) => getPd(event, 'pd'))
