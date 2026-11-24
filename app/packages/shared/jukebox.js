const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;

export const JUKEBOX_AUDIO_ACCEPT = '.aac,.aiff,.ape,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.wma';

export const JUKEBOX_SCHEDULE_TYPE_OPTIONS = [
  { label: '每天', value: 'daily' },
  { label: '工作日（周一至五）', value: 'weekdays' },
  { label: '周末（周六至日）', value: 'weekends' },
  { label: '自选星期', value: 'custom' },
];

export const JUKEBOX_WEEKDAY_OPTIONS = [
  { label: '一', value: '1', fullLabel: '周一' },
  { label: '二', value: '2', fullLabel: '周二' },
  { label: '三', value: '3', fullLabel: '周三' },
  { label: '四', value: '4', fullLabel: '周四' },
  { label: '五', value: '5', fullLabel: '周五' },
  { label: '六', value: '6', fullLabel: '周六' },
  { label: '日', value: '7', fullLabel: '周日' },
];

export function formatJukeboxDuration(secondsInput) {
  const numeric = Number(secondsInput);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0:00';
  const total = Math.floor(numeric);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const secText = seconds < 10 ? `0${seconds}` : String(seconds);
  if (hours > 0) {
    const minText = minutes < 10 ? `0${minutes}` : String(minutes);
    return `${hours}:${minText}:${secText}`;
  }
  return `${minutes}:${secText}`;
}

export function formatJukeboxDurationMs(msInput) {
  const numeric = Number(msInput);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0:00';
  return formatJukeboxDuration(Math.round(numeric / 1000));
}

export function formatHumanDurationMs(msInput) {
  const numeric = Number(msInput);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0 秒';
  const totalSeconds = Math.round(numeric / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
  }
  return `${minutes} 分钟`;
}

export function formatJukeboxFileSize(bytesInput) {
  const bytes = Number(bytesInput || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.trunc(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isJukeboxTrackReady(track) {
  return Boolean(
    track?.mediaId
    && track?.mediaSyncStatus === 'ready'
    && track?.mediaSha256
    && track?.playerSha256 === track.mediaSha256,
  );
}

export function getTrackSyncStatusMeta(track) {
  if (!track?.mediaId) {
    return {
      code: 'missing_media',
      label: '缺本地音频',
      detail: '旧曲目元数据，需导入本地音频才可播放或排期',
      color: 'neutral',
      ready: false,
    };
  }
  if (track.mediaSyncStatus === 'pending_sync') {
    return {
      code: 'pending_sync',
      label: '待同步',
      detail: track.lastSyncError || '等待同步并校验至播放器目录',
      color: 'warning',
      ready: false,
    };
  }
  if (track.mediaSyncStatus === 'failed') {
    return {
      code: 'failed',
      label: '同步失败',
      detail: track.lastSyncError || '媒体校验或同步失败，请重试同步',
      color: 'error',
      ready: false,
    };
  }
  if (track.mediaSyncStatus !== 'ready') {
    return {
      code: 'unknown',
      label: '状态未知',
      detail: track.lastSyncError || '媒体同步状态未知，建议重试同步',
      color: 'warning',
      ready: false,
    };
  }
  if (!isJukeboxTrackReady(track)) {
    return {
      code: 'checksum_mismatch',
      label: '校验不一致',
      detail: '播放器副本校验和与中央备份不一致，建议重试同步',
      color: 'error',
      ready: false,
    };
  }
  return {
    code: 'ready',
    label: '已就绪',
    detail: '本地校验通过，可正常点播与排期',
    color: 'success',
    ready: true,
  };
}

export function getTrackDurationMs(track) {
  const fromMedia = Number(track?.mediaDurationMs || 0);
  if (Number.isFinite(fromMedia) && fromMedia > 0) return Math.round(fromMedia);
  const fromTrack = Number(track?.duration || 0) * 1000;
  return Number.isFinite(fromTrack) && fromTrack > 0 ? Math.round(fromTrack) : 0;
}

export function summarizeAlbumTracks(tracks = []) {
  const list = Array.isArray(tracks) ? tracks : [];
  let ready = 0;
  let pending = 0;
  let failed = 0;
  let missing = 0;
  let totalDurationMs = 0;
  let readyDurationMs = 0;

  for (const track of list) {
    const durationMs = getTrackDurationMs(track);
    totalDurationMs += durationMs;
    const meta = getTrackSyncStatusMeta(track);
    if (meta.ready) {
      ready += 1;
      readyDurationMs += durationMs;
    } else if (meta.code === 'missing_media') {
      missing += 1;
    } else if (meta.code === 'pending_sync' || meta.code === 'unknown') {
      pending += 1;
    } else {
      failed += 1;
    }
  }

  return {
    total: list.length,
    ready,
    pending,
    failed,
    missing,
    needSyncCount: pending + failed,
    totalDurationMs,
    readyDurationMs,
  };
}

export function moveArrayItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list)) return [];
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= list.length
    || toIndex >= list.length
    || fromIndex === toIndex
  ) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function toPlayableSongPayload(track) {
  return {
    trackId: track.trackId,
    mediaId: track.mediaId,
    sha256: track.mediaSha256,
    durationMs: getTrackDurationMs(track),
    title: track.title,
    channelTitle: track.channel || '',
    thumbnail: track.thumbnail || '',
  };
}

export function computeScheduleDurationMs(albumIds = [], albums = []) {
  const albumMap = new Map(
    (Array.isArray(albums) ? albums : []).map((album) => [Number(album.albumId), album]),
  );
  let totalMs = 0;
  let trackCount = 0;
  let readyTrackCount = 0;
  const unreadyAlbumNames = [];

  for (const rawId of Array.isArray(albumIds) ? albumIds : []) {
    const album = albumMap.get(Number(rawId));
    if (!album) continue;
    const tracks = Array.isArray(album.tracks) ? album.tracks : [];
    const summary = summarizeAlbumTracks(tracks);
    totalMs += summary.totalDurationMs;
    trackCount += summary.total;
    readyTrackCount += summary.ready;
    if (summary.total === 0 || summary.ready < summary.total) {
      unreadyAlbumNames.push(album.name || `专辑 #${album.albumId}`);
    }
  }

  return {
    totalMs,
    trackCount,
    readyTrackCount,
    unreadyAlbumNames,
  };
}

export function formatScheduleSummary(plan) {
  if (!plan) return '';
  const typeLabels = { daily: '每天', weekdays: '工作日', weekends: '周末' };
  const days = plan.scheduleType === 'custom'
    ? String(plan.weekdays || '')
        .split(',')
        .map((day) => day.trim())
        .filter(Boolean)
        .map((day) => JUKEBOX_WEEKDAY_OPTIONS.find((item) => item.value === day)?.fullLabel || `周${day}`)
        .join('、') || '未选星期'
    : (typeLabels[plan.scheduleType] || '每天');

  const start = String(plan.startTime || '').slice(0, 5);
  const end = plan.endTime ? String(plan.endTime).slice(0, 5) : '';
  const overnight = Boolean(end && start && end <= start);
  const window = end
    ? `${start}–${end}${overnight ? '（次日）' : ''}`
    : `${start} · 播完一轮`;
  const loopText = end && String(plan.loop) === '1' ? ' · 循环至截止' : (end ? ' · 至多播一轮' : '');
  return `${days} · ${window}${loopText}`;
}

function parseHmMinutes(value) {
  const text = String(value ?? '').slice(0, 5);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

function resolveScheduleWeekdays(schedule) {
  const type = String(schedule?.scheduleType || 'daily').toLowerCase();
  if (type === 'daily') return [1, 2, 3, 4, 5, 6, 7];
  if (type === 'weekdays') return [1, 2, 3, 4, 5];
  if (type === 'weekends') return [6, 7];
  if (type !== 'custom') return [];
  const raw = Array.isArray(schedule.weekdays)
    ? schedule.weekdays
    : String(schedule.weekdays || '').split(',');
  return [...new Set(raw.map((item) => Number(String(item).trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
}

function scheduleWeekIntervals(schedule, durationFallbackMs = 60_000) {
  const startMin = parseHmMinutes(schedule?.startTime);
  const days = resolveScheduleWeekdays(schedule);
  if (startMin === null || !days.length) return [];

  let durationSec = 0;
  const hasEnd = schedule?.endTime != null && String(schedule.endTime).trim() !== '';
  if (hasEnd) {
    const endMin = parseHmMinutes(schedule.endTime);
    if (endMin === null || endMin === startMin) return [];
    durationSec = (endMin > startMin ? endMin - startMin : 24 * 60 - startMin + endMin) * 60;
  } else {
    const ms = Number(schedule?.totalDurationMs ?? durationFallbackMs);
    if (!Number.isFinite(ms) || ms <= 0) return [];
    durationSec = Math.max(1, Math.ceil(ms / 1000));
  }

  if (durationSec >= WEEK_SECONDS) return [[0, WEEK_SECONDS]];
  const list = [];
  for (const day of days) {
    const from = (day - 1) * DAY_SECONDS + startMin * 60;
    const to = from + durationSec;
    if (to <= WEEK_SECONDS) {
      list.push([from, to]);
    } else {
      list.push([from, WEEK_SECONDS]);
      list.push([0, to - WEEK_SECONDS]);
    }
  }
  return list;
}

export function detectScheduleTimeConflict(candidate, existingSchedules = [], albums = []) {
  if (!candidate || String(candidate.enabled) !== '1') return [];
  const candidateMeta = computeScheduleDurationMs(candidate.albumIds, albums);
  const candidateRanges = scheduleWeekIntervals(candidate, candidateMeta.totalMs || 60_000);
  if (!candidateRanges.length) return [];

  const candidateId = candidate.scheduleId ? Number(candidate.scheduleId) : null;
  const conflicts = [];

  for (const plan of Array.isArray(existingSchedules) ? existingSchedules : []) {
    if (!plan || String(plan.enabled) !== '1') continue;
    if (candidateId && Number(plan.scheduleId) === candidateId) continue;
    const planMeta = computeScheduleDurationMs(plan.albumIds, albums);
    const planRanges = scheduleWeekIntervals(plan, planMeta.totalMs || 60_000);
    const overlaps = candidateRanges.some(([a, b]) =>
      planRanges.some(([c, d]) => Math.max(a, c) < Math.min(b, d)),
    );
    if (overlaps) {
      conflicts.push({
        scheduleId: Number(plan.scheduleId),
        name: plan.name || `排期 #${plan.scheduleId}`,
      });
    }
  }

  return conflicts;
}
