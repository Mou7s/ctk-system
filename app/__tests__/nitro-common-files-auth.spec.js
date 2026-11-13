import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { session: { userId: 1, userName: 'admin' } },
  fileExists: true,
  isFile: true,
  parts: [],
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => ({ fileName: 'a.txt', resource: '/profile/a.txt' })),
  readMultipartFormData: vi.fn(async () => state.parts),
  setHeader: vi.fn(),
  sendStream: vi.fn(() => 'streamed'),
}))

vi.mock('node:fs', () => {
  const createReadStream = vi.fn(() => 'file-stream')
  const statSync = vi.fn(() => {
    if (!state.fileExists) {
      const error = new Error("ENOENT: no such file or directory, stat 'a.txt'")
      error.code = 'ENOENT'
      throw error
    }
    return { isFile: () => state.isFile, size: 3 }
  })
  return { createReadStream, statSync, default: { createReadStream, statSync } }
})

vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => state.auth),
}))

vi.mock('../../server/utils/runtime.ts', () => ({
  getNitroServerConfig: vi.fn(() => ({ profilePath: 'D:/tmp/uploadPath', authTokenSecret: '' })),
}))

vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => ({ execute: vi.fn() })),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

const LOGIN_EXPIRED = { code: 401, msg: '登录状态已过期' }

describe('Nitro common file routes', () => {
  let uploadHandler
  let uploadsHandler
  let downloadHandler
  let resourceHandler
  let h3
  let fs

  beforeAll(async () => {
    globalThis.defineEventHandler = (handler) => handler
    h3 = await import('h3')
    fs = await import('node:fs')
    uploadHandler = (await import('../../server/routes/prod-api/common/upload.post.ts')).default
    uploadsHandler = (await import('../../server/routes/prod-api/common/uploads.post.ts')).default
    downloadHandler = (await import('../../server/routes/prod-api/common/download.get.ts')).default
    resourceHandler = (await import('../../server/routes/prod-api/common/download/resource.get.ts')).default
  })

  beforeEach(() => {
    state.auth = { session: { userId: 1, userName: 'admin' } }
    state.fileExists = true
    state.isFile = true
    h3.readMultipartFormData.mockClear()
    h3.sendStream.mockClear()
  })

  it('rejects every file route without a login session', async () => {
    state.auth = null

    await expect(uploadHandler({})).resolves.toEqual(LOGIN_EXPIRED)
    await expect(uploadsHandler({})).resolves.toEqual(LOGIN_EXPIRED)
    await expect(downloadHandler({})).resolves.toEqual(LOGIN_EXPIRED)
    await expect(resourceHandler({})).resolves.toEqual(LOGIN_EXPIRED)
    expect(h3.readMultipartFormData).not.toHaveBeenCalled()
    expect(h3.sendStream).not.toHaveBeenCalled()
  })

  it('reports a missing download target as 404 instead of a raw stream error', async () => {
    state.fileExists = false

    await expect(downloadHandler({})).resolves.toEqual({ code: 404, msg: '文件不存在' })
    await expect(resourceHandler({})).resolves.toEqual({ code: 404, msg: '资源文件不存在' })
    expect(fs.createReadStream).not.toHaveBeenCalled()
  })

  it('streams the file when the session is valid and the target exists', async () => {
    await expect(downloadHandler({})).resolves.toBe('streamed')
    await expect(resourceHandler({})).resolves.toBe('streamed')
    expect(h3.sendStream).toHaveBeenCalledTimes(2)
  })
})
