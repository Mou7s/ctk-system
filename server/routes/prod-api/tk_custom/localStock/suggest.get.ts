import { suggestLocalStockLocation } from '../../../../utils/local-stock-read'

export default defineEventHandler((event) => suggestLocalStockLocation(event))
