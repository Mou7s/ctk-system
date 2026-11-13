import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { userId: 7, deptId: 10, user: { nickName: '销售' } }, permission: true, body: {}, query: {}, db: { query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }, pool: { query: vi.fn(), getConnection: vi.fn() } }));
vi.mock('h3', () => ({ getHeader: () => state.contentType, setHeader: vi.fn(), getQuery: () => state.query, readBody: async () => state.body, readMultipartFormData: async () => state.parts || [] }));
vi.mock('../../server/utils/auth', () => ({ getAuthSession: async () => state.session ? { session: state.session } : null, hasPermission: () => state.permission }));
vi.mock('../../server/utils/mysql', () => ({ getMysqlPool: () => state.pool }));
vi.mock('../../server/utils/customer-card-ocr', () => ({ recognizeCustomerCard: vi.fn() }));
import { customerCardAction, resolveCardReviewer } from '../../server/utils/customer-cards';
import sharp from 'sharp';
import { customerCardFields } from '../packages/shared/customerCard';

describe('客户名片接口业务保护', () => {
  it('不能删除他人的客户，事务回滚且不更新记录', async () => {
    state.body = { id: 1 }; state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 8, status: 'active' }]]);
    expect((await customerCardAction({}, 'remove')).code).toBe(403);
    expect(state.db.query).toHaveBeenCalledTimes(1); expect(state.db.rollback).toHaveBeenCalled();
  });
  it('删除本人客户，并允许重复请求而不重复更新', async () => {
    state.body = { id: 1 }; state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, status: 'active' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect((await customerCardAction({}, 'remove')).code).toBe(200);
    expect(state.db.query.mock.calls[1][0]).toContain("review_status='deleted'");
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, status: 'deleted' }]]);
    expect((await customerCardAction({}, 'remove')).code).toBe(200); expect(state.db.query).toHaveBeenCalledTimes(3);
  });
  beforeEach(() => { state.contentType = undefined; state.parts = []; });
  it('名片照片随客户事务保存，保留原图字节', async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
    state.contentType = 'multipart/form-data; boundary=test';
    state.parts = [{ name: 'record', data: Buffer.from(JSON.stringify({ company: 'Photo Test', requestId: '12345678-1234-1234-1234-123456789012' })) }, { name: 'photo', type: 'image/png', data: image }];
    state.db.query.mockResolvedValueOnce([[{ acquired: 1 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ released: 1 }]]);
    expect((await customerCardAction({}, 'create')).code).toBe(200);
    expect(state.db.query.mock.calls[4][1].slice(-2)).toEqual([image, 'image/png']);
    expect(state.db.commit).toHaveBeenCalled();
  });
  it('拒绝伪装图片，且不开始数据库写入', async () => {
    state.contentType = 'multipart/form-data'; state.parts = [{ name: 'record', data: Buffer.from('{}') }, { name: 'photo', type: 'image/png', data: Buffer.from('<script>bad</script>') }];
    expect((await customerCardAction({}, 'create')).code).toBe(400);
    expect(state.pool.getConnection).not.toHaveBeenCalled();
  });
  it('图片读取限定所属业务员或指定审核人，无可访问记录时返回404', async () => {
    state.query = { id: 12 }; state.pool.query.mockResolvedValueOnce([[]]);
    expect((await customerCardAction({}, 'photo')).code).toBe(404);
    expect(state.pool.query.mock.calls[0][0]).toContain('c.created_by_id=? OR w.reviewer_id=?');
    expect(state.pool.query.mock.calls[0][1]).toEqual([12, 7, 7]);
  });
  it('同一保存标识不能把已有照片静默替换成另一张', async () => {
    state.body = { company: 'ACME', requestId: '12345678-1234-1234-1234-123456789012' };
    const payload = Object.fromEntries(customerCardFields.map(([key]) => [key, key === 'company' ? 'ACME' : '']));
    state.db.query.mockResolvedValueOnce([[{ acquired: 1 }]]).mockResolvedValueOnce([[{ id: 10, owner_id: 7, payload }]]).mockResolvedValueOnce([[{ photo_data: Buffer.from('existing photo') }]]).mockResolvedValueOnce([[{ released: 1 }]]);
    expect((await customerCardAction({}, 'create')).code).toBe(409);
    expect(state.db.commit).not.toHaveBeenCalled();
  });
  beforeEach(() => { vi.clearAllMocks(); state.session = { userId: 7, deptId: 10, user: { nickName: '销售' } }; state.permission = true; state.body = {}; state.query = {}; state.pool.getConnection.mockResolvedValue(state.db); });
  it('未登录和未授权时不访问数据库', async () => {
    state.session = null; expect((await customerCardAction({}, 'list')).code).toBe(401);
    state.session = { userId: 7 }; state.permission = false; expect((await customerCardAction({}, 'create')).code).toBe(403);
    expect(state.pool.getConnection).not.toHaveBeenCalled(); expect(state.pool.query).not.toHaveBeenCalled();
  });
  it('模糊、缺失以及本人负责人配置都拒绝自动派审', async () => {
    for (const rows of [[], [{ user_id: 7 }], [{ user_id: 8 }, { user_id: 9 }]]) { state.db.query.mockResolvedValueOnce([rows]); await expect(resolveCardReviewer(state.db, 10, 7)).rejects.toThrow('负责人'); }
    state.db.query.mockResolvedValueOnce([[{ user_id: 8 }]]); expect(await resolveCardReviewer(state.db, 10, 7)).toBe(8);
  });
  it('自己不能审核自己的客户', async () => {
    state.body = { id: 1, decision: 'approve', note: '同意' };
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, reviewer_id: 7, status: 'pending' }]]);
    expect((await customerCardAction({}, 'review')).code).toBe(403); expect(state.db.commit).not.toHaveBeenCalled(); expect(state.db.rollback).toHaveBeenCalled();
  });
  it('已处理审核不能再次修改，待审客户不能填写动态', async () => {
    state.body = { id: 1, decision: 'reject', note: '驳回' };
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 8, reviewer_id: 7, status: 'active' }]]);
    expect((await customerCardAction({}, 'review')).code).toBe(409);
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, status: 'pending' }]]);
    expect((await customerCardAction({}, 'followup')).code).toBe(409);
  });
  it('保存时重新检查冲突并在事务内派给部门负责人', async () => {
    state.body = { company: 'ACME', requestId: '12345678-1234-1234-1234-123456789012' };
    state.db.query.mockResolvedValueOnce([[{ acquired: 1 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 9, salesperson: '其他销售', company_name: 'ACME' }]]).mockResolvedValueOnce([[{ user_id: 8 }]]).mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ released: 1 }]]);
    const result = await customerCardAction({}, 'create');
    expect(result).toMatchObject({ code: 200, data: { id: 10, status: 'pending', conflicts: [{ id: 9, matches: ['公司名称'] }] } });
    expect(state.db.query.mock.calls[5][1]).toContain(8); expect(state.db.commit).toHaveBeenCalled(); expect(state.db.release).toHaveBeenCalled();
  });
  it('周动态只能由所属业务员填写且日期必须为周一', async () => {
    state.body = { id: 1, weekStart: '2026-09-30', content: '跟进', requestId: '12345678-1234-1234-1234-123456789012' };
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 8, status: 'active' }]]);
    expect((await customerCardAction({}, 'followup')).code).toBe(403);
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, status: 'active' }]]);
    expect((await customerCardAction({}, 'followup')).code).toBe(400);
  });
  it('兼容已有每周唯一记录，同一周保存更新并保留请求记录', async () => {
    state.body = { id: 1, weekStart: '2026-09-28', content: '本周进展', nextPlan: '下周计划', requestId: '12345678-1234-1234-1234-123456789012' };
    state.db.query.mockResolvedValueOnce([[{ id: 1, owner_id: 7, status: 'active' }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 2, created_by_id: 7 }]]).mockResolvedValue([{ affectedRows: 1 }]);
    expect((await customerCardAction({}, 'followup')).code).toBe(200);
    expect(state.db.query.mock.calls[3][0]).toContain('UPDATE tk_customer_weekly');
    expect(state.db.query.mock.calls[5][0]).toContain('INSERT INTO tk_customer_weekly_request');
  });
});
