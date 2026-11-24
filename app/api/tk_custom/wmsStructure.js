import { tkApi } from '@/plugins-legacy/tkApi'

export const getWmsStructureOverview = () => tkApi.getWmsStructureOverview()
export const getWmsLocation = (locationCode) => tkApi.getWmsLocation(locationCode)
export const updateWmsLocationStatus = (data) => tkApi.updateWmsLocationStatus(data)

