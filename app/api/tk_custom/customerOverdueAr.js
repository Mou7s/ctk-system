import { tkApi } from '@/plugins-legacy/tkApi'
export const getOverdueAlertSettings = () => tkApi.getOverdueAlertSettings()
export const saveOverdueAlertSettings = (data) => tkApi.saveOverdueAlertSettings(data)
export const previewOverdueAlert = () => tkApi.previewOverdueAlert()
export const getOverdueAlertLogs = () => tkApi.getOverdueAlertLogs()
export const exportOverdueAlert = (params) => tkApi.exportOverdueAlert(params)

export const listCustomerOverdueAr = (params) => tkApi.listCustomerOverdueAr(params)
export const listCustomerOverdueArBills = (params) => tkApi.listCustomerOverdueArBills(params)
export const freezeCustomerOutStock = (params) => tkApi.freezeCustomerOutStock(params)
export const unfreezeCustomerOutStock = (params) => tkApi.unfreezeCustomerOutStock(params)
