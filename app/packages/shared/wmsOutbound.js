function text(value) {
  return String(value ?? '').trim()
}

export function outboundQtyForItem(item) {
  const realQty = Number(item?.realQty)
  if (Number.isFinite(realQty)) return realQty
  const planQty = Number(item?.planQty)
  if (Number.isFinite(planQty)) return planQty
  const actualQty = Number(item?.actualQty)
  if (Number.isFinite(actualQty)) return actualQty
  return 0
}

export function buildOutboundPickSegments(item) {
  const documentQty = outboundQtyForItem(item)
  if (!(documentQty > 0)) return []

  const scannedSegments = Array.isArray(item?.pickSegments) ? item.pickSegments : []
  if (scannedSegments.length) {
    return scannedSegments.map(segment => ({
      segmentId: text(segment.id || segment.segmentId),
      sourceMaterialCode: text(segment.sourceMaterialCode).toUpperCase(),
      qty: Number(segment.qty),
      stockNumber: text(segment.stockNumber || item?.stockNumber),
      sourceLocationNumber: text(segment.sourceLocationNumber).toUpperCase(),
      sourceLotNumber: text(segment.sourceLotNumber),
      businessConfirmed: Boolean(segment.businessConfirmed),
      businessConfirmReason: text(segment.businessConfirmReason),
    }))
  }

  return [{
    segmentId: `${text(item?.entryId)}-document`,
    sourceMaterialCode: text(item?.materialNumber).toUpperCase(),
    qty: documentQty,
    stockNumber: text(item?.stockNumber),
    sourceLocationNumber: text(item?.pickedLocation).toUpperCase(),
    sourceLotNumber: text(item?.pickedLotNumber),
    businessConfirmed: false,
    businessConfirmReason: '',
  }]
}
