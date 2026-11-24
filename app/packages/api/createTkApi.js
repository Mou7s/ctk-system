import { createExceptionApi } from './modules/exception.js';
import { createDummyPieceApi } from './modules/dummyPiece.js';
import { createProcessOutputReportApi } from './modules/processOutputReport.js';
import { createProductionOrderApi } from './modules/productionOrder.js';
import { createStockDocumentApi } from './modules/stockDocument.js';
import { createSalesPriceTrendApi } from './modules/salesPriceTrend.js';
import { createExceptionStatsApi } from './modules/exceptionStats.js';
import { createExecuteSqlApi } from './modules/executeSql.js';
import { createGxjlApi } from './modules/gxjl.js';
import { createKucunApi } from './modules/kucun.js';
import { createDeliveryAlertApi } from './modules/deliveryAlert.js';
import { createLuckyDrawApi } from './modules/luckyDraw.js';
import { createLuckyPkApi } from './modules/luckyPk.js';
import { createMoApi } from './modules/mo.js';
import { createMsgtowxApi } from './modules/msgtowx.js';
import { createMusicApi } from './modules/music.js';
import { createWfExportApi } from './modules/wfExport.js';
import { createPdApi } from './modules/pd.js';
import { createPdCkApi } from './modules/pdCk.js';
import { createPicApi } from './modules/pic.js';
import { createQaShippingApi } from './modules/qaShipping.js';
import { createSuggestApi } from './modules/suggest.js';
import { createTalentApiApi } from './modules/talentApi.js';
import { createWipApi } from './modules/wip.js';
import { createWxApproveApi } from './modules/wxApprove.js';
import { createWxuserApi } from './modules/wxuser.js';
import { createProcessYieldApi } from './modules/processYield.js';
import { createLocalStockApi } from './modules/localStock.js';
import { createCustomerOverdueArApi } from './modules/customerOverdueAr.js';
import { createWmsStructureApi } from './modules/wmsStructure.js';
import { createVideoLibraryApi } from './modules/videoLibrary.js';
import { createQuotationApi } from './modules/quotation.js';
import { createDomesticQuotationApi } from './modules/domesticQuotation.js';
import { createSampleProgressApi } from './modules/sampleProgress.js';
import { createSampleTestApi } from './modules/sampleTest.js';
import { createNpiApi } from './modules/npi.js';
import { createAttendanceApi } from './modules/attendance.js';
import { createSupplierAccessApi } from './modules/supplierAccess.js';
import { createOrganizationApi } from './modules/organization.js';
import { createMaterialMasterApi } from './modules/materialMaster.js';
import { createWireBondCardApi } from './modules/wireBondCard.js';
import { createItAssetApi } from './modules/itAsset.js';

/**
 * Build tk_custom API surface from the web app's request instance.
 * @param {Function} request $fetch wrapper from apps/web
 */
export function createTkApi(request) {
  if (typeof request !== 'function') {
    throw new Error('createTkApi(request): request must be a function');
  }
  return {
    ...createExceptionApi(request),
    ...createDummyPieceApi(request),
    ...createProcessOutputReportApi(request),
    ...createProductionOrderApi(request),
    ...createStockDocumentApi(request),
    ...createSalesPriceTrendApi(request),
    ...createExceptionStatsApi(request),
    ...createExecuteSqlApi(request),
    ...createGxjlApi(request),
    ...createKucunApi(request),
    ...createDeliveryAlertApi(request),
    ...createLuckyDrawApi(request),
    ...createLuckyPkApi(request),
    ...createMoApi(request),
    ...createMsgtowxApi(request),
    ...createMusicApi(request),
    ...createWfExportApi(request),
    ...createPdApi(request),
    ...createPdCkApi(request),
    ...createPicApi(request),
    ...createQaShippingApi(request),
    ...createSuggestApi(request),
    ...createTalentApiApi(request),
    ...createWipApi(request),
    ...createWxApproveApi(request),
    ...createWxuserApi(request),
    ...createProcessYieldApi(request),
    ...createLocalStockApi(request),
    ...createCustomerOverdueArApi(request),
    ...createWmsStructureApi(request),
    ...createVideoLibraryApi(request),
    ...createQuotationApi(request),
    ...createDomesticQuotationApi(request),
    ...createSampleProgressApi(request),
    ...createSampleTestApi(request),
    ...createNpiApi(request),
    ...createAttendanceApi(request),
    ...createSupplierAccessApi(request),
    ...createOrganizationApi(request),
    ...createMaterialMasterApi(request),
    ...createWireBondCardApi(request),
    ...createItAssetApi(request),
  };
}
