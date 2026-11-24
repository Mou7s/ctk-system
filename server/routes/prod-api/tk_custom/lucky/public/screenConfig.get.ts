import { getLuckyScreenConfig } from '../../../../../utils/lucky-public-read'

export default defineEventHandler((event) => getLuckyScreenConfig(event))
