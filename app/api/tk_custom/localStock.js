import { tkApi } from '@/plugins-legacy/tkApi'

export const listLocalStock = (query) => tkApi.listLocalStock(query)
export const getLocalStockSummary = () => tkApi.getLocalStockSummary()
export const listLocalStockTxn = (query) => tkApi.listLocalStockTxn(query)
export const inboundLocalStock = (data) => tkApi.inboundLocalStock(data)
export const getStagingReceipt = (billNo) => tkApi.getStagingReceipt(billNo)
export const getStagingByPlan = (planNo) => tkApi.getStagingByPlan(planNo)
export const getStagingByLegacyMaterial = (materialCode) => tkApi.getStagingByLegacyMaterial(materialCode)
export const getMaterialInventory = (materialCode) => tkApi.getMaterialInventory(materialCode)
export const transferStagingStock = (data) => tkApi.transferStagingStock(data)
export const suggestLocalStockLocation = (params) => tkApi.suggestLocalStockLocation(params)
