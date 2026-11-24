import { tkApi } from '@/plugins-legacy/tkApi'

export const listSalesOutbound = (params) => tkApi.listSalesOutbound(params)
export const listKingdeeWarehouses = () => tkApi.listKingdeeWarehouses()
export const listKingdeeLocations = (params) => tkApi.listKingdeeLocations(params)
export const listKingdeeInventory = (params) => tkApi.listKingdeeInventory(params)
export const getSalesOutboundPicking = (billNo) => tkApi.getSalesOutboundPicking(billNo)
export const listProductionReceipt = (params) => tkApi.listProductionReceipt(params)
export const exportProductionReceiptMatrix = (params) => tkApi.exportProductionReceiptMatrix(params)
export const exportSalesOutboundMatrix = (params) => tkApi.exportSalesOutboundMatrix(params)
export const completeSalesOutbound = (data) => tkApi.completeSalesOutbound(data)
export const listPurchaseOrder = (params) => tkApi.listPurchaseOrder(params)
export const listPurchaseInbound = (params) => tkApi.listPurchaseInbound(params)
export const completePurchaseInbound = (data) => tkApi.completePurchaseInbound(data)
