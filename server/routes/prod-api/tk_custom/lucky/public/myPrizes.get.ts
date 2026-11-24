import { getLuckyMyPrizes } from '../../../../../utils/lucky-public-read'

export default defineEventHandler((event) => getLuckyMyPrizes(event))
