import { describe, expect, it, vi } from 'vitest';
import { createTkApi } from '@ctk-system/api';

describe('@ctk-system/api', () => {
  it('createTkApi exposes methods from all migrated modules', async () => {
    const request = vi.fn().mockResolvedValue({ rows: [], total: 0 });
    request.upload = vi.fn().mockResolvedValue({ code: 200, data: {} });
    const api = createTkApi(request);

    const samples = [
      ['listException', { url: '/tk_custom/exception/list', method: 'get' }],
      ['listDummyPieceMonthly', { url: '/tk_custom/dummyPiece/monthly/list', method: 'get' }],
      ['getProcessOutputSummary', { url: '/tk_custom/processOutputReport/summary', method: 'get' }],
      ['completeSalesOutbound', { url: '/tk_custom/stockDocument/salesOutbound/complete', method: 'post' }],
      ['listKingdeeWarehouses', { url: '/tk_custom/stockDocument/warehouses', method: 'get' }],
      ['listKingdeeLocations', { url: '/tk_custom/stockDocument/locations', method: 'get' }],
      ['listKingdeeInventory', { url: '/tk_custom/stockDocument/inventory', method: 'get' }],
      ['listSalesOutbound', { url: '/tk_custom/stockDocument/salesOutbound', method: 'get' }],
      ['getSalesOutboundPicking', { url: '/tk_custom/stockDocument/salesOutbound/picking/SO001', method: 'get' }],
      ['listProductionReceipt', { url: '/tk_custom/stockDocument/productionReceipt', method: 'get' }],
      ['listPurchaseOrder', { url: '/tk_custom/stockDocument/purchaseOrder', method: 'get' }],
      ['listPurchaseInbound', { url: '/tk_custom/stockDocument/purchaseInbound', method: 'get' }],
      ['listProductionOrders', { url: '/tk_custom/productionOrder/list', method: 'get' }],
      ['summarizeProductionOrders', { url: '/tk_custom/productionOrder/summary', method: 'get' }],
      ['searchSalesPriceTrendOptions', { url: '/tk_custom/salesPriceTrend/options', method: 'get' }],
      ['getSalesPriceTrend', { url: '/tk_custom/salesPriceTrend/trend', method: 'get' }],
      ['completePurchaseInbound', { url: '/tk_custom/stockDocument/purchaseOrder/inbound', method: 'post' }],
      ['getExceptionStats', { url: '/tk_custom/exception/stats', method: 'get' }],
      ['getExceptionDashboard', { url: '/tk_custom/exception/dashboard', method: 'get' }],
      ['queryByBillNo', { url: '/kingdee/gxjh/OP011464', method: 'get' }],
      ['getGxjhPreview', { url: '/kingdee/gxjh/preview/OP011464', method: 'get' }],
      ['listKucun', { url: '/tk_custom/kucun/list', method: 'get' }],
      ['listActivity', { url: '/tk_custom/lucky/admin/activity/list', method: 'get' }],
      ['joinRoom', { url: '/tk_custom/lucky/public/pk/join', method: 'post' }],
      ['listMsgtowx', { url: '/tk_custom/msgtowx/list', method: 'get' }],
      ['listAlbum', { url: '/tk_custom/music/album/list', method: 'get' }],
      ['importTrackFile'],
      ['reorderTracks', { url: '/tk_custom/music/album/1/tracks/order', method: 'put' }],
      ['listPd', { url: '/tk_custom/pd/list', method: 'get' }],
      ['listPic', { url: '/tk_custom/pic/list', method: 'get' }],
      ['getWipList', { url: '/tk_custom/wip/list', method: 'get' }],
      ['listWXApprove', { url: '/tk_custom/WXApprove/list', method: 'get' }],
      ['listWxuser', { url: '/tk_custom/wxuser/list', method: 'get' }],
      ['getWxuserEmploymentSummary', { url: '/tk_custom/wxuser/employmentSummary', method: 'get' }],
      ['updateWxuserEmploymentLeaveReason', { url: '/tk_custom/wxuser/employmentSummary/reason', method: 'put' }],
      ['getProcessYieldDashboardData', { url: '/kingdee/getProcessYieldDashboard', method: 'post' }],
      ['getProcessYieldDashboardPlanDetails', { url: '/kingdee/getProcessYieldDashboardPlanDetails', method: 'post' }],
      ['getProcessYieldData', { url: '/kingdee/getProcessYield', method: 'post' }],
      ['getStockInAchievementData', { url: '/kingdee/getStockInAchievement', method: 'post' }],
      ['getShippingReport', { url: '/tk_custom/qaShipping/report', method: 'get' }],
      ['listLocalStock', { url: '/tk_custom/localStock/list', method: 'get' }],
      ['inboundLocalStock', { url: '/tk_custom/localStock/inbound', method: 'post' }],
      ['getStagingReceipt', { url: '/tk_custom/localStock/staging/receipt/SCRK001', method: 'get' }],
      ['getStagingByPlan', { url: '/tk_custom/localStock/staging/plan/TX064138', method: 'get' }],
      ['transferStagingStock', { url: '/tk_custom/localStock/staging/transfer', method: 'post' }],
      ['suggestLocalStockLocation', { url: '/tk_custom/localStock/suggest', method: 'get' }],
      ['getWmsStructureOverview', { url: '/tk_custom/wmsStructure/overview', method: 'get' }],
      ['updateWmsLocationStatus', { url: '/tk_custom/wmsStructure/location/status', method: 'put' }],
      ['listVideoLibrary', { url: '/tk_custom/videoLibrary/list', method: 'get' }],
      ['listSampleProgress', { url: '/tk_custom/sample_progress/list', method: 'get' }],
      ['getOrganizationStructure', { url: '/tk_custom/organization', method: 'get' }],
      ['getVideoPlayToken', { url: '/tk_custom/videoLibrary/1/play-token', method: 'get' }],
    ];

    for (const [name] of samples) {
      expect(typeof api[name]).toBe('function');
    }

    api.listException({ pageNum: 1 });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/exception/list',
      method: 'get',
      params: { pageNum: 1 },
    });

    api.getExceptionDashboard(7);
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/exception/dashboard',
      method: 'get',
      params: { days: 7 },
    });

    api.reorderTracks(1, [{ trackId: 7, sortOrder: 1 }]);
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/music/album/1/tracks/order',
      method: 'put',
      data: [{ trackId: 7, sortOrder: 1 }],
    });

    const audioFile = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    api.importTrackFile(7, audioFile, { title: 'test-tone', artist: 'fixture' });
    const [uploadUrl, formData] = request.upload.mock.calls[0];
    expect(uploadUrl).toBe('/tk_custom/music/album/7/tracks/import');
    expect(formData.get('file')).toMatchObject({ name: 'test.wav', size: 5, type: 'audio/wav' });
    await expect(formData.get('file').text()).resolves.toBe('audio');
    expect(formData.get('title')).toBe('test-tone');
    expect(formData.get('artist')).toBe('fixture');

    api.completeSalesOutbound({ billNo: 'TEST001', items: [] });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/stockDocument/salesOutbound/complete',
      method: 'post',
      data: { billNo: 'TEST001', items: [] },
      timeout: 120 * 1000,
    });

    api.listKingdeeInventory({ pageNum: 1, pageSize: 50 });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/stockDocument/inventory',
      method: 'get',
      params: { pageNum: 1, pageSize: 50 },
      timeout: 120 * 1000,
    });

    api.listKingdeeWarehouses();
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/stockDocument/warehouses',
      method: 'get',
      timeout: 120 * 1000,
    });

    api.listKingdeeLocations();
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/stockDocument/locations',
      method: 'get',
      timeout: 120 * 1000,
    });

    api.listKingdeeLocations({ stock: 'W001,W002' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/stockDocument/locations',
      method: 'get',
      params: { stock: 'W001,W002' },
      timeout: 120 * 1000,
    });


    api.getStagingByLegacyMaterial('MAT-001');
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/localStock/staging/material/MAT-001',
      method: 'get',
      headers: { silentError: 'true' },
    });

    api.getMaterialInventory('MAT-001');
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/localStock/staging/inventory/MAT-001',
      method: 'get',
      headers: { silentError: 'true' },
      timeout: 120 * 1000,
    });

    api.suggestLocalStockLocation({ materialCode: 'MAT-001' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/localStock/suggest',
      method: 'get',
      params: { materialCode: 'MAT-001' },
      headers: { silentError: 'true' },
    });

    api.getWmsStructureOverview();
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/wmsStructure/overview',
      method: 'get',
      headers: { silentError: 'true' },
    });

    api.listVideoLibrary({ pageNum: 1, pageSize: 12 });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/videoLibrary/list',
      method: 'get',
      params: { pageNum: 1, pageSize: 12 },
    });

    api.getVideoPlayToken(1);
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/videoLibrary/1/play-token',
      method: 'get',
    });

    api.listSampleProgress({ pageNum: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/sample_progress/list',
      method: 'get',
      params: { pageNum: 1, pageSize: 20 },
    });

    api.getOrganizationStructure();
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/organization',
      method: 'get',
    });

    api.listItAssets({ pageNum: 1, pageSize: 20, status: 'in_use' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset/list',
      method: 'get',
      params: { pageNum: 1, pageSize: 20, status: 'in_use' },
    });

    api.addItAsset({ assetName: '办公台式机' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset',
      method: 'post',
      data: { assetName: '办公台式机' },
    });

    api.updateItAsset({ id: 1, assetNo: 'TK-PC-0001', assetName: '办公台式机' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset',
      method: 'put',
      data: { id: 1, assetNo: 'TK-PC-0001', assetName: '办公台式机' },
    });

    api.deleteItAssets([1, 2]);
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset/1,2',
      method: 'delete',
    });

    api.markItAssetsPrinted([1, 2]);
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset/print-log',
      method: 'post',
      data: { ids: [1, 2] },
    });

    api.exportItAssets({ status: 'in_use' });
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset/export',
      method: 'post',
      data: { status: 'in_use' },
      responseType: 'blob',
      timeout: 120000,
    });

    api.downloadItAssetTemplate();
    expect(request).toHaveBeenCalledWith({
      url: '/tk_custom/itAsset/template',
      method: 'post',
      responseType: 'blob',
      timeout: 60000,
    });

    request.upload.mockClear();
    const excelFile = new File(['xlsx-data'], 'assets.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    api.importItAssets(excelFile, { mode: 'update' });
    const [assetUploadUrl, assetUploadBody] = request.upload.mock.calls[0];
    expect(assetUploadUrl).toBe('/tk_custom/itAsset/import');
    expect(assetUploadBody.get('mode')).toBe('update');
    expect(assetUploadBody.get('file')).toMatchObject({ name: 'assets.xlsx', size: 9 });
  });

  it('createTkApi rejects non-function request', () => {
    expect(() => createTkApi(null)).toThrow(/request must be a function/);
  });
});
