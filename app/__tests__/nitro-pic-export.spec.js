import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx/xlsx.mjs'

const state = vi.hoisted(() => ({
  authenticated: { session: { userId: 1 } },
  query: {},
  body: '',
  pool: { query: vi.fn() },
}))

vi.mock('h3', () => ({
  getQuery: vi.fn(() => state.query),
  readBody: vi.fn(async () => state.body),
  setResponseHeader: vi.fn(),
}))
vi.mock('../../server/utils/auth.ts', () => ({ getAuthSession: vi.fn(async () => state.authenticated) }))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => state.pool),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))

globalThis.defineEventHandler = (handler) => handler

describe('Nitro pic export routes', () => {
  let exportAll
  let exportSelected
  let consoleError

  beforeAll(async () => {
    exportAll = (await import('../../server/routes/prod-api/tk_custom/pic/export.post.ts')).default
    exportSelected = (await import('../../server/routes/prod-api/tk_custom/pic/exportSelect.post.ts')).default
  })

  beforeEach(() => {
    state.authenticated = { session: { userId: 1 } }
    state.query = {}
    state.body = ''
    state.pool.query.mockReset()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('keeps Java filters, 200-row limit, columns and image path normalization', async () => {
    state.query = {
      flowno: 'GX',
      materialno: 'MAT-1',
      materialname: 'SOT',
      'params[beginCreatedate]': '2026-08-01 00:00:00',
      'params[endCreatedate]': '2026-08-11 23:59:59',
      result: 'OK',
    }
    state.pool.query.mockResolvedValueOnce([[
      {
        flowno: 'GX001', khdm: 'C001', materialname: 'SOT-23', specification: 'SOT-23',
        mechineName: 'WB-1', xpdm: 'D1', xpph: 'LOT-1', handler: '张三', result: 'OK',
        testNumber: '10', testCharge: '来料', createdate: '2026-08-11 10:00:00', creator: 'admin',
        modifydate: '2026-08-11 10:01:00', updater: 'admin', imgPaths: '/profile/dkPic/a.jpg',
      },
    ], []])

    const result = await exportAll({})
    expect(Buffer.isBuffer(result)).toBe(true)
    const workbook = XLSX.read(result, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
    expect(rows[0]).toEqual([
      '流程单号', '客户代码', '成品型号', '封装', 'WB机台号', '芯片代码', '芯片批号',
      '操作/技术员', '判定结果', '试验数量', '试验时机', '创建时间', '创建人',
      '最后修改时间', '最后修改人', '弹坑图',
    ])
    expect(rows[1][15]).toBe('/profile/dkPic/a.jpg')
    expect(state.pool.query.mock.calls[0][0].sql).toContain('LIMIT 200')
    expect(state.pool.query.mock.calls[0][0].sql).toContain('createdate BETWEEN ? AND ?')
    expect(state.pool.query.mock.calls[0][1]).toEqual([
      'GX', 'MAT-1', 'SOT', '2026-08-01 00:00:00', '2026-08-11 23:59:59', 'OK',
    ])
  })

  it('accepts ids param for selected export, keeps remark fallback', async () => {
    state.query = { ids: '7,8' }
    state.pool.query.mockResolvedValueOnce([[], []])
    const result = await exportSelected({})
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(state.pool.query.mock.calls[0][0].sql).toContain('WHERE id IN (?, ?)')
    expect(state.pool.query.mock.calls[0][1]).toEqual(['7', '8'])
  })

  it('exports selected numeric IDs, rejects unauthenticated access and hides failures', async () => {
    state.query = { remark: '7, 8,not-a-number,9' }
    state.pool.query.mockResolvedValueOnce([[], []])
    const result = await exportSelected({})
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(state.pool.query.mock.calls[0][0].sql).toContain('WHERE id IN (?, ?, ?)')
    expect(state.pool.query.mock.calls[0][1]).toEqual(['7', '8', '9'])

    state.authenticated = null
    await expect(exportAll({})).resolves.toEqual({ code: 401, msg: '登录状态已过期' })

    state.authenticated = { session: { userId: 1 } }
    state.pool.query.mockRejectedValueOnce(new Error('mysql://user:secret@example.test/app'))
    await expect(exportAll({})).resolves.toEqual({ code: 500, msg: '导出弹坑图片数据失败' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret')
  })

  it('embeds actual images into Excel drawing parts when image files exist on disk', async () => {
    const tempProfile = mkdtempSync(join(tmpdir(), 'pic-export-test-'))
    const prevProfile = process.env.NUXT_PROFILE_PATH
    process.env.NUXT_PROFILE_PATH = tempProfile

    try {
      const picDir = join(tempProfile, 'dkPic', '2026', '11', '03')
      mkdirSync(picDir, { recursive: true })
      const fakePng1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
      const fakePng2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02])
      writeFileSync(join(picDir, 'img1.png'), fakePng1)
      writeFileSync(join(picDir, 'img2.png'), fakePng2)

      state.query = { ids: '101' }
      state.pool.query.mockResolvedValueOnce([[
        {
          flowno: 'TX1005267', khdm: 'C001', materialname: 'SOT-23', specification: 'SOT-23',
          mechineName: 'WB-1', xpdm: 'D1', xpph: 'LOT-1', handler: '张三', result: 'OK',
          testNumber: '10', testCharge: '来料', createdate: '2026-11-03 10:00:00', creator: 'admin',
          modifydate: '2026-11-03 10:01:00', updater: 'admin',
          imgPaths: '/profile/dkPic/2026/11/03/img1.png,/profile/dkPic/2026/11/03/img2.png',
        },
      ], []])

      const result = await exportSelected({})
      expect(Buffer.isBuffer(result)).toBe(true)

      const files = unzipSync(new Uint8Array(result))
      expect(files['xl/media/image1.png']).toBeDefined()
      expect(files['xl/media/image2.png']).toBeDefined()
      expect(Buffer.from(files['xl/media/image1.png'])).toEqual(fakePng1)
      expect(Buffer.from(files['xl/media/image2.png'])).toEqual(fakePng2)

      const drawingXml = strFromU8(files['xl/drawings/drawing1.xml'])
      expect(drawingXml).toContain('<col>15</col>')
      expect(drawingXml).toContain('<col>16</col>')
      expect(drawingXml).toContain('r:embed="rId1"')
      expect(drawingXml).toContain('r:embed="rId2"')

      const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml'])
      expect(sheetXml).toContain('<drawing r:id="rId1"/>')
      expect(sheetXml).toContain('ref="P1:Q1"')
    } finally {
      if (prevProfile === undefined) delete process.env.NUXT_PROFILE_PATH
      else process.env.NUXT_PROFILE_PATH = prevProfile
      rmSync(tempProfile, { recursive: true, force: true })
    }
  })
})
