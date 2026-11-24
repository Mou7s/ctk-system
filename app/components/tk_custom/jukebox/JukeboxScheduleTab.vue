<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <!-- 顶部说明与操作条 -->
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-bold text-highlighted">定时广播排期（含凌晨播放）</h2>
            <UBadge color="neutral" variant="subtle" size="xs" icon="i-lucide-globe">
              时区 Asia/Shanghai
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            排期与曲库解耦：每条排期可按顺序组合多张专辑。仅当所选专辑全部曲目具备已校验本地音频时才会同步生效。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <UButton
            v-if="canSchedule"
            icon="i-lucide-refresh-cw"
            label="立即同步排期"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="syncing"
            @click="emit('sync')"
          />
          <UButton
            v-if="canSchedule"
            icon="i-lucide-plus"
            label="新建排期"
            color="primary"
            size="sm"
            @click="openCreate"
          />
        </div>
      </div>
    </UCard>

    <!-- 加载中 -->
    <div v-if="loading" class="grid gap-3">
      <USkeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-xl" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!schedules.length" class="rounded-xl border border-dashed border-default bg-elevated/30 py-12">
      <UEmpty
        icon="i-lucide-calendar-clock"
        title="还没有定时广播排期"
        description="例如设置每天 02:00 凌晨播放或早班前奏，勾选专辑后保存即可"
      >
        <template v-if="canSchedule" #actions>
          <UButton icon="i-lucide-plus" color="primary" @click="openCreate">
            创建第一条排期
          </UButton>
        </template>
      </UEmpty>
    </div>

    <!-- 排期列表 -->
    <div v-else class="grid gap-3">
      <UCard
        v-for="plan in schedules"
        :key="plan.scheduleId"
        :class="isScheduleRunning(plan) ? 'ring-1 ring-primary/50 bg-primary/[0.03]' : ''"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-bold text-highlighted">{{ plan.name }}</span>
              <UBadge
                v-if="isScheduleRunning(plan)"
                color="primary"
                variant="solid"
                size="xs"
                icon="i-lucide-radio"
              >
                正在播音中
              </UBadge>
              <UBadge
                v-else
                :color="plan.enabled === '1' ? 'success' : 'neutral'"
                variant="soft"
                size="xs"
              >
                {{ plan.enabled === '1' ? '已启用' : '已停用' }}
              </UBadge>
              <span class="text-xs font-medium text-default">
                {{ formatScheduleSummary(plan) }}
              </span>
            </div>

            <!-- 专辑顺序链 -->
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span class="text-muted">播音顺序：</span>
              <template v-if="plan.albumNames?.length">
                <template v-for="(name, idx) in plan.albumNames" :key="`${plan.scheduleId}-alb-${idx}`">
                  <UBadge color="neutral" variant="outline" size="xs">
                    {{ idx + 1 }}. {{ name }}
                  </UBadge>
                  <UIcon
                    v-if="idx < plan.albumNames.length - 1"
                    name="i-lucide-arrow-right"
                    class="size-3 text-muted"
                  />
                </template>
              </template>
              <span v-else class="text-warning">未关联专辑</span>
            </div>

            <!-- 统计与告警 -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>共 {{ planMeta(plan).trackCount }} 首 · 单轮约 {{ formatHumanDurationMs(planMeta(plan).totalMs) }}</span>
              <span v-if="lastPlayedAt(plan)">
                最近触发：{{ formatLastPlayed(lastPlayedAt(plan)) }}
              </span>
              <span v-if="plan.remark">备注：{{ plan.remark }}</span>
            </div>

            <UAlert
              v-if="planMeta(plan).unreadyAlbumNames.length"
              color="warning"
              variant="soft"
              icon="i-lucide-triangle-alert"
              :title="`以下专辑尚有未就绪曲目或为空，同步时会被播放器排除：${planMeta(plan).unreadyAlbumNames.join('、')}`"
            />
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <USwitch
              :model-value="plan.enabled === '1'"
              size="sm"
              :disabled="!canSchedule || saving"
              aria-label="启停排期"
              @update:model-value="emit('toggle', { plan, enabled: $event })"
            />
            <UButton
              v-if="canSchedule"
              icon="i-lucide-pencil"
              size="xs"
              color="neutral"
              variant="outline"
              label="编辑"
              :disabled="saving"
              @click="openEdit(plan)"
            />
            <UButton
              v-if="canSchedule"
              icon="i-lucide-trash-2"
              size="xs"
              color="error"
              variant="ghost"
              aria-label="删除排期"
              :disabled="saving"
              @click="emit('delete', plan)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- 新建/编辑排期右抽屉 -->
    <USlideover
      v-model:open="drawerOpen"
      side="right"
      :title="editingId ? '编辑定时广播排期' : '新建定时广播排期'"
      description="配置广播周期、时间窗口与多专辑播放先后顺序"
      :ui="{ content: 'sm:max-w-xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-5">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField label="排期名称" required>
              <UInput
                v-model="form.name"
                placeholder="例如：凌晨播放"
                maxlength="200"
                class="w-full"
              />
            </UFormField>

            <UFormField label="重复周期" required>
              <USelect
                v-model="form.scheduleType"
                :items="JUKEBOX_SCHEDULE_TYPE_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>

            <UFormField label="开始时间" required>
              <UInput v-model="form.startTime" type="time" class="w-full" />
            </UFormField>

            <UFormField label="结束时间（可选）" hint="留空表示按专辑顺序播完一轮自动停止">
              <div class="flex items-center gap-1.5">
                <UInput v-model="form.endTime" type="time" class="flex-1" />
                <UButton
                  v-if="form.endTime"
                  icon="i-lucide-x"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  aria-label="清空结束时间"
                  @click="form.endTime = ''; form.loop = '0'"
                />
              </div>
            </UFormField>
          </div>

          <!-- 自选星期 -->
          <UFormField v-if="form.scheduleType === 'custom'" label="自选星期" required>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="day in JUKEBOX_WEEKDAY_OPTIONS"
                :key="day.value"
                size="xs"
                :color="form.weekdays.includes(day.value) ? 'primary' : 'neutral'"
                :variant="form.weekdays.includes(day.value) ? 'solid' : 'outline'"
                @click="toggleWeekday(day.value)"
              >
                {{ day.fullLabel }}
              </UButton>
            </div>
          </UFormField>

          <div class="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-default bg-elevated/40 p-3">
            <UCheckbox
              :model-value="form.loop === '1'"
              :disabled="!form.endTime"
              label="在结束时间前循环播放"
              @update:model-value="form.loop = $event ? '1' : '0'"
            />
            <UCheckbox
              :model-value="form.enabled === '1'"
              label="保存后立即启用此排期"
              @update:model-value="form.enabled = $event ? '1' : '0'"
            />
          </div>

          <UFormField label="备注（可选）">
            <UInput v-model="form.remark" placeholder="补充适用车间或广播说明" maxlength="500" class="w-full" />
          </UFormField>

          <!-- 有序多专辑编排 -->
          <div class="space-y-3 border-t border-default pt-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold text-highlighted">已编排专辑（按顺序播放）</h3>
                <p class="text-xs text-muted">
                  已选 {{ form.albumIds.length }} 张 · 共 {{ formMeta.trackCount }} 首（就绪 {{ formMeta.readyTrackCount }} 首）· 单轮约 {{ formatHumanDurationMs(formMeta.totalMs) }}
                </p>
              </div>
            </div>

            <div v-if="!selectedAlbums.length" class="rounded-lg border border-dashed border-default px-4 py-5 text-center text-xs text-muted">
              尚未添加专辑，请从下方可用专辑列表中点选添加
            </div>

            <div v-else class="divide-y divide-default rounded-lg border border-default bg-default">
              <div
                v-for="(album, index) in selectedAlbums"
                :key="album.albumId"
                class="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <UBadge color="primary" variant="soft" size="xs">{{ index + 1 }}</UBadge>
                  <div class="min-w-0">
                    <div class="truncate text-xs font-semibold text-highlighted">{{ album.name }}</div>
                    <div class="text-[11px] text-muted">
                      {{ albumSummary(album).ready }}/{{ albumSummary(album).total }} 首已就绪
                      <span v-if="albumSummary(album).readyDurationMs > 0">
                        · {{ formatHumanDurationMs(albumSummary(album).readyDurationMs) }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <UButton
                    icon="i-lucide-arrow-up"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === 0"
                    aria-label="上移专辑"
                    @click="moveSelectedAlbum(index, index - 1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-down"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="index === selectedAlbums.length - 1"
                    aria-label="下移专辑"
                    @click="moveSelectedAlbum(index, index + 1)"
                  />
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="error"
                    variant="ghost"
                    aria-label="移除专辑"
                    @click="removeAlbumFromOrder(album.albumId)"
                  />
                </div>
              </div>
            </div>

            <div class="space-y-2 pt-2">
              <span class="block text-xs font-medium text-muted">可用专辑（点击添加到播音队列末尾）</span>
              <div v-if="!albums.length" class="text-xs text-muted">暂无专辑，请先在曲库中新建并导入音频</div>
              <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  v-for="album in availableAlbums"
                  :key="album.albumId"
                  type="button"
                  :disabled="!album.tracks?.length"
                  class="flex items-center justify-between gap-2 rounded-lg border border-default bg-elevated/40 px-3 py-2 text-left transition hover:border-primary/50 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  @click="addAlbumToOrder(album.albumId)"
                >
                  <div class="min-w-0">
                    <div class="truncate text-xs font-medium text-highlighted">{{ album.name }}</div>
                    <div class="text-[11px] text-muted">
                      {{ albumSummary(album).ready }}/{{ albumSummary(album).total }} 首就绪
                    </div>
                  </div>
                  <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-primary" />
                </button>
              </div>
            </div>
          </div>

          <!-- 实时冲突与就绪警告 -->
          <UAlert
            v-if="conflictWarnings.length"
            color="error"
            variant="soft"
            icon="i-lucide-calendar-x"
            :title="`启用后时间窗口与「${conflictWarnings.map((item) => item.name).join('、')}」重叠`"
            description="同一周同时刻只能有一条启用的广播排期，请调整时间或先停用冲突计划。"
          />
          <UAlert
            v-else-if="form.enabled === '1' && formMeta.unreadyAlbumNames.length"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="`以下选中专辑尚有未就绪或空曲目：${formMeta.unreadyAlbumNames.join('、')}`"
            description="建议先为曲目导入并同步完本地音频，再开启排期。"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="saving" @click="drawerOpen = false">
            取消
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!canSubmitSchedule"
            @click="submitSchedule"
          >
            {{ editingId ? '保存排期修改' : '保存新建排期' }}
          </UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup>
import {
  JUKEBOX_SCHEDULE_TYPE_OPTIONS,
  JUKEBOX_WEEKDAY_OPTIONS,
  computeScheduleDurationMs,
  detectScheduleTimeConflict,
  formatHumanDurationMs,
  formatScheduleSummary,
  moveArrayItem,
  summarizeAlbumTracks,
} from '@ctk-system/shared'

const props = defineProps({
  schedules: {
    type: Array,
    default: () => [],
  },
  albums: {
    type: Array,
    default: () => [],
  },
  activeScheduleId: {
    type: Number,
    default: null,
  },
  playerLastPlayed: {
    type: Object,
    default: () => ({}),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  saving: {
    type: Boolean,
    default: false,
  },
  syncing: {
    type: Boolean,
    default: false,
  },
  canSchedule: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['save', 'toggle', 'delete', 'sync'])

const drawerOpen = ref(false)
const editingId = ref(null)
const form = reactive(createEmptyForm())

function createEmptyForm() {
  return {
    name: '凌晨播放',
    scheduleType: 'daily',
    weekdays: [],
    startTime: '02:00',
    endTime: '',
    loop: '0',
    enabled: '0',
    albumIds: [],
    remark: '',
  }
}

function resetForm() {
  editingId.value = null
  Object.assign(form, createEmptyForm())
}

function openCreate() {
  resetForm()
  drawerOpen.value = true
}

function openEdit(plan) {
  editingId.value = Number(plan.scheduleId)
  Object.assign(form, {
    name: plan.name || '凌晨播放',
    scheduleType: plan.scheduleType || 'daily',
    weekdays: String(plan.weekdays || '').split(',').map((d) => d.trim()).filter(Boolean),
    startTime: String(plan.startTime || '02:00').slice(0, 5),
    endTime: plan.endTime ? String(plan.endTime).slice(0, 5) : '',
    loop: String(plan.loop ?? '0'),
    enabled: String(plan.enabled ?? '0'),
    albumIds: Array.isArray(plan.albumIds) ? plan.albumIds.map(Number) : [],
    remark: plan.remark || '',
  })
  drawerOpen.value = true
}

const albumMap = computed(() => new Map(
  props.albums.map((album) => [Number(album.albumId), album]),
))

const selectedAlbums = computed(() => form.albumIds
  .map((id) => albumMap.value.get(Number(id)))
  .filter(Boolean))

const availableAlbums = computed(() => {
  const chosen = new Set(form.albumIds.map(Number))
  return props.albums.filter((album) => !chosen.has(Number(album.albumId)))
})

const formMeta = computed(() => computeScheduleDurationMs(form.albumIds, props.albums))

const conflictWarnings = computed(() => detectScheduleTimeConflict({
  scheduleId: editingId.value,
  scheduleType: form.scheduleType,
  weekdays: form.weekdays,
  startTime: form.startTime,
  endTime: form.endTime || null,
  enabled: form.enabled,
  albumIds: form.albumIds,
}, props.schedules, props.albums))

const canSubmitSchedule = computed(() => (
  Boolean(form.name.trim())
  && Boolean(form.startTime)
  && form.albumIds.length > 0
  && (form.scheduleType !== 'custom' || form.weekdays.length > 0)
))

function albumSummary(album) {
  return summarizeAlbumTracks(album?.tracks || [])
}

function planMeta(plan) {
  return computeScheduleDurationMs(plan?.albumIds || [], props.albums)
}

function isScheduleRunning(plan) {
  return props.activeScheduleId != null && Number(props.activeScheduleId) === Number(plan.scheduleId)
}

function lastPlayedAt(plan) {
  const fromPlayer = props.playerLastPlayed?.[String(plan.scheduleId)]
  return fromPlayer || plan.lastPlayed || ''
}

function formatLastPlayed(value) {
  return String(value).replace('T', ' ').replace('+08:00', '').slice(0, 16)
}

function toggleWeekday(day) {
  const set = new Set(form.weekdays)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  form.weekdays = [...set].sort((a, b) => Number(a) - Number(b))
}

function addAlbumToOrder(albumId) {
  const id = Number(albumId)
  if (!form.albumIds.includes(id)) {
    form.albumIds = [...form.albumIds, id]
  }
}

function removeAlbumFromOrder(albumId) {
  const id = Number(albumId)
  form.albumIds = form.albumIds.filter((item) => Number(item) !== id)
}

function moveSelectedAlbum(fromIndex, toIndex) {
  form.albumIds = moveArrayItem(form.albumIds, fromIndex, toIndex)
}

function submitSchedule() {
  if (!canSubmitSchedule.value || props.saving) return
  emit('save', {
    scheduleId: editingId.value,
    payload: {
      name: form.name.trim(),
      albumIds: [...form.albumIds],
      scheduleType: form.scheduleType,
      weekdays: form.scheduleType === 'custom' ? form.weekdays.join(',') : '',
      startTime: form.startTime,
      endTime: form.endTime || null,
      loop: form.endTime ? form.loop : '0',
      enabled: form.enabled,
      remark: form.remark.trim(),
    },
    onSuccess: () => {
      drawerOpen.value = false
      resetForm()
    },
  })
}
</script>
