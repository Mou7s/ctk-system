import { describe, expect, it } from 'vitest'
import {
  buildLvDunSyncPlan,
  cleanLvDunDept,
  decodeTrDb,
  resolveLvDunOwner,
} from '../../server/utils/it-asset-lvdun-sync.ts'

describe('IT asset LvDun sync utils', () => {
  it('decodes TrDb active records and skips deleted flag=128 records', () => {
    const rec1 = Buffer.alloc(8 + 4 + 12, 0)
    rec1.writeUInt32LE(0x7e7e7e7e, 0)
    rec1.writeUInt32LE(0, 4)
    rec1.writeInt32LE(101, 8)
    rec1.write('PC-01', 12, 'ascii')

    const rec2 = Buffer.alloc(8 + 4 + 12, 0)
    rec2.writeUInt32LE(0x7e7e7e7e, 0)
    rec2.writeUInt32LE(128, 4)
    rec2.writeInt32LE(102, 8)
    rec2.write('DEL', 12, 'ascii')

    const rows = decodeTrDb(Buffer.concat([rec1, rec2]), [
      { name: 'id', type: 1, size: 4 },
      { name: 'name', type: 3, size: 12 },
    ])
    expect(rows).toEqual([{ id: 101, name: 'PC-01' }])
  })

  it('normalizes department aliases and preserves numbered non-employee aliases like 包装1/2/3', () => {
    expect(cleanLvDunDept('物控部')).toBe('物控')
    expect(cleanLvDunDept('塑封部（只能使用企业微信和邮箱）')).toBe('塑封部')
    expect(cleanLvDunDept('国际部')).toBe('国际销售部')
    expect(cleanLvDunDept('国际一部')).toBe('国际销售部')
    expect(cleanLvDunDept('国际二部')).toBe('国际销售部')

    const wxMap = new Map([
      ['刘佳', [{ userid: 'LiuJia', name: '刘佳', dept: '物控', status: 'active' }]],
      ['张外贸', [{ userid: 'ZhangWaiMao', name: '张外贸', dept: '国际一部', status: 'active' }]],
    ])
    expect(resolveLvDunOwner('张外贸', '国际部', '', wxMap)).toEqual({
      userUserid: 'ZhangWaiMao',
      userName: '张外贸',
      useDept: '国际销售部',
    })
    expect(resolveLvDunOwner('刘佳2', '物控部', '', wxMap)).toEqual({
      userUserid: 'LiuJia',
      userName: '刘佳',
      useDept: '物控',
    })
    expect(resolveLvDunOwner('包装1', '品质部', '', wxMap)).toEqual({
      userUserid: '',
      userName: '包装1',
      useDept: '品质部',
    })
    expect(resolveLvDunOwner('包装3', '品质部', '', wxMap)).toEqual({
      userUserid: '',
      userName: '包装3',
      useDept: '品质部',
    })
    expect(resolveLvDunOwner('新外贸总监', '终端事业部', '', wxMap)).toEqual({
      userUserid: '',
      userName: '新外贸总监',
      useDept: '终端事业部',
    })
    expect(resolveLvDunOwner('扫描仪', '财务部', '', wxMap, '办公台式机', 'desktop')).toEqual({
      userUserid: '',
      userName: '扫描仪',
      useDept: '财务部',
    })
    expect(resolveLvDunOwner('焊线-推拉力', '塑封部', '', wxMap, '办公台式机', 'desktop')).toEqual({
      userUserid: '',
      userName: '焊线-推拉力',
      useDept: '塑封部',
    })
    expect(resolveLvDunOwner('PC-20260824BJLW', '财务部', '', wxMap, '办公台式机', 'desktop')).toEqual({
      userUserid: '',
      userName: '',
      useDept: '财务部',
    })
    expect(resolveLvDunOwner('D栋门岗', '', '', wxMap, 'D栋门岗', 'desktop')).toEqual({
      userUserid: '',
      userName: '',
      useDept: '',
    })

    // 同名离职防误绑：终端事业部杨钊已离职，不应跨部门误绑到固晶二部在职杨钊
    const dupWxMap = new Map([
      ['杨钊', [
        { userid: 'YangZhao', name: '杨钊', dept: '固晶二部', status: 'active' },
        { userid: 'YangZhao01', name: '杨钊', dept: '终端事业部', status: 'inactive' },
      ]],
      ['甘朝华', [
        { userid: 'GanZhaoHua', name: '甘朝华', dept: '工程部', status: 'active' },
      ]],
    ])
    expect(resolveLvDunOwner('杨钊', '终端事业部', '', dupWxMap, '办公台式机', 'desktop')).toEqual({
      userUserid: '',
      userName: '杨钊',
      useDept: '终端事业部',
    })
    // 正常单人调岗仍以企微最新部门为准
    expect(resolveLvDunOwner('甘朝华', '研发中心', '', dupWxMap, '办公台式机', 'desktop')).toEqual({
      userUserid: 'GanZhaoHua',
      userName: '甘朝华',
      useDept: '工程部',
    })
  })

  it('builds accurate diff plan with updates, disabled machines, new inserts, and zero false positives', () => {
    const snapshot = {
      groups: [
        { id: 4, name: '物控部', pid: 0 },
        { id: 5, name: '品质部', pid: 0 },
        { id: 34, name: '终端事业部', pid: 0 },
      ],
      comps: [
        { id: 1008, name: 'PC-008', ip: '192.0.2.30', mac: 'aabbcc000001', nick: '包装1', gid: 5 },
        { id: 1119, name: 'PC-036', ip: '192.0.2.36', mac: 'aabbcc000002', nick: '外发电镀', gid: 4 },
        { id: 1099, name: 'PC-099', ip: '192.0.2.99', mac: 'aabbcc000003', nick: '禁用旧机', gid: 5 },
        { id: 1200, name: 'PC-NEW', ip: '192.0.2.200', mac: 'aabbcc000004', nick: '王艺可', gid: 34 },
      ],
      clast: [
        { id: 1008, lot: '2026-11-23 09:00:00' },
        { id: 1119, lot: '2026-11-23 09:00:00' },
        { id: 1099, lot: '2026-11-20 09:00:00' },
        { id: 1200, lot: '2026-11-23 09:00:00' },
      ],
      mce: [
        { id: 1008, ld: 11, dk: 127, au: 31 },
        { id: 1119, ld: 11, dk: 127, au: 31 },
        { id: 1099, ld: 0, dk: 0, au: 0 },
        { id: 1200, ld: 11, dk: 127, au: 31 },
      ],
      hw: {
        '1200': {
          '20202': [{ r: 0, v: 'LENOVO' }],
          '40114': [{ r: 0, v: 'ThinkCentre M740t' }],
          '23001': [{ r: 0, v: '2' }],
        },
      },
    }

    const existing = [
      {
        id: 8, asset_no: 'TK-PC-0008', asset_name: '办公台式机', device_type: 'desktop',
        brand: '华硕', model: 'H310M-D3V', use_dept: '品质部', user_userid: 'GuTingHua',
        user_name: '顾婷花', status: 'in_use', ip_address: '192.0.2.30',
        mac_address: 'AA:BB:CC:00:00:01', lvdun_id: 1008, print_count: 1, remark: null,
      },
      {
        id: 36, asset_no: 'TK-PC-0036', asset_name: '办公台式机', device_type: 'desktop',
        brand: '华硕', model: 'H81M', use_dept: '物控', user_userid: null,
        user_name: '外发电镀', status: 'in_use', ip_address: '192.0.2.36',
        mac_address: 'AA:BB:CC:00:00:02', lvdun_id: 1119, print_count: 0, remark: null,
      },
      {
        id: 99, asset_no: 'TK-PC-0099', asset_name: '办公台式机', device_type: 'desktop',
        brand: '华硕', model: 'H110M', use_dept: '品质部', user_userid: null,
        user_name: '旧员工', status: 'in_use', ip_address: '192.0.2.99',
        mac_address: 'AA:BB:CC:00:00:03', lvdun_id: null, print_count: 0, remark: '绿盾ID: 1099',
      },
    ]

    const wx = [
      { userid: 'WangYiKe', name: '王艺可', dept: '终端事业部', status: 'active' },
    ]

    const plan = buildLvDunSyncPlan(snapshot, existing, wx, { now: new Date('2026-11-23T10:00:00Z') })
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toMatchObject({
      assetNo: 'TK-PC-0008',
      oldUserName: '顾婷花',
      newUserName: '包装1',
      newUseDept: '品质部',
      printCount: 1,
    })
    expect(plan.disabled).toHaveLength(1)
    expect(plan.disabled[0]).toMatchObject({ assetNo: 'TK-PC-0099', lvdunId: 1099 })
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0]).toMatchObject({
      lvdunId: 1200,
      userName: '王艺可',
      userUserid: 'WangYiKe',
      useDept: '终端事业部',
      brand: '联想',
      model: 'ThinkCentre M740t',
      remark: '',
    })
  })
})
