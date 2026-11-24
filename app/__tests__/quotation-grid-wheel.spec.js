// @vitest-environment happy-dom
// 需要 DOM：本文件 mount 组件/flushPromises，默认的 node 环境没有 document
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleQuotationGridWheel } from '../packages/ui/quotationGridWheel.js'

function createWheelEvent({ shiftKey = false, deltaX = 0, deltaY = 0, deltaMode = 0 } = {}) {
  const event = new Event('wheel', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    shiftKey: { value: shiftKey },
    deltaX: { value: deltaX },
    deltaY: { value: deltaY },
    deltaMode: { value: deltaMode },
  })
  vi.spyOn(event, 'preventDefault')
  vi.spyOn(event, 'stopPropagation')
  vi.spyOn(event, 'stopImmediatePropagation')
  return event
}

function createGrid() {
  const grid = document.createElement('revo-grid')
  const shadowRoot = grid.attachShadow({ mode: 'open' })
  const pinnedViewport = document.createElement('revogr-viewport-scroll')
  pinnedViewport.setAttribute('col-type', 'colPinStart')
  const mainViewport = document.createElement('revogr-viewport-scroll')
  mainViewport.setAttribute('col-type', 'rgCol')
  mainViewport.changeScroll = vi.fn()
  mainViewport.dispatchEvent = vi.fn()
  shadowRoot.append(pinnedViewport, mainViewport)
  document.body.append(grid)
  return { grid, mainViewport }
}

describe('quotation grid wheel handling', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('converts Shift+wheel to RevoGrid horizontal scrolling only', () => {
    const { grid, mainViewport } = createGrid()
    const event = createWheelEvent({ shiftKey: true, deltaY: 120 })

    expect(handleQuotationGridWheel(event, grid)).toBe(true)
    expect(mainViewport.dispatchEvent).toHaveBeenCalledOnce()
    const horizontalWheel = mainViewport.dispatchEvent.mock.calls[0][0]
    expect(horizontalWheel.type).toBe('wheel')
    expect(horizontalWheel.deltaX).toBe(120)
    expect(horizontalWheel.deltaY).toBe(0)
    expect(mainViewport.changeScroll).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce()
  })

  it('does not intercept ordinary vertical wheel events', () => {
    const { grid, mainViewport } = createGrid()
    const event = createWheelEvent({ deltaY: 120 })

    expect(handleQuotationGridWheel(event, grid)).toBe(false)
    expect(mainViewport.dispatchEvent).not.toHaveBeenCalled()
    expect(mainViewport.changeScroll).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('normalizes line-based wheel deltas', () => {
    const { grid, mainViewport } = createGrid()
    const event = createWheelEvent({ shiftKey: true, deltaY: -3, deltaMode: 1 })

    handleQuotationGridWheel(event, grid)

    const horizontalWheel = mainViewport.dispatchEvent.mock.calls[0][0]
    expect(horizontalWheel.deltaX).toBe(-120)
    expect(horizontalWheel.deltaY).toBe(0)
  })
})
