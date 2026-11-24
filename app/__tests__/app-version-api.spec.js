import { afterEach, describe, expect, it, vi } from 'vitest'
const header = vi.hoisted(() => vi.fn())
vi.mock('h3', () => ({ defineEventHandler: fn => fn, setHeader: header }))
import handler from '../../server/routes/app-version.get'
afterEach(() => { vi.unstubAllGlobals(); header.mockClear() })
describe('public deployment version metadata', () => {
  it('returns only a release identifier and forbids cached responses', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { releaseVersion: 'fixed-build' }, authTokenSecret: 'private-test-value' }))
    expect(handler({})).toEqual({ version: 'fixed-build' })
    expect(header).toHaveBeenCalledWith({}, 'Cache-Control', 'no-store, no-cache, must-revalidate')
  })
})
