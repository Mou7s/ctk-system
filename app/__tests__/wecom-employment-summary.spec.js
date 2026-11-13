import { describe, expect, it } from 'vitest'

import {
  buildDepartmentStats,
  buildLeaveReasonStats,
  calculateEmploymentRates,
  departmentNames,
  normalizeLeaveReasonCode,
  selectLeafDepartmentStats,
} from '../../server/utils/wecom-employment-summary.ts'

function contact(dept, name) {
  return {
    userid: name,
    name,
    dept,
    leader_dept: null,
    status: 'active',
  }
}

function event(dept, eventType, name) {
  return {
    event_id: name,
    userid: name,
    event_type: eventType,
    event_at: '2026-08-25 10:00:00',
    name,
    dept,
    position: null,
    sync_batch_id: 1,
  }
}

describe('WeCom employment summary department grouping', () => {
  it('merges international departments and sales departments into report groups', () => {
    expect(departmentNames('国际一部、国际二部、销售1部、销售5部')).toEqual(['国际部', '营销部'])

    const stats = buildDepartmentStats(
      [
        contact('国际一部', '国际一部员工'),
        contact('国际二部', '国际二部员工'),
        contact('销售1部', '销售1部员工'),
        contact('销售2部', '销售2部员工'),
        contact('销售3部', '销售3部员工'),
        contact('销售4部', '销售4部员工'),
        contact('销售5部', '销售5部员工'),
      ],
      [
        event('国际一部', 'hire', '国际新员工'),
        event('国际二部', 'leave', '国际离职员工'),
        event('销售1部', 'hire', '营销新员工1'),
        event('销售2部', 'hire', '营销新员工2'),
        event('销售5部', 'leave', '营销离职员工'),
      ],
    )

    const byDepartment = new Map(stats.map((row) => [row.department, row]))
    expect([...byDepartment.keys()]).toEqual(['国际部', '营销部'])
    expect(byDepartment.get('国际部')).toMatchObject({
      activeCount: 2,
      hireCount: 1,
      leaveCount: 1,
      hireNames: ['国际新员工'],
      leaveNames: ['国际离职员工'],
    })
    expect(byDepartment.get('营销部')).toMatchObject({
      activeCount: 5,
      hireCount: 2,
      leaveCount: 1,
      hireNames: ['营销新员工1', '营销新员工2'],
      leaveNames: ['营销离职员工'],
    })
    expect(byDepartment.has('国际一部')).toBe(false)
    expect(byDepartment.has('国际二部')).toBe(false)
    expect(byDepartment.has('销售1部')).toBe(false)
    expect(byDepartment.has('销售5部')).toBe(false)
  })

  it('keeps the WeCom parent-child order and rolls child totals into parents', () => {
    const stats = buildDepartmentStats(
      [contact('国际一部', '国际员工'), contact('销售1部', '营销员工')],
      [event('销售1部', 'hire', '新营销员工')],
      [
        { id: 1, parentId: 0, order: 1, name: '示例企业有限公司' },
        { id: 2, parentId: 1, order: 1, name: '营销中心' },
        { id: 3, parentId: 2, order: 1, name: '国际一部' },
        { id: 4, parentId: 2, order: 2, name: '国际二部' },
        { id: 5, parentId: 2, order: 3, name: '销售1部' },
        { id: 6, parentId: 2, order: 4, name: '销售2部' },
      ],
    )

    expect(stats.map((row) => [row.department, row.level])).toEqual([
      ['示例企业有限公司', 0],
      ['营销中心', 1],
      ['国际部', 2],
      ['营销部', 2],
    ])
    expect(stats[1]).toMatchObject({ activeCount: 2, hireCount: 1, hasChildren: true })
    expect(stats[2]).toMatchObject({ activeCount: 1, hireCount: 0, hasChildren: false })
    expect(stats[3]).toMatchObject({ activeCount: 1, hireCount: 1, hasChildren: false })
  })

  it('calculates turnover rate from distinct departures and daily snapshot headcount', () => {
    const stats = buildDepartmentStats(
      [contact('生产部', '在职员工')],
      [event('生产部', 'leave', '离职员工')],
    )
    const result = calculateEmploymentRates(
      stats,
      [event('生产部', 'leave', '离职员工'), event('生产部', 'leave', '离职员工')],
      '2026-08-20',
      '2026-08-21',
      [
        {
          snapshotDate: '2026-08-20',
          contacts: [contact('生产部', '在职员工'), contact('生产部', '第二员工')],
        },
        {
          snapshotDate: '2026-08-21',
          contacts: [contact('生产部', '在职员工')],
        },
      ],
    )

    expect(result).toMatchObject({ available: true, overallRate: 66.67, averageActiveCount: 1.5 })
    expect(result.ratesByDepartment.get('name:生产部')).toBe(66.67)
  })

  it('does not calculate a rate when a daily snapshot is missing', () => {
    const result = calculateEmploymentRates(
      buildDepartmentStats([], []),
      [],
      '2026-08-20',
      '2026-08-22',
      [{ snapshotDate: '2026-08-20', contacts: [] }, { snapshotDate: '2026-08-22', contacts: [] }],
    )

    expect(result.available).toBe(false)
    expect(result.message).toContain('缺少 1 天')
    expect(result.overallRate).toBeNull()
  })
})

describe('WeCom employment leave reason stats', () => {
  function leaveEvent(name, reasonCode) {
    return { ...event('生产部', 'leave', name), leave_reason_code: reasonCode }
  }

  it('counts leave reasons per departure and keeps unfilled as its own block', () => {
    const { stats, leaveTotal } = buildLeaveReasonStats([
      leaveEvent('员工1', 'R05'),
      leaveEvent('员工2', 'r05'),
      leaveEvent('员工3', null),
      leaveEvent('员工4', 'R99'),
      event('生产部', 'hire', '新员工'),
    ])

    expect(leaveTotal).toBe(4)
    expect(stats).toHaveLength(11)
    expect(stats.slice(0, 10).map((item) => item.code)).toEqual(
      ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10'],
    )
    expect(stats.find((item) => item.code === 'R05')).toMatchObject({ count: 2, rate: 50 })
    expect(stats[10]).toMatchObject({ code: '', label: '未填写', count: 2, rate: 50 })
  })

  it('rejects unknown reason codes', () => {
    expect(normalizeLeaveReasonCode('R01')).toBe('R01')
    expect(normalizeLeaveReasonCode(' r10 ')).toBe('R10')
    expect(normalizeLeaveReasonCode('')).toBeNull()
    expect(normalizeLeaveReasonCode('R99')).toBeNull()
  })

  it('keeps only leaf departments so no name repeats across parent and child rows', () => {
    const stats = buildDepartmentStats(
      [contact('国际一部', '国际员工'), contact('销售1部', '营销员工')],
      [event('销售1部', 'hire', '新营销员工')],
      [
        { id: 1, parentId: 0, order: 1, name: '示例企业有限公司' },
        { id: 2, parentId: 1, order: 1, name: '营销中心' },
        { id: 3, parentId: 2, order: 1, name: '国际一部' },
        { id: 4, parentId: 2, order: 2, name: '国际二部' },
        { id: 5, parentId: 2, order: 3, name: '销售1部' },
        { id: 6, parentId: 2, order: 4, name: '销售2部' },
      ],
    )
    expect(stats.some((row) => row.hasChildren)).toBe(true)

    const leaves = selectLeafDepartmentStats(stats)
    expect(leaves.length).toBeGreaterThan(0)
    expect(leaves.every((row) => !row.hasChildren)).toBe(true)
    const allNames = leaves.flatMap((row) => [...row.hireNames, ...row.leaveNames, ...row.activeNames])
    expect(new Set(allNames).size).toBe(allNames.length)
    expect(leaves.reduce((sum, row) => sum + row.hireCount, 0)).toBe(1)
  })
})
