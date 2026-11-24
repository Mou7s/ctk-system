export type BroadcastTrack = { durationMs?: unknown; duration?: unknown }
export type BroadcastSchedule = {
  scheduleId?: unknown
  scheduleType?: unknown
  weekdays?: unknown
  startTime?: unknown
  endTime?: unknown
  enabled?: unknown
  tracks?: BroadcastTrack[]
}

const DAY_SECONDS = 24 * 60 * 60
const WEEK_SECONDS = 7 * DAY_SECONDS

function enabled(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '0').toLowerCase())
}

function timeMinutes(value: unknown, label: string): number {
  const text = String(value ?? '').slice(0, 5)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`${label}必须使用 HH:mm`)
  const [hour, minute] = text.split(':').map(Number)
  return hour * 60 + minute
}

function weekdays(schedule: BroadcastSchedule): number[] {
  const type = String(schedule.scheduleType || 'daily').toLowerCase()
  if (type === 'daily') return [1, 2, 3, 4, 5, 6, 7]
  if (type === 'weekdays') return [1, 2, 3, 4, 5]
  if (type === 'weekends') return [6, 7]
  if (type !== 'custom') throw new Error('排期类型不符合规范')
  const raw = Array.isArray(schedule.weekdays) ? schedule.weekdays : String(schedule.weekdays || '').split(',')
  const days = raw.map((day) => {
    const text = String(day).trim()
    if (!text) return null
    const value = Number(text)
    if (!Number.isInteger(value)) throw new Error('自选星期必须为 1-7')
    return value
  }).filter((day): day is number => day !== null)
  const uniqueDays = [...new Set(days)].sort()
  if (!uniqueDays.length || uniqueDays.some((day) => day < 1 || day > 7)) throw new Error('自选星期至少选择一天')
  return uniqueDays
}

export function scheduleDurationMs(schedule: BroadcastSchedule): number {
  return (schedule.tracks || []).reduce((total, track) => {
    const value = track.durationMs == null ? Number(track.duration || 0) * 1000 : Number(track.durationMs)
    return total + (Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0)
  }, 0)
}

export function validateBroadcastSchedule(schedule: BroadcastSchedule) {
  const start = timeMinutes(schedule.startTime, '开始时间')
  const days = weekdays(schedule)
  let duration: number
  if (schedule.endTime == null || String(schedule.endTime).trim() === '') {
    const milliseconds = scheduleDurationMs(schedule)
    if (!milliseconds) throw new Error('无结束时间的计划必须包含时长有效的曲目')
    duration = Math.max(1, Math.ceil(milliseconds / 1000))
  } else {
    const end = timeMinutes(schedule.endTime, '结束时间')
    if (end === start) throw new Error('结束时间不能与开始时间相同')
    duration = end > start ? end - start : 24 * 60 - start + end
    duration *= 60
  }
  return { start, days, duration }
}

function intervals(schedule: BroadcastSchedule): Array<[number, number]> {
  const { start, days, duration } = validateBroadcastSchedule(schedule)
  if (duration >= WEEK_SECONDS) return [[0, WEEK_SECONDS]]
  const result: Array<[number, number]> = []
  for (const day of days) {
    const from = (day - 1) * DAY_SECONDS + start * 60
    const to = from + duration
    if (to <= WEEK_SECONDS) result.push([from, to])
    else {
      result.push([from, WEEK_SECONDS])
      result.push([0, to - WEEK_SECONDS])
    }
  }
  return result
}

export function findBroadcastScheduleConflicts(schedules: BroadcastSchedule[]): Array<[number, number]> {
  const active = schedules.filter((schedule) => enabled(schedule.enabled))
  const ranges = active.map(intervals)
  const conflicts: Array<[number, number]> = []
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      if (ranges[left].some(([a, b]) => ranges[right].some(([c, d]) => Math.max(a, c) < Math.min(b, d)))) {
        conflicts.push([Number(active[left].scheduleId || left + 1), Number(active[right].scheduleId || right + 1)])
      }
    }
  }
  return conflicts
}
