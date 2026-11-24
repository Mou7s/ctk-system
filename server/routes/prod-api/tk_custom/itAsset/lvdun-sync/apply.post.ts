import { defineEventHandler } from 'h3'
import { applyItAssetLvDunSync } from '../../../../../utils/it-asset-lvdun-sync'

export default defineEventHandler((event) => applyItAssetLvDunSync(event))
