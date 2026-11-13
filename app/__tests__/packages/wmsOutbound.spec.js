import { describe, expect, it } from 'vitest'

import { buildOutboundPickSegments, outboundQtyForItem } from '../../packages/shared/wmsOutbound.js'

describe('sales outbound pick segments', () => {
  it('uses the document quantity when no barcode was scanned', () => {
    expect(outboundQtyForItem({ realQty: 2, planQty: 5 })).toBe(2)
    expect(outboundQtyForItem({ planQty: 5 })).toBe(5)
    expect(buildOutboundPickSegments({
      entryId: '11',
      materialNumber: 'MAT1',
      stockNumber: 'S1',
      pickedLocation: 'L1',
      pickedLotNumber: 'LOT1',
      realQty: 2,
      planQty: 5,
      pickSegments: [],
    })).toEqual([{
      segmentId: '11-document',
      sourceMaterialCode: 'MAT1',
      qty: 2,
      stockNumber: 'S1',
      sourceLocationNumber: 'L1',
      sourceLotNumber: 'LOT1',
      businessConfirmed: false,
      businessConfirmReason: '',
    }])
  })

  it('keeps scanned pick segments for conversion or split picking', () => {
    const scanned = [{
      id: 'scan-1',
      sourceMaterialCode: 'MAT2',
      qty: 1,
      stockNumber: 'S2',
      sourceLocationNumber: 'L2',
      sourceLotNumber: '',
      businessConfirmed: true,
      businessConfirmReason: '业务确认',
    }]

    expect(buildOutboundPickSegments({ realQty: 1, planQty: 1, pickSegments: scanned })).toEqual([{
      segmentId: 'scan-1',
      sourceMaterialCode: 'MAT2',
      qty: 1,
      stockNumber: 'S2',
      sourceLocationNumber: 'L2',
      sourceLotNumber: '',
      businessConfirmed: true,
      businessConfirmReason: '业务确认',
    }])
  })

  it('returns no pick segment for a zero quantity line', () => {
    expect(buildOutboundPickSegments({ realQty: 0, planQty: 5, pickSegments: [] })).toEqual([])
  })
})
