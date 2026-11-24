import { describe, expect, it, vi } from 'vitest'

// 建单只走「下载标准模板 → 填好上传」后，改单（草稿/已退回）也改成上传覆盖：
// 服务端要先把住「本人的单 + 状态只能是草稿或已退回」这两条，再动 SQL。
vi.mock('../../server/utils/auth.ts', () => ({
  getAuthSession: vi.fn(async () => null),
  hasPermission: vi.fn(() => true),
}))
vi.mock('../../server/utils/mysql.ts', () => ({
  getMysqlPool: vi.fn(() => ({ query: vi.fn(), getConnection: vi.fn() })),
  mysqlQueryOptions: vi.fn((sql) => ({ sql })),
}))
vi.mock('../../server/utils/redis.ts', () => ({
  getGarnet: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}))

describe('quotation upload overwrite guard', () => {
  it('报价单不存在时拒绝', async () => {
    const { assertUploadOverwriteTarget } = await import('../../server/utils/quotation.ts')

    expect(assertUploadOverwriteTarget(undefined, 1)).toMatchObject({ code: 404, msg: '报价单不存在' })
  })

  it('不是本人的单时拒绝', async () => {
    const { assertUploadOverwriteTarget } = await import('../../server/utils/quotation.ts')

    const result = assertUploadOverwriteTarget({ id: 5, salesperson_id: 9, status: 'DRAFT' }, 1)
    expect(result).toMatchObject({ code: 403, msg: '只能修改本人创建的报价单' })
  })

  it('只有草稿与已退回允许上传覆盖，其它状态拒绝并说明当前状态', async () => {
    const { assertUploadOverwriteTarget } = await import('../../server/utils/quotation.ts')

    for (const status of ['PENDING_INITIAL', 'PENDING_SECOND', 'PENDING_FINAL', 'APPROVED']) {
      const result = assertUploadOverwriteTarget({ id: 5, salesperson_id: 1, status }, 1)
      expect(result?.code, status).toBe(409)
      expect(String(result?.msg), status).toContain('不能通过上传修改')
    }

    expect(assertUploadOverwriteTarget({ id: 5, salesperson_id: 1, status: 'DRAFT' }, 1)).toBe(null)
    expect(assertUploadOverwriteTarget({ id: 5, salesperson_id: 1, status: 'RETURNED' }, 1)).toBe(null)
  })
})
