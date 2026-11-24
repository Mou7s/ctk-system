import { getLuckyRecentWinners } from '../../../../../utils/lucky-public-read'

export default defineEventHandler((event) => getLuckyRecentWinners(event))
