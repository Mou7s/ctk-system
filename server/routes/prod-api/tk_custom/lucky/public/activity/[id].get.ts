import { getLuckyActivityDetail } from '../../../../../../utils/lucky-public-read'

export default defineEventHandler((event) => getLuckyActivityDetail(event))
