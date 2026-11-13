export function findMainViewportScroll(grid) {
  const roots = [grid?.shadowRoot, grid].filter(Boolean)
  for (const root of roots) {
    const viewports = Array.from(root.querySelectorAll?.('revogr-viewport-scroll') || [])
    const main = viewports.find((viewport) => (
      viewport.getAttribute('col-type') === 'rgCol'
      || viewport.classList?.contains('rgCol')
    ))
    if (main) return main
  }
  return null
}

export function handleQuotationGridWheel(event, grid, viewportWidth = globalThis.innerWidth || 0) {
  if (!event?.shiftKey) return false

  const delta = event.deltaX || event.deltaY
  const viewportScroll = findMainViewportScroll(grid)
  if (!viewportScroll || !delta) return false

  const multiplier = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? viewportWidth : 1
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()

  const horizontalWheel = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    composed: true,
    deltaX: delta * multiplier,
    deltaY: 0,
    deltaMode: event.deltaMode,
  })
  viewportScroll.dispatchEvent(horizontalWheel)
  return true
}
