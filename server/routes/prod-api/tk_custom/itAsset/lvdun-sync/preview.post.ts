import { defineEventHandler } from 'h3'
import { previewItAssetLvDunSync } from '../../../../../utils/it-asset-lvdun-sync'

export default defineEventHandler((event) => previewItAssetLvDunSync(event))
