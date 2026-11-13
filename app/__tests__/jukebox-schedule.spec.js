import { describe, expect, it } from 'vitest'
import { findBroadcastScheduleConflicts, validateBroadcastSchedule } from '../../server/utils/jukebox-schedule.ts'

const schedule = (scheduleId, overrides = {}) => ({
  scheduleId,
  scheduleType: 'daily',
  weekdays: '',
  startTime: '09:00',
  endTime: '09:30',
  enabled: '1',
  tracks: [{ durationMs: 60_000 }],
  ...overrides,
})

describe('workshop broadcast schedule validation', () => {
  it('detects overlaps that cross midnight', () => {
    expect(findBroadcastScheduleConflicts([
      schedule(1, { startTime: '23:30', endTime: '00:30' }),
      schedule(2, { startTime: '00:15', endTime: '01:00' }),
    ])).toEqual([[1, 2]])
  })

  it('uses ISO weekdays for weekdays, weekends, and custom plans', () => {
    expect(findBroadcastScheduleConflicts([
      schedule(1, { scheduleType: 'weekdays', startTime: '12:00', endTime: '13:00' }),
      schedule(2, { scheduleType: 'weekends', startTime: '12:30', endTime: '13:30' }),
      schedule(3, { scheduleType: 'custom', weekdays: '1,3,5', startTime: '12:30', endTime: '13:30' }),
    ])).toEqual([[1, 3]])
  })

  it('rejects equal start and end times and computes one-pass windows from track duration', () => {
    expect(() => validateBroadcastSchedule(schedule(1, { startTime: '09:00', endTime: '09:00' }))).toThrow('不能与开始时间相同')
    expect(validateBroadcastSchedule(schedule(2, { endTime: null, tracks: [{ durationMs: 65_001 }] })).duration).toBe(66)
  })

  it('ignores disabled plans and rejects malformed custom weekdays', () => {
    expect(findBroadcastScheduleConflicts([
      schedule(1),
      schedule(2, { enabled: '0' }),
    ])).toEqual([])
    expect(() => validateBroadcastSchedule(schedule(3, { scheduleType: 'custom', weekdays: '1,x' }))).toThrow('必须为 1-7')
  })
})
