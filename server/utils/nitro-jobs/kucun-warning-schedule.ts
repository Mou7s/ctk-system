export type WarningPushTime = {
  hour: number
  minute: number
}

export function warningPushDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Only allow a push during the configured minute.
 * A service restart after the configured time must not "catch up" and send immediately.
 */
export function shouldRunWarningPushAt(
  now: Date,
  scheduled: WarningPushTime,
  lastRunDate: string,
): boolean {
  if (now.getHours() !== scheduled.hour || now.getMinutes() !== scheduled.minute) return false
  return lastRunDate !== warningPushDateKey(now)
}
