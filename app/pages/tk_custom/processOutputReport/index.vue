<template>
  <main class="absolute inset-0 overflow-y-auto bg-muted text-default">
    <div class="mx-auto flex min-h-full max-w-[1760px] flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-6">
      <UPageHeader
        title="工序产量报表"
        description="按产品类别汇总工序产量与目标达成情况。"
        :ui="{
          root: 'border-b-0 py-0',
          title: 'text-xl sm:text-2xl',
          description: 'mt-0.5 text-xs sm:text-sm',
          wrapper: 'gap-2',
          links: 'gap-2',
        }"
      >
        <template #links>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-settings-2"
            @click="openTargetDialog"
          >
            目标产能
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            @click="handleExport"
          >
            导出报表
          </UButton>
        </template>
      </UPageHeader>

      <UCard
        :ui="{
          header: 'border-b border-default px-4 py-2',
          body: 'p-3 sm:p-4',
        }"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 class="text-sm font-semibold text-highlighted">查询条件</h2>
              <span class="text-xs text-muted">日期、班次或自定义时段</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge v-if="isRangeMode" color="primary" variant="subtle">
                {{ activeDateRangePreset?.label || "自定义时段" }}
              </UBadge>
              <UBadge color="neutral" variant="subtle" class="font-mono tabular-nums">
                {{ currentShiftText }}
              </UBadge>
            </div>
          </div>
        </template>

        <div class="grid grid-cols-1 items-end gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(19rem,1.3fr)_minmax(16rem,1fr)_minmax(18.5rem,auto)_auto]">
          <UFormField label="生产日期范围" class="min-w-0">
            <UPopover v-model:open="dateRangeOpen" :content="{ align: 'start' }">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar-days"
                trailing-icon="i-lucide-chevron-down"
                class="w-full justify-between font-normal"
              >
                <span class="min-w-0 flex-1 truncate text-left">
                  {{ dateRangeLabel || "选择日期范围" }}
                </span>
              </UButton>
              <template #content>
                <div class="flex items-stretch divide-x divide-default">
                  <div class="hidden flex-col justify-center py-2 sm:flex">
                    <UButton
                      v-for="preset in dateRangePresetOptions"
                      :key="preset.value"
                      :label="preset.label"
                      :color="isDateRangePresetSelected(preset.value) ? 'primary' : 'neutral'"
                      :variant="isDateRangePresetSelected(preset.value) ? 'soft' : 'ghost'"
                      class="justify-start rounded-none px-4 hover:bg-elevated/50"
                      truncate
                      @click="applyDateRangePreset(preset.value)"
                    />
                  </div>
                  <UCalendar
                    range
                    :default-value="dateRangeCalendarValue"
                    :number-of-months="calendarMonths"
                    locale="zh-CN"
                    class="p-2"
                    @update:model-value="onDateRangePick"
                  />
                </div>
              </template>
            </UPopover>
          </UFormField>

          <UFormField
            label="时间范围"
            :error="timeRangeError || undefined"
            class="min-w-0"
          >
            <UFieldGroup class="w-full">
              <UInput
                v-model="startTimeText"
                type="time"
                icon="i-lucide-clock-3"
                aria-label="开始时间"
                class="min-w-0 flex-1"
              />
              <UInput
                v-model="endTimeText"
                type="time"
                icon="i-lucide-clock-3"
                aria-label="结束时间"
                class="min-w-0 flex-1"
              />
            </UFieldGroup>
          </UFormField>

          <UFormField label="快捷班次" class="min-w-0">
            <UFieldGroup class="w-full">
              <UButton
                v-for="option in shiftOptions"
                :key="option.value"
                :label="option.label"
                :color="activeQuickShiftType === option.value ? 'primary' : 'neutral'"
                :variant="activeQuickShiftType === option.value ? 'soft' : 'outline'"
                class="flex-1 justify-center whitespace-nowrap"
                @click="applyQuickShift(option.value)"
              />
            </UFieldGroup>
          </UFormField>

          <div class="flex gap-2 lg:justify-end">
            <UButton
              color="primary"
              icon="i-lucide-search"
              :disabled="Boolean(timeRangeError)"
              :loading="loading"
              class="flex-1 lg:flex-none"
              @click="handleQuery"
            >
              查询
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-ccw"
              :disabled="loading"
              class="flex-1 lg:flex-none"
              @click="resetQuery"
            >
              重置
            </UButton>
          </div>
        </div>
      </UCard>

            <UCard :ui="{ body: 'p-3 sm:p-3' }">
        <div class="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 sm:gap-4">
          <div class="flex min-w-0 items-center gap-2.5 px-1">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-target" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="text-xs text-muted">综合达成率</p>
              <p
                class="mt-0.5 font-mono text-lg font-semibold tabular-nums"
                :class="
                  activeTableStats.achievementRate === null
                    ? 'text-muted'
                    : activeTableStats.achievementRate >= 1
                      ? 'text-success'
                      : 'text-warning'
                "
              >
                {{ formatPercent(activeTableStats.achievementRate) || "-" }}
              </p>
            </div>
          </div>

          <div class="flex min-w-0 items-center gap-2.5 px-1">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
              <UIcon name="i-lucide-list-checks" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="text-xs text-muted">达标工序</p>
              <p class="mt-0.5 font-mono text-lg font-semibold tabular-nums text-highlighted">
                {{ activeTableStats.qualifiedProcessCount }} /
                {{ activeTableStats.targetProcessCount || totalProcessCount }}
              </p>
            </div>
          </div>

          <div class="flex min-w-0 items-center gap-2.5 px-1">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
              <UIcon name="i-lucide-factory" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="text-xs text-muted">末道工序产量</p>
              <p class="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span class="font-mono text-lg font-semibold tabular-nums text-highlighted">
                  {{ formatNumber(activeTableStats.lastProcessOutput) || "-" }}
                </span>
                <span class="text-xs text-muted">
                  {{ activeTableStats.lastProcessName || "暂无工序" }}
                </span>
              </p>
            </div>
          </div>

          <div class="flex min-w-0 items-center gap-2.5 px-1">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
              <UIcon name="i-lucide-boxes" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="text-xs text-muted">涉及封装</p>
              <p class="mt-0.5 font-mono text-lg font-semibold tabular-nums text-highlighted">
                {{ totalPackageCount.toLocaleString("zh-CN") }}
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="loading && !reportTables.some(hasTableData)"
        color="primary"
        variant="subtle"
        icon="i-lucide-loader-circle"
        title="正在加载产量报表"
        description="正在按所选时间范围汇总工序数据。"
      />

      <div v-else class="space-y-3">
        <section
          v-for="table in reportTables"
          :key="table.tableName"
          class="min-w-0"
        >
          <UCard
            :ui="{
              root: 'overflow-hidden',
              header: 'px-4 py-2 sm:px-5',
              body: 'p-0',
            }"
          >
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="truncate text-base font-semibold text-highlighted">
                    {{ table.tableName }}
                  </h2>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge color="neutral" variant="subtle">
                    {{ table.rows?.length || 0 }} 个封装
                  </UBadge>
                  <UBadge color="neutral" variant="subtle">
                    {{ table.processes?.length || 0 }} 道工序
                  </UBadge>
                </div>
              </div>
            </template>

            <UTable
              v-if="hasTableData(table)"
              :data="buildTableRows(table)"
              :columns="getTableColumns(table)"
              :loading="loading"
              :meta="{
                class: {
                  tr: (row) => {
                    const rowType = row.original?.rowType;
                    if (rowType === 'total') return 'bg-muted/70 font-semibold';
                    if (rowType === 'staff') return 'bg-info/5';
                    if (rowType === 'average') return 'bg-primary/5 font-medium';
                    return '';
                  },
                },
              }"
              :ui="{
                base: 'min-w-full',
                th: 'whitespace-nowrap px-3 py-2 text-center',
                td: 'px-3 py-2 text-center font-mono tabular-nums',
              }"
            >
              <template #packageName-cell="{ row }">
                <span
                  :class="{
                    'font-semibold text-highlighted': row.original?.rowType === 'total',
                    'font-medium text-info': row.original?.rowType === 'staff',
                    'font-medium text-primary': row.original?.rowType === 'average',
                  }"
                >
                  {{ row.original?.packageName }}
                </span>
              </template>

              <template
                v-for="process in table.processes"
                :key="process.processName"
                v-slot:[getProcessSlotName(process.processName)]="{ row }"
              >
                <div
                  v-if="
                    row.original?.rowType === 'staff' ||
                    row.original?.rowType === 'average'
                  "
                  class="font-medium tabular-nums text-highlighted"
                >
                  {{ getCellText(row, process.processName, "output", table) || "-" }}
                </div>
                <div v-else class="flex min-w-24 flex-col items-center gap-1">
                  <span class="font-semibold text-highlighted">
                    {{ getCellText(row, process.processName, "output", table) || "-" }}
                  </span>
                  <div
                    v-if="hasCellTarget(row, process.processName)"
                    class="flex flex-wrap items-center justify-center gap-1.5"
                  >
                    <span class="text-xs text-muted">
                      目标 {{ getCellText(row, process.processName, "target", table) }}
                    </span>
                    <UTooltip
                      :disabled="!isRateLow(row, process.processName)"
                      :text="getDeltaTooltipText(row, process.processName)"
                    >
                      <UBadge
                        :color="getRateClass(row, process.processName) === 'rate-good' ? 'success' : 'warning'"
                        variant="subtle"
                        size="sm"
                      >
                        {{ getCellText(row, process.processName, "rate", table) }}
                      </UBadge>
                    </UTooltip>
                  </div>
                </div>
              </template>
            </UTable>

            <div v-else-if="!loading" class="p-4 sm:p-5">
              <UAlert
                color="neutral"
                variant="subtle"
                icon="i-lucide-inbox"
                title="当前分类暂无数据"
                description="可以扩大日期范围后重新查询。"
              />
            </div>

            <div v-else class="space-y-3 p-4 sm:p-5" aria-label="正在加载">
              <USkeleton class="h-8 w-1/3" />
              <USkeleton class="h-10 w-full" />
              <USkeleton class="h-10 w-5/6" />
            </div>
          </UCard>
        </section>
      </div>
    </div>

    <UModal
      v-model:open="targetDialog.open"
      title="目标产能维护"
      :ui="{
        content: 'sm:max-w-4xl',
        body: 'p-0',
      }"
    >
      <template #body>
        <div class="grid grid-cols-1 items-end gap-4 border-b border-default p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
          <UFormField label="产品类别">
            <USelect
              v-model="matrixFilterTable"
              :items="matrixFilterOptions"
              class="w-full sm:min-w-64"
              @change="handleMatrixFilterChange"
            />
          </UFormField>
          <div class="flex items-center gap-2">
            <UBadge color="success" variant="subtle">日目标产能</UBadge>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="targetDialog.loading"
              @click="reloadTargetMatrix"
            >
              重载
            </UButton>
          </div>
        </div>

        <div class="space-y-4 p-4 sm:p-5">
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-info"
            title="按日目标填写"
            description="系统会按所选时段折算对应目标；目标留空并保存会移除该封装现有的目标记录。"
          />

          <div class="max-h-[55vh] overflow-auto rounded-lg border border-default">
            <UTable
              :data="targetMatrixRows"
              :columns="targetMatrixColumns"
              :loading="targetDialog.loading"
              :meta="{
                class: {
                  tr: (row) =>
                    row.original?.rowType === 'tableTotal'
                      ? 'bg-warning/10 font-semibold'
                      : '',
                },
              }"
              :ui="{
                base: 'min-w-full',
                th: 'whitespace-nowrap',
              }"
            >
              <template #displayName-cell="{ row }">
                <span
                  :class="
                    row.original?.rowType === 'tableTotal'
                      ? 'font-semibold text-warning'
                      : 'font-medium text-highlighted'
                  "
                >
                  {{ row.original?.displayName }}
                </span>
              </template>

              <template #targetCapacity-cell="{ row }">
                <span
                  v-if="
                    row.original?.rowType === 'tableTotal' &&
                    row.original?.calculatedValue !== null
                  "
                  class="font-mono font-semibold tabular-nums text-warning"
                >
                  {{ row.original?.calculatedValue }}
                </span>
                <UInput
                  v-else
                  v-model="row.original.targetCapacity"
                  type="number"
                  :min="0"
                  placeholder="不设置"
                  class="w-full sm:max-w-40"
                />
              </template>
            </UTable>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-muted">
            目标以月目标记录保存，按日目标数值折算。
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              :disabled="targetDialog.saving"
              @click="targetDialog.open = false"
            >
              取消
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-check"
              :loading="targetDialog.saving"
              @click="submitTargetMatrix"
            >
              批量保存
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </main>
</template>
<script setup name="ProcessOutputReport">
import { DEFAULT_PAGE_NUM } from "@ctk-system/shared";
import { parseDate as parseCalendarDate } from "@internationalized/date";
import { useCalendarMonths } from "@/packages/shared/dateRange";
const toast = useToast();

const { proxy } = getCurrentInstance();

const productTableTabs = ["塑封小信号产品", "塑封功率器件产品", "玻封产品"];
const SHIFT_DAY = "dayShift";
const SHIFT_NIGHT = "nightShift";
const SHIFT_FULL_DAY = "day";
const SHIFT_CALENDAR_DAY = "calendarDay";
const SHIFT_RANGE = "shiftRange";
const shiftOptions = [
  {
    value: SHIFT_DAY,
    label: "白班",
    fileLabel: "白班",
    startHour: 8,
    endHour: 20,
    endOffset: 0,
  },
  {
    value: SHIFT_NIGHT,
    label: "夜班",
    fileLabel: "夜班",
    startHour: 20,
    endHour: 8,
    endOffset: 1,
  },
  {
    value: SHIFT_FULL_DAY,
    label: "班次日",
    fileLabel: "班次日",
    startHour: 8,
    endHour: 8,
    endOffset: 1,
  },
  {
    value: SHIFT_CALENDAR_DAY,
    label: "自然日",
    fileLabel: "自然日",
    startHour: 0,
    endHour: 0,
    endOffset: 1,
  },
];
const dateRangePresetOptions = [
  { value: "thisWeek", label: "本周" },
  { value: "lastWeek", label: "上周" },
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
];
const defaultTargetProcesses = ["固晶", "焊线", "模压", "测试分选", "包装入库"];
const glassTargetProcesses = ["组装", "烧结", "玻封上锡", "打印", "上带", "玻封包装"];
const targetProductTableDefinitions = [
  {
    tableName: "塑封小信号产品",
    packages: [
      "SOD-123",
      "SOD-323",
      "SOD-523",
      "SOT-23 6R/27R",
      "SOT23-3L/5L/6L",
      "DFN1006",
    ],
    processes: defaultTargetProcesses,
  },
  {
    tableName: "塑封功率器件产品",
    packages: ["PDFN3X3", "PDFN5X6", "TO-252"],
    processes: defaultTargetProcesses,
  },
  {
    tableName: "玻封产品",
    packages: [],
    processes: glassTargetProcesses,
  },
];
const loading = ref(false);
const summary = ref(createEmptySummary());
const targetList = ref([]);
const targetMatrixRows = ref([]);
const matrixFilterTable = ref("all");

const defaultShiftSelection = getCurrentShiftSelection();
const defaultShiftRange = buildShiftRange(
  defaultShiftSelection.productionDate,
  defaultShiftSelection.shiftType,
);
const productionDate = ref(defaultShiftSelection.productionDate);
const selectedShiftType = ref(defaultShiftSelection.shiftType);
const shiftTimeRange = ref([defaultShiftRange.start, defaultShiftRange.end]);
const selectedCalendarRange = ref([
  defaultShiftSelection.productionDate,
  defaultShiftSelection.productionDate,
]);

const dateRangeOpen = ref(false);
const calendarMonths = useCalendarMonths();

function datePartOf(dateTimeText) {
  return (dateTimeText || "").slice(0, 10);
}

function timePartOf(dateTimeText) {
  return (dateTimeText || "").slice(11, 16);
}

function normalizeTimePart(hhmm) {
  if (!hhmm) return "00:00:00";
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

function setTimePart(dateTimeText, hhmm) {
  return `${datePartOf(dateTimeText) || getToday()} ${normalizeTimePart(hhmm)}`;
}

function calendarDateValue(dateTimeText) {
  const ymd = datePartOf(dateTimeText);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  try {
    return parseCalendarDate(ymd);
  } catch {
    return null;
  }
}

function commitTimePart(key, hhmm) {
  const range = [...(shiftTimeRange.value || [])];
  if (
    selectedShiftType.value === SHIFT_FULL_DAY ||
    selectedShiftType.value === SHIFT_CALENDAR_DAY
  ) {
    const [startDate, endDate] = selectedCalendarRange.value || [];
    if (startDate && endDate) {
      if (key === 0) {
        range[0] = setTimePart(`${startDate} ${timePartOf(range[0])}`, hhmm);
      } else {
        const normalized = normalizeTimePart(hhmm);
        const targetEndDate =
          normalized === "00:00:00" ? addDays(endDate, 1) : endDate;
        range[1] = setTimePart(`${targetEndDate} ${timePartOf(range[1])}`, hhmm);
      }
      shiftTimeRange.value = range;
      return;
    }
  }
  range[key] = setTimePart(range[key], hhmm);
  shiftTimeRange.value = range;
}

const startTimeText = computed({
  get: () => timePartOf(shiftTimeRange.value?.[0]),
  set: (hhmm) => commitTimePart(0, hhmm),
});
const endTimeText = computed({
  get: () => timePartOf(shiftTimeRange.value?.[1]),
  set: (hhmm) => commitTimePart(1, hhmm),
});
const dateRangeCalendarValue = computed(() => {
  const start = calendarDateValue(selectedCalendarRange.value?.[0]);
  const end = calendarDateValue(selectedCalendarRange.value?.[1]);
  return start && end ? { start, end } : null;
});
const dateRangeLabel = computed(() => {
  const [start, end] = selectedCalendarRange.value || [];
  const okYmd = (ymd) => /^\d{4}-\d{2}-\d{2}$/.test(ymd);
  return okYmd(start) && okYmd(end) ? `${start} ~ ${end}` : "";
});
const activeDateRangePreset = computed(
  () =>
    dateRangePresetOptions.find((preset) =>
      isDateRangePresetSelected(preset.value),
    ) || null,
);
function onDateRangePick(range) {
  if (!range?.start || !range?.end) return;
  const startYmd = String(range.start).slice(0, 10);
  const endYmd = String(range.end).slice(0, 10);
  applyCalendarDateRange(startYmd, endYmd);
}

const timeRangeError = computed(() => {
  const [start, end] = shiftTimeRange.value || [];
  if (!start || !end) {
    return "请选择完整的开始和结束时间";
  }
  if (parseDateTime(end) <= parseDateTime(start)) {
    return "结束时间必须晚于开始时间";
  }
  return "";
});

function isMultiDayCapableShift(shiftType) {
  return shiftType === SHIFT_FULL_DAY || shiftType === SHIFT_CALENDAR_DAY;
}

function buildMultiDayShiftRange(startDate, endDate, shiftType) {
  return {
    start: buildShiftRange(startDate, shiftType).start,
    end: buildShiftRange(endDate, shiftType).end,
  };
}

function applyQuickShift(shiftType) {
  const [selectedStart, selectedEnd] = selectedCalendarRange.value || [];
  if (!selectedStart || !selectedEnd) return;

  if (isMultiDayCapableShift(shiftType) && selectedStart !== selectedEnd) {
    productionDate.value = selectedStart;
    selectedShiftType.value = shiftType;
    const range = buildMultiDayShiftRange(selectedStart, selectedEnd, shiftType);
    shiftTimeRange.value = [range.start, range.end];
  } else {
    productionDate.value = selectedStart;
    selectedShiftType.value = shiftType;
    selectedCalendarRange.value = [selectedStart, selectedStart];
    const range = buildShiftRange(selectedStart, shiftType);
    shiftTimeRange.value = [range.start, range.end];
  }
  syncShiftQuery();
}

function getDateRangePreset(preset) {
  const todayText = getToday();
  const today = parseDate(todayText);
  const monday = addDays(todayText, 1 - (today.getDay() || 7));

  if (preset === "thisWeek") {
    return { start: monday, end: todayText };
  }
  if (preset === "lastWeek") {
    return { start: addDays(monday, -7), end: addDays(monday, -1) };
  }
  if (preset === "thisMonth") {
    return {
      start: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: todayText,
    };
  }

  return {
    start: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    end: formatDate(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

function isDateRangePresetSelected(preset) {
  const range = getDateRangePreset(preset);
  const [start, end] = selectedCalendarRange.value || [];
  return start === range.start && end === range.end;
}

function applyDateRangePreset(preset) {
  const { start, end } = getDateRangePreset(preset);
  applyCalendarDateRange(start, end);
}

function buildFullDayRange(startDate, endDate) {
  return buildMultiDayShiftRange(startDate, endDate, SHIFT_FULL_DAY);
}

function buildCalendarDayRange(startDate, endDate) {
  return buildMultiDayShiftRange(startDate, endDate, SHIFT_CALENDAR_DAY);
}

function applyCalendarDateRange(startDate, endDate) {
  selectedCalendarRange.value = [startDate, endDate];
  dateRangeOpen.value = false;

  if (startDate !== endDate) {
    productionDate.value = startDate;
    // 跨多天范围（周报/月报/自定义多日）默认按自然日 00:00~24:00 统计，直接对齐金蝶单据日期口径
    selectedShiftType.value = SHIFT_CALENDAR_DAY;
    const range = buildCalendarDayRange(startDate, endDate);
    shiftTimeRange.value = [range.start, range.end];
    syncShiftQuery();
    return;
  }

  productionDate.value = startDate;
  const range = buildShiftRange(startDate, selectedShiftType.value);
  shiftTimeRange.value = [range.start, range.end];
  syncShiftQuery();
}

const queryParams = reactive({
  periodType: selectedShiftType.value,
  reportDate: "",
  packageName: "",
  processName: "",
  tableName: "",
});

const targetMatrixColumns = [
  { accessorKey: "displayName", header: "产品封装" },
  { accessorKey: "targetCapacity", header: "日目标产能" },
];

function getProcessSlotName(processName) {
  return `${processName}-cell`;
}

function getTableColumns(table) {
  const cols = [{ accessorKey: "packageName", header: "产品封装/规格" }];
  if (table && table.processes) {
    table.processes.forEach((proc) => {
      cols.push({
        accessorKey: proc.processName,
        header: proc.processName,
      });
    });
  }
  return cols;
}

const targetQuery = reactive({
  pageNum: DEFAULT_PAGE_NUM,
  pageSize: 500,
  packageName: "",
  processName: "",
});

const targetDialog = reactive({
  open: false,
  loading: false,
  saving: false,
});

const reportTables = computed(() => {
  const tables = summary.value.tables || [];
  if (tables.length) {
    return tables;
  }
  return [
    {
      tableName: "工序产量报表",
      processes: summary.value.processes || [],
      rows: summary.value.rows || [],
      totalRow: summary.value.totalRow || { packageName: "合计", cells: {} },
      staffCounts: summary.value.staffCounts || {},
      averageValues: summary.value.averageValues || {},
    },
  ];
});

const processOptions = computed(() => {
  const processMap = new Map();
  reportTables.value.forEach((table) => {
    (table.processes || []).forEach((item) => {
      if (!processMap.has(item.processName)) {
        processMap.set(item.processName, item);
      }
    });
  });
  return Array.from(processMap.values())
    .sort(
      (a, b) =>
        Number(a.sortNo ?? Number.MAX_SAFE_INTEGER) -
          Number(b.sortNo ?? Number.MAX_SAFE_INTEGER) ||
        a.processName.localeCompare(b.processName, "zh-CN"),
    )
    .map((item) => item.processName);
});

const totalPackageCount = computed(() =>
  reportTables.value.reduce((sum, table) => sum + (table.rows?.length || 0), 0),
);
const totalProcessCount = computed(() => processOptions.value.length);
const activeTableStats = computed(() => {
  const orderedProcesses = processOptions.value;
  const totals = reportTables.value.reduce(
    (result, table) => {
      const cells = table.totalRow?.cells || {};
      Object.values(cells).forEach((cell) => {
        result.outputQty += toFiniteNumber(cell?.outputQty);
        result.targetCapacity += toFiniteNumber(cell?.targetCapacity);
      });
      Object.values(table.staffCounts || {}).forEach((value) => {
        result.staffCount += toFiniteNumber(value);
      });
      return result;
    },
    {
      outputQty: 0,
      targetCapacity: 0,
      staffCount: 0,
    },
  );
  const processStats = orderedProcesses.map((processName) => {
    const processTotal = reportTables.value.reduce(
      (result, table) => {
        const cell = table.totalRow?.cells?.[processName];
        result.outputQty += toFiniteNumber(cell?.outputQty);
        result.targetCapacity += toFiniteNumber(cell?.targetCapacity);
        return result;
      },
      {
        processName,
        outputQty: 0,
        targetCapacity: 0,
      },
    );
    return {
      ...processTotal,
      rate:
        processTotal.targetCapacity > 0
          ? processTotal.outputQty / processTotal.targetCapacity
          : null,
    };
  });
  const targetProcesses = processStats.filter(
    (item) => item.targetCapacity > 0,
  );
  const lastProcess = processStats.length
    ? processStats[processStats.length - 1]
    : null;

  return {
    ...totals,
    achievementRate:
      totals.targetCapacity > 0
        ? totals.outputQty / totals.targetCapacity
        : null,
    qualifiedProcessCount: targetProcesses.filter((item) => item.rate >= 1)
      .length,
    targetProcessCount: targetProcesses.length,
    lastProcessName: lastProcess?.processName || "",
    lastProcessOutput: lastProcess?.outputQty ?? null,
  };
});

const currentShiftRange = computed(() => buildTimeRange());
const matchedShiftSelection = computed(() =>
  findMatchedShiftSelection(currentShiftRange.value),
);
const isRangeMode = computed(() => !matchedShiftSelection.value);
const isFullDayDateRange = computed(() => {
  const [startDate, endDate] = selectedCalendarRange.value || [];
  if (!startDate || !endDate) return false;
  const expected = buildFullDayRange(startDate, endDate);
  const [start, end] = shiftTimeRange.value || [];
  return start === expected.start && end === expected.end;
});
const isCalendarDayDateRange = computed(() => {
  const [startDate, endDate] = selectedCalendarRange.value || [];
  if (!startDate || !endDate) return false;
  const expected = buildCalendarDayRange(startDate, endDate);
  const [start, end] = shiftTimeRange.value || [];
  return start === expected.start && end === expected.end;
});
const activeQuickShiftType = computed(
  () =>
    matchedShiftSelection.value?.shiftType ||
    (isCalendarDayDateRange.value
      ? SHIFT_CALENDAR_DAY
      : isFullDayDateRange.value
        ? SHIFT_FULL_DAY
        : null),
);
const currentShiftText = computed(() => {
  const range = currentShiftRange.value;
  if (isCalendarDayDateRange.value) {
    const [startDate, endDate] = selectedCalendarRange.value;
    return startDate === endDate
      ? `自然日 ${startDate} (00:00~24:00)`
      : `自然日 ${startDate} 至 ${endDate} (00:00~24:00)`;
  }
  if (isFullDayDateRange.value) {
    const [startDate, endDate] = selectedCalendarRange.value;
    return startDate === endDate
      ? `班次日 ${startDate} (08:00~次日08:00)`
      : `班次日 ${range.start.slice(0, 16)} 至 ${range.end.slice(0, 16)}`;
  }
  if (matchedShiftSelection.value) {
    return `${getShiftOption(matchedShiftSelection.value.shiftType).label} ${range.start.slice(0, 16)} 至 ${range.end.slice(0, 16)}`;
  }
  return `${range.start.slice(0, 16)} 至 ${range.end.slice(0, 16)}`;
});
const currentShiftTitle = computed(() => {
  return currentShiftText.value;
});
const matrixFilterOptions = computed(() => {
  const base = [{ label: "全部", value: "all" }];
  return base.concat(productTableTabs.map((t) => ({ label: t, value: t })));
});
const summaryColumnLabel = computed(() => {
  if (isRangeMode.value) {
    return "时间段产能汇总";
  }
  return selectedShiftType.value === SHIFT_FULL_DAY ||
    selectedShiftType.value === SHIFT_CALENDAR_DAY
    ? "每天产能汇总"
    : `${getShiftOption(selectedShiftType.value).label}产能汇总`;
});
const showStaffRows = computed(
  () => !isRangeMode.value && summary.value.showStaffRows !== false,
);

function createEmptySummary() {
  return {
    reportDate: "",
    processes: [],
    rows: [],
    totalRow: { packageName: "合计", cells: {} },
    staffCounts: {},
    averageValues: {},
    tables: [],
    staffItems: [],
    showStaffRows: true,
  };
}

function getToday() {
  const now = new Date();
  return formatDate(now);
}

function formatDate(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(dateString) {
  const [year, month, day] = (dateString || getToday()).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDateTime(date) {
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${formatDate(date)} ${hour}:${minute}:${second}`;
}

function parseDateTime(dateTimeString) {
  const [datePart, timePart = "00:00:00"] = (dateTimeString || "").split(" ");
  const [year, month, day] = (datePart || getToday()).split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function getShiftOption(shiftType) {
  return (
    shiftOptions.find((item) => item.value === shiftType) || shiftOptions[0]
  );
}

function buildShiftRange(dateString, shiftType) {
  const option = getShiftOption(shiftType);
  const start = parseDate(dateString);
  start.setHours(option.startHour, 0, 0, 0);
  const endDateString = addDays(dateString, option.endOffset);
  const end = parseDate(endDateString);
  end.setHours(option.endHour, 0, 0, 0);
  return {
    option,
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

function buildTimeRange() {
  const [start, end] = shiftTimeRange.value || [];
  if (start && end && parseDateTime(end) > parseDateTime(start)) {
    return { start, end };
  }
  const fallback = buildShiftRange(
    getCurrentShiftSelection().productionDate,
    getCurrentShiftSelection().shiftType,
  );
  return fallback;
}

function findMatchedShiftSelection(range) {
  const start = parseDateTime(range.start);
  const baseDate = formatDate(start);
  const candidates = [
    { productionDate: baseDate, shiftType: SHIFT_DAY },
    { productionDate: baseDate, shiftType: SHIFT_NIGHT },
    { productionDate: baseDate, shiftType: SHIFT_FULL_DAY },
    { productionDate: baseDate, shiftType: SHIFT_CALENDAR_DAY },
    { productionDate: addDays(baseDate, -1), shiftType: SHIFT_NIGHT },
    { productionDate: addDays(baseDate, -1), shiftType: SHIFT_FULL_DAY },
    { productionDate: addDays(baseDate, -1), shiftType: SHIFT_CALENDAR_DAY },
  ];
  return (
    candidates.find((selection) => {
      const shiftRange = buildShiftRange(
        selection.productionDate,
        selection.shiftType,
      );
      return shiftRange.start === range.start && shiftRange.end === range.end;
    }) || null
  );
}

function syncShiftQuery() {
  const range = currentShiftRange.value;
  const matched = matchedShiftSelection.value;
  if (matched) {
    productionDate.value = matched.productionDate;
    selectedShiftType.value = matched.shiftType;
    queryParams.periodType = matched.shiftType;
  } else {
    queryParams.periodType = SHIFT_RANGE;
  }
  queryParams.reportDate = `${range.start},${range.end}`;
}

function getCurrentShiftSelection(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 20) {
    return { productionDate: formatDate(now), shiftType: SHIFT_NIGHT };
  }
  if (hour >= 8) {
    return { productionDate: formatDate(now), shiftType: SHIFT_DAY };
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return { productionDate: formatDate(yesterday), shiftType: SHIFT_NIGHT };
}

function getLatestCompleteShiftSelection(now = new Date()) {
  const hour = now.getHours();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (hour >= 20) {
    return { productionDate: formatDate(now), shiftType: SHIFT_DAY };
  }
  if (hour >= 8) {
    return { productionDate: formatDate(yesterday), shiftType: SHIFT_NIGHT };
  }
  return { productionDate: formatDate(yesterday), shiftType: SHIFT_DAY };
}

function applyShiftSelection(selection, shouldQuery = true) {
  productionDate.value = selection.productionDate;
  selectedShiftType.value = selection.shiftType;
  selectedCalendarRange.value = [selection.productionDate, selection.productionDate];
  const range = buildShiftRange(selection.productionDate, selection.shiftType);
  shiftTimeRange.value = [range.start, range.end];
  syncShiftQuery();
  if (shouldQuery) {
    getSummary();
  }
}

function createTargetForm() {
  return {
    id: "",
    packageName: "",
    processName: "",
    targetCapacity: 1,
    sortNo: 0,
    status: "0",
    remark: "",
  };
}

function handleQuery() {
  if (timeRangeError.value) {
    toast.add({ title: timeRangeError.value, color: "warning" });
    return;
  }
  syncShiftQuery();
  getSummary();
}

function resetQuery() {
  applyShiftSelection(getCurrentShiftSelection(), false);
  queryParams.packageName = "";
  queryParams.processName = "";
  queryParams.tableName = "";
  getSummary();
}

function getSummary() {
  syncShiftQuery();
  queryParams.tableName = "";

  // 检查是否查询大时间范围
  const range = currentShiftRange.value;
  const start = parseDateTime(range.start);
  const end = parseDateTime(range.end);
  const hoursDiff = (end - start) / (1000 * 60 * 60);

  if (hoursDiff > 24 * 7) {
    toast.add({
      title: "查询时间跨度较大，数据加载可能需要较长时间，请耐心等待...",
      color: "warning",
    });
  }

  loading.value = true;
  getProcessOutputSummary(queryParams)
    .then((res) => {
      summary.value = res.data || createEmptySummary();
    })
    .catch((err) => {
      toast.add({ title: "数据加载失败，请重试", color: "error" });
      console.error("查询失败:", err);
    })
    .finally(() => {
      loading.value = false;
    });
}

function hasTableData(table) {
  return Boolean(table.rows?.length || 0 || table.processes?.length || 0);
}

function buildTableRows(table) {
  const rows = [...(table.rows || [])];
  rows.push({
    ...(table.totalRow || { packageName: "合计", cells: {} }),
    rowType: "total",
  });
  if (!showStaffRows.value) {
    return rows;
  }
  rows.push({ packageName: "人员数量", rowType: "staff" });
  rows.push({ packageName: "人均产值", rowType: "average" });
  return rows;
}

function getCellText(row, processName, type, table) {
  const rawRow = row?.original || row;
  if (rawRow.rowType === "staff") {
    return type === "output"
      ? formatNumber(table.staffCounts?.[processName])
      : "";
  }
  if (rawRow.rowType === "average") {
    return type === "output"
      ? formatNumber(table.averageValues?.[processName])
      : "";
  }
  const cell = rawRow.cells?.[processName];
  if (!cell) {
    return "";
  }
  if (type === "output") {
    return formatNumber(cell.outputQty);
  }
  if (type === "target") {
    return formatNumber(cell.targetCapacity);
  }
  return formatPercent(cell.achievementRate);
}

function getRateClass(row, processName) {
  const rawRow = row?.original || row;
  const rate = rawRow.cells?.[processName]?.achievementRate;
  if (rate === null || rate === undefined || rate === "") {
    return "";
  }
  return Number(rate) >= 1 ? "rate-good" : "rate-low";
}

function getSummaryRateClass(rate) {
  if (rate === null || rate === undefined || rate === "") {
    return "";
  }
  return Number(rate) >= 1 ? "summary-rate-good" : "summary-rate-low";
}

function getRowClassName({ row }) {
  const rawRow = row?.original || row;
  return rawRow.rowType ? `summary-row-${rawRow.rowType}` : "";
}

function getTargetRowClassName({ row }) {
  const rawRow = row?.original || row;
  if (rawRow.rowType === "tableTotal") {
    return "target-row-total";
  }
  return "";
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return value;
  }
  return num.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  return `${(num * 100).toFixed(2)}%`;
}

function toDailyTarget(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Number((num / 30).toFixed(4));
}

function toMonthlyTarget(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Number((num * 30).toFixed(4));
}

function openTargetDialog() {
  targetDialog.open = true;
  matrixFilterTable.value = "all";
  resetTargetQuery();
  getTargetList();
}

function resetTargetQuery() {
  targetQuery.pageNum = DEFAULT_PAGE_NUM;
  targetQuery.pageSize = 500;
  targetQuery.packageName = "";
  targetQuery.processName = "";
}

function reloadTargetMatrix() {
  resetTargetQuery();
  getTargetList();
}

function getTargetList() {
  targetDialog.loading = true;
  listProcessOutputTarget(targetQuery)
    .then((res) => {
      targetList.value = res.rows || [];
      prepareTargetMatrix();
    })
    .finally(() => {
      targetDialog.loading = false;
    });
}

function prepareTargetMatrix() {
  const targetMap = new Map();

  // 只取第一个工序的目标值作为封装的统一目标
  targetList.value.forEach((item) => {
    const key = item.packageName;
    if (!targetMap.has(key)) {
      targetMap.set(key, item);
    }
  });

  const matrixRows = [];
  buildTargetMatrixTables().forEach((table) => {
    if (!table.tableName) {
      return;
    }
    if (
      matrixFilterTable.value !== "all" &&
      matrixFilterTable.value !== table.tableName
    ) {
      return;
    }
    matrixRows.push(
      createSimplifiedTargetMatrixRow(
        `${table.tableName}合计目标`,
        table.tableName,
        "tableTotal",
        targetMap,
        table.rows,
      ),
    );
    (table.rows || []).forEach((row) => {
      if (row.packageName) {
        matrixRows.push(
          createSimplifiedTargetMatrixRow(
            row.packageName,
            row.packageName,
            "package",
            targetMap,
            null,
          ),
        );
      }
    });
  });
  targetMatrixRows.value = matrixRows;
}

function createSimplifiedTargetMatrixRow(
  displayName,
  packageName,
  rowType,
  targetMap,
  childRows,
) {
  const target = targetMap.get(packageName) || {};
  let targetCapacity = toDailyTarget(target.targetCapacity);
  let calculatedValue = null;

  // 计算分类合计
  if (rowType === "tableTotal" && childRows) {
    let sum = 0;
    let hasAny = false;
    childRows.forEach((child) => {
      const childTarget = targetMap.get(child.packageName);
      if (
        childTarget &&
        childTarget.targetCapacity !== null &&
        childTarget.targetCapacity !== undefined
      ) {
        let val = toDailyTarget(childTarget.targetCapacity);
        sum += val;
        hasAny = true;
      }
    });
    if (hasAny) {
      calculatedValue = sum;
    }
  }

  return {
    displayName,
    packageName,
    rowType,
    targetCapacity,
    calculatedValue,
    id: target.id || "",
    status: target.status || "0",
    sortNo: target.sortNo ?? 10,
    remark: target.remark || "",
  };
}

function buildTargetMatrixTables() {
  const tableMap = new Map();
  targetProductTableDefinitions.forEach((definition) => {
    tableMap.set(definition.tableName, {
      tableName: definition.tableName,
      rows: definition.packages.map((packageName) => ({ packageName })),
    });
  });
  reportTables.value.forEach((table) => {
    if (!table.tableName) {
      return;
    }
    const targetTable = tableMap.get(table.tableName) || {
      tableName: table.tableName,
      rows: [],
    };
    const packageSet = new Set(targetTable.rows.map((row) => row.packageName));
    (table.rows || []).forEach((row) => {
      if (row.packageName && !packageSet.has(row.packageName)) {
        targetTable.rows.push({ packageName: row.packageName });
        packageSet.add(row.packageName);
      }
    });
    tableMap.set(table.tableName, targetTable);
  });
  targetList.value.forEach((target) => {
    const tableName = getTargetTableName(target.packageName);
    if (!tableName) {
      return;
    }
    const targetTable = tableMap.get(tableName) || { tableName, rows: [] };
    const packageSet = new Set(targetTable.rows.map((row) => row.packageName));
    if (
      target.packageName &&
      target.packageName !== tableName &&
      !packageSet.has(target.packageName)
    ) {
      targetTable.rows.push({ packageName: target.packageName });
      packageSet.add(target.packageName);
    }
    tableMap.set(tableName, targetTable);
  });
  return targetProductTableDefinitions
    .map((definition) => tableMap.get(definition.tableName))
    .filter(Boolean);
}

function getTargetTableName(packageName) {
  if (!packageName) {
    return "";
  }
  const tableDefinition = targetProductTableDefinitions.find(
    (definition) =>
      definition.tableName === packageName ||
      definition.packages.includes(packageName),
  );
  return tableDefinition?.tableName || "";
}

function getTargetProcesses(packageName) {
  const tableName = getTargetTableName(packageName);
  const tableDefinition = targetProductTableDefinitions.find(
    (definition) => definition.tableName === tableName,
  );
  return tableDefinition?.processes || [];
}

function submitTargetMatrix() {
  // 第一步：收集所有要更新的封装（包括要删除的）
  const packagesToUpdate = [];
  const packagesToDelete = [];

  targetMatrixRows.value.forEach((row) => {
    // 跳过分类合计行（如果有子封装目标）
    if (row.rowType === "tableTotal" && row.calculatedValue !== null) {
      return;
    }

    let value = row.targetCapacity;
    const hasValue = value !== null && value !== undefined && value !== "";

    if (hasValue && Number(value) > 0) {
      packagesToUpdate.push({
        packageName: row.packageName,
        targetCapacity: toMonthlyTarget(value),
        remark: row.remark || "",
      });
    } else {
      // 值为空，但原来有目标记录，需要删除
      const hasOldTarget = targetList.value.some(
        (item) => item.packageName === row.packageName,
      );
      if (hasOldTarget) {
        packagesToDelete.push(row.packageName);
      }
    }
  });

  if (!packagesToUpdate.length && !packagesToDelete.length) {
    toast.add({ title: "没有需要保存的目标产能", color: "warning" });
    return;
  }

  // 第二步：删除所有相关封装的旧记录
  const deletePromises = [];
  const allPackages = [
    ...packagesToUpdate.map((p) => p.packageName),
    ...packagesToDelete,
  ];

  allPackages.forEach((packageName) => {
    const idsToDelete = targetList.value
      .filter((item) => item.packageName === packageName && item.id)
      .map((item) => item.id);

    idsToDelete.forEach((id) => {
      deletePromises.push(delProcessOutputTarget(id));
    });
  });

  targetDialog.saving = true;

  // 第三步：等待所有删除完成后，只为有值的封装插入新记录
  Promise.all(deletePromises)
    .then(() => {
      const insertPromises = [];
      packagesToUpdate.forEach((pkg) => {
        getTargetProcesses(pkg.packageName).forEach((processName, index) => {
          const payload = {
            packageName: pkg.packageName,
            processName,
            targetCapacity: pkg.targetCapacity,
            sortNo: (index + 1) * 10,
            status: "0",
            remark: pkg.remark,
          };
          insertPromises.push(addProcessOutputTarget(payload));
        });
      });

      return Promise.all(insertPromises);
    })
    .then(() => {
      toast.add({ title: "批量保存成功", color: "success" });
      getTargetList();
      getSummary();
    })
    .catch((err) => {
      console.error("保存失败:", err);
      toast.add({ title: "保存失败，请重试", color: "error" });
    })
    .finally(() => {
      targetDialog.saving = false;
    });
}

function handleExport() {
  syncShiftQuery();
  const [startDate, endDate] = selectedCalendarRange.value || [];
  let filePeriod;
  if (!isRangeMode.value) {
    filePeriod = `${productionDate.value}_${getShiftOption(selectedShiftType.value).fileLabel}`;
  } else if (isCalendarDayDateRange.value) {
    filePeriod = `${startDate}_${endDate}_自然日`;
  } else if (isFullDayDateRange.value) {
    filePeriod = `${startDate}_${endDate}_班次日`;
  } else {
    filePeriod = `${currentShiftRange.value.start.slice(0, 16).replace(/[-: ]/g, "")}_${currentShiftRange.value.end.slice(0, 16).replace(/[-: ]/g, "")}`;
  }
  proxy.download(
    "tk_custom/processOutputReport/export",
    queryParams,
    `${filePeriod}_综合工序产量.xlsx`,
  );
}

function handleMatrixFilterChange() {
  prepareTargetMatrix();
}

function isRateLow(row, processName) {
  const rawRow = row?.original || row;
  const cell = rawRow.cells?.[processName];
  if (
    !cell ||
    cell.achievementRate === null ||
    cell.achievementRate === undefined ||
    cell.achievementRate === ""
  ) {
    return false;
  }
  return Number(cell.achievementRate) < 1;
}

function getDeltaTooltipText(row, processName) {
  const rawRow = row?.original || row;
  const cell = rawRow.cells?.[processName];
  if (!cell) {
    return "";
  }
  const output = Number(cell.outputQty || 0);
  const target = Number(cell.targetCapacity || 0);
  if (target > output) {
    const diff = (target - output).toLocaleString("zh-CN", {
      maximumFractionDigits: 2,
    });
    return `距离目标还差: ${diff} 件`;
  }
  return "";
}

function hasCellTarget(row, processName) {
  const rawRow = row?.original || row;
  if (rawRow.rowType === "staff" || rawRow.rowType === "average") {
    return false;
  }
  const cell = rawRow.cells?.[processName];
  return (
    cell &&
    cell.targetCapacity !== null &&
    cell.targetCapacity !== undefined &&
    cell.targetCapacity !== ""
  );
}

onMounted(() => {
  getSummary();
});
</script>
