<template>
  <div
    class="absolute inset-0 overflow-y-auto p-6 bg-neutral-50 dark:bg-neutral-950"
  >
    <section class="flex flex-wrap items-end justify-between gap-5 mb-6">
      <div class="flex-1 min-w-[300px]">
        <div
          class="inline-flex items-center text-[11px] font-semibold tracking-wider text-blue-500 bg-blue-500/10 border border-blue-500/15 px-2.5 py-1 rounded-full mb-2"
        >
          <span
            class="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5 animate-pulse"
          ></span>
          模压生产部
        </div>
        <h1
          class="text-2xl font-bold text-neutral-800 dark:text-neutral-100 tracking-tight mb-1"
        >
          假片重量月度录入
        </h1>
        <p
          class="text-xs text-neutral-500 dark:text-neutral-400 max-w-[600px] leading-relaxed"
        >
          空片单重固定展示，仅需录入有黑胶重量与条数。系统将自动根据胶体类型计算合计与小计。
        </p>
      </div>
      <div class="flex flex-wrap gap-4">
        <!-- Month Card -->
        <div
          class="flex items-center gap-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-3 px-4.5 min-w-[190px] shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-200"
        >
          <div
            class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 bg-blue-500/10 text-blue-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-5 h-5"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <div class="flex flex-col gap-0.5">
            <span
              class="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium"
              >当前录入月份</span
            >
            <strong
              class="text-lg font-bold text-neutral-900 dark:text-white"
              >{{ displayMonth }}</strong
            >
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500"
              >录入周期内</span
            >
          </div>
        </div>

        <!-- Total Weight Card -->
        <div
          class="flex items-center gap-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-3 px-4.5 min-w-[190px] shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-200"
        >
          <div
            class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 bg-amber-500/10 text-amber-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-5 h-5"
            >
              <path
                d="M3 6h18M12 2v20M6 12h12M6 6c0 4.5-2 6-2 6M18 6c0 4.5 2 6 2 6M6 12a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM18 12a3 3 0 1 0 0 6 3 3 0 1 0 0-6z"
              ></path>
            </svg>
          </div>
          <div class="flex flex-col gap-0.5">
            <span
              class="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium"
              >有黑胶合计</span
            >
            <strong class="text-lg font-bold text-amber-500"
              >{{ formatNumber(summary.weightValue) || "0"
              }}<span class="text-xs text-neutral-400 ml-0.5">g</span></strong
            >
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500"
              >实测有黑胶累计重量</span
            >
          </div>
        </div>

        <!-- Fill Progress Card -->
        <div
          class="flex items-center gap-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-3 px-4.5 min-w-[210px] shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-200"
        >
          <div
            class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 bg-emerald-500/10 text-emerald-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-5 h-5"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="flex flex-col gap-0.5 flex-1">
            <span
              class="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium"
              >录入完成度</span
            >
            <div class="flex items-center justify-between w-full">
              <strong class="text-lg font-bold text-neutral-900 dark:text-white"
                >{{ filledCellCount }} / {{ editableCellCount }}</strong
              >
              <span
                class="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-bold"
                >{{
                  editableCellCount
                    ? Math.round((filledCellCount / editableCellCount) * 100)
                    : 0
                }}%</span
              >
            </div>
            <div
              class="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mt-1.5 overflow-hidden"
            >
              <div
                class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                :style="{
                  width:
                    (editableCellCount
                      ? (filledCellCount / editableCellCount) * 100
                      : 0) + '%',
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      class="flex flex-wrap items-center justify-between gap-4 p-4 px-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl mb-5 shadow-sm"
    >
      <div class="flex flex-wrap items-center gap-5">
        <div class="flex items-center gap-2.5">
          <span
            class="text-sm font-semibold text-neutral-800 dark:text-neutral-200 whitespace-nowrap"
            >月份检索</span
          >
          <UPopover v-model:open="popoverOpen">
            <template #default="{ open }">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar"
                class="w-44 justify-between font-normal text-neutral-700 dark:text-neutral-300"
                :class="{ 'border-blue-500 ring-1 ring-blue-500/20': open }"
              >
                {{ formatMonthText(queryParams.recordMonth) }}
              </UButton>
            </template>
            <template #content>
              <div
                class="p-4 w-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg"
              >
                <!-- 年份切换 -->
                <div class="flex items-center justify-between mb-3">
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-chevron-left"
                    size="xs"
                    @click="changeYear(-1)"
                  />
                  <span
                    class="text-sm font-bold text-neutral-800 dark:text-neutral-200"
                    >{{ currentSelectYear }}年</span
                  >
                  <UButton
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-chevron-right"
                    size="xs"
                    @click="changeYear(1)"
                  />
                </div>
                <!-- 12个月网格 -->
                <div class="grid grid-cols-4 gap-2">
                  <UButton
                    v-for="m in 12"
                    :key="m"
                    :variant="isCurrentMonth(m) ? 'solid' : 'ghost'"
                    :color="isCurrentMonth(m) ? 'primary' : 'neutral'"
                    size="sm"
                    class="justify-center"
                    @click="selectMonth(m)"
                  >
                    {{ m }}月
                  </UButton>
                </div>
                <!-- 底部快捷键 -->
                <div
                  class="flex justify-between border-t border-neutral-100 dark:border-neutral-800 mt-3 pt-2 text-xs"
                >
                  <UButton
                    size="xs"
                    variant="link"
                    color="neutral"
                    @click="setToCurrentMonth"
                    >本月</UButton>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
        <div
          class="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-blue-500/5 border border-dashed border-blue-500/20 px-3 py-1.5 rounded-lg"
        >
          <svg
            class="shrink-0 text-blue-500"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>只录入有黑胶的重量与条数，空片按固定单重展示。</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          @click="resetQuery"
          >本月</UButton
        >
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-check"
          @click="saveMonthTable"
          >保存</UButton
        >
        <UButton
          color="warning"
          variant="outline"
          icon="i-lucide-download"
          @click="handleExport"
          >导出</UButton
        >
      </div>
    </section>
    <section
      class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm"
    >
      <UTable
        :loading="loading"
        :data="tableRows"
        :columns="dummyPieceColumns"
        class="w-full"
      >
        <template #emptyCopper-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <weight-cell
              v-model="row.original.emptyCopper"
              :enabled="row.original.enabled?.emptyCopper"
              readonly
            />
          </div>
        </template>
        <template #emptyIron-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <weight-cell
              v-model="row.original.emptyIron"
              :enabled="row.original.enabled?.emptyIron"
              readonly
            />
          </div>
        </template>
        <template #glueCopper-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <weight-cell
              v-model="row.original.glueCopper"
              :enabled="row.original.enabled?.glueCopper"
            />
          </div>
        </template>
        <template #glueIron-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <weight-cell
              v-model="row.original.glueIron"
              :enabled="row.original.enabled?.glueIron"
            />
          </div>
        </template>
        <template #rowTotal-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <strong class="font-bold text-neutral-800 dark:text-neutral-200">{{
              formatNumber(rowTotal(row.original))
            }}</strong>
          </div>
        </template>
        <template #pieceCount-cell="{ row }">
          <div class="flex justify-center items-center w-full">
            <count-cell v-model="row.original.pieceCount" />
          </div>
        </template>
      </UTable>
    </section>
  </div>
</template>

<script setup name="DummyPiece">
definePageMeta({ title: "假片重量月度录入", permission: "tk_custom:dummyPiece:list" });

import { formatNumber } from "@ctk-system/shared";
const toast = useToast();

const { proxy } = getCurrentInstance();

const loading = ref(false);
const monthlyList = ref([]);
const weightList = ref([]);
const tableRows = ref([]);
const tableSnapshot = ref("");

const comboColumns = [
  { key: "emptyCopper", pieceType: "空片", material: "铜", fixed: true },
  { key: "emptyIron", pieceType: "空片", material: "铁", fixed: true },
  { key: "glueCopper", pieceType: "有黑胶", material: "铜" },
  { key: "glueIron", pieceType: "有黑胶", material: "铁" },
];

const dummyPieceColumns = [
  { accessorKey: "packageName", header: "产品型号/封装" },
  {
    accessorKey: "emptyCopper",
    header: "空片-铜(g)",
    cell: "emptyCopper",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
  {
    accessorKey: "emptyIron",
    header: "空片-铁(g)",
    cell: "emptyIron",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
  {
    accessorKey: "glueCopper",
    header: "有黑胶-铜(g)",
    cell: "glueCopper",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
  {
    accessorKey: "glueIron",
    header: "有黑胶-铁(g)",
    cell: "glueIron",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
  {
    accessorKey: "rowTotal",
    header: "小计(g)",
    cell: "rowTotal",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
  {
    accessorKey: "pieceCount",
    header: "条数",
    cell: "pieceCount",
    meta: {
      class: {
        td: "text-center",
        th: "text-center [text-align:center] [&>span]:justify-center",
      },
    },
  },
];

const packageOrder = [
  "SOD-323",
  "SOD-123",
  "SOT-23/6R",
  "SOT-23/26",
  "SOD-523",
  "SOT-23/27R",
  "TO-252",
  "DFN",
  "PDFN/5*6",
  "PDFN/3*3",
];

const WeightCell = defineComponent({
  props: {
    modelValue: { type: [Number, String, null], default: null },
    enabled: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const onFocus = (e) => {
      if (e.target && typeof e.target.select === "function") {
        setTimeout(() => e.target.select(), 0);
      }
    };
    const onBlur = (e) => {
      emit("update:modelValue", normalizeInputValue(e.target.value));
    };
    return () =>
      h(
        "div",
        {
          class: [
            "w-full max-w-[120px] h-8 rounded-lg flex items-center justify-center text-xs font-semibold border transition-all duration-200 mx-auto",
            props.enabled
              ? props.readonly
                ? "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
                : "bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20"
              : "bg-neutral-100/50 dark:bg-neutral-900/50 border-transparent text-neutral-300 dark:text-neutral-700",
          ],
        },
        [
          props.enabled && !props.readonly
            ? h("input", {
                class:
                  "w-full h-full bg-transparent border-none text-center focus:outline-none text-neutral-800 dark:text-neutral-200",
                value: formatNumber(props.modelValue),
                placeholder: "0.0000",
                inputmode: "decimal",
                autocomplete: "off",
                spellcheck: "false",
                onInput: (event) =>
                  emit(
                    "update:modelValue",
                    normalizeInputValue(event.target.value),
                  ),
                onFocus,
                onBlur,
              })
            : h(
                "span",
                {
                  class: props.enabled
                    ? "text-neutral-700 dark:text-neutral-300 font-bold"
                    : "text-neutral-300 dark:text-neutral-700",
                },
                props.enabled ? formatNumber(props.modelValue) || "0" : "—",
              ),
        ],
      );
  },
});

const CountCell = defineComponent({
  props: {
    modelValue: { type: [Number, String, null], default: null },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const onFocus = (e) => {
      if (e.target && typeof e.target.select === "function") {
        setTimeout(() => e.target.select(), 0);
      }
    };
    return () =>
      h(
        "div",
        {
          class:
            "w-full max-w-[80px] h-8 rounded-lg flex items-center justify-center bg-purple-500/5 focus-within:bg-purple-500/10 border border-purple-500/15 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all duration-200 mx-auto",
        },
        [
          h("input", {
            class:
              "w-full h-full bg-transparent border-none text-center focus:outline-none text-purple-600 dark:text-purple-400 font-semibold",
            value: formatNumber(props.modelValue),
            placeholder: "0",
            inputmode: "numeric",
            autocomplete: "off",
            spellcheck: "false",
            onInput: (event) =>
              emit(
                "update:modelValue",
                normalizeCountValue(event.target.value),
              ),
            onFocus,
            onBlur: (event) =>
              emit(
                "update:modelValue",
                normalizeCountValue(event.target.value),
              ),
          }),
        ],
      );
  },
});

const data = reactive({
  queryParams: {
    recordMonth: currentMonth(),
  },
});

const { queryParams } = toRefs(data);

const popoverOpen = ref(false);
const currentSelectYear = ref(new Date().getFullYear());

watch(
  () => queryParams.value.recordMonth,
  (newVal) => {
    if (newVal) {
      const year = parseInt(newVal.split("-")[0]);
      if (!isNaN(year)) {
        currentSelectYear.value = year;
      }
    }
  },
  { immediate: true },
);

function formatMonthText(monthStr) {
  if (!monthStr) return "选择月份";
  const parts = monthStr.split("-");
  return `${parts[0]}年${parts[1]}月`;
}

function changeYear(delta) {
  currentSelectYear.value += delta;
}

function isCurrentMonth(m) {
  const monthFormatted = String(m).padStart(2, "0");
  return (
    queryParams.value.recordMonth ===
    `${currentSelectYear.value}-${monthFormatted}`
  );
}

function selectMonth(m) {
  if (!confirmDiscardIfDirty()) return;
  const monthFormatted = String(m).padStart(2, "0");
  queryParams.value.recordMonth = `${currentSelectYear.value}-${monthFormatted}`;
  popoverOpen.value = false;
  handleQuery();
}

function setToCurrentMonth() {
  if (!confirmDiscardIfDirty()) {
    popoverOpen.value = false;
    return;
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  queryParams.value.recordMonth = `${y}-${m}`;
  popoverOpen.value = false;
  handleQuery();
}

function clearMonth() {
  // 已下线：月度录入必须带月份，不允许查全月（全月混叠显示且无法保存）
  queryParams.value.recordMonth = currentMonth();
  popoverOpen.value = false;
  handleQuery();
}

const summary = computed(() => {
  return tableRows.value.reduce(
    (acc, row) => {
      acc.weightValue += rowGlueTotal(row);
      return acc;
    },
    { weightValue: 0 },
  );
});

const displayMonth = computed(() => queryParams.value.recordMonth || "—");

const editableCellCount = computed(() => {
  return tableRows.value.reduce((sum, row) => {
    return (
      sum +
      comboColumns.filter((col) => row.enabled[col.key] && !col.fixed).length
    );
  }, 0);
});

const filledCellCount = computed(() => {
  return tableRows.value.reduce((sum, row) => {
    return (
      sum +
      comboColumns.filter(
        (col) =>
          row.enabled[col.key] &&
          !col.fixed &&
          row[col.key] !== null &&
          row[col.key] !== undefined &&
          row[col.key] !== "",
      ).length
    );
  }, 0);
});

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function normalizeInputValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  let cleaned = String(value).replace(/[^\d.]/g, "");
  // 只保留第一个小数点
  const dotIndex = cleaned.indexOf(".");
  if (dotIndex !== -1) {
    cleaned =
      cleaned.slice(0, dotIndex + 1) +
      cleaned.slice(dotIndex + 1).replace(/\./g, "");
    // 重量最多4位小数
    const [intPart, decPart = ""] = cleaned.split(".");
    cleaned = intPart + "." + decPart.slice(0, 4);
  }
  if (cleaned === "" || cleaned === ".") {
    return null;
  }
  return cleaned;
}

function normalizeCountValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const cleaned = String(value).replace(/[^\d]/g, "");
  if (cleaned === "") {
    return null;
  }
  return cleaned;
}

function getList() {
  loading.value = true;
  listDummyPieceMonthly({
    recordMonth: queryParams.value.recordMonth,
    pageNum: 1,
    pageSize: 500,
  })
    .then((response) => {
      monthlyList.value = response.rows || [];
      buildTableRows();
    })
    .finally(() => {
      loading.value = false;
    });
}

function getWeights() {
  return listDummyPieceWeight({ status: "0" }).then((response) => {
    weightList.value = response.data || [];
  });
}

function handleQuery() {
  if (!queryParams.value.recordMonth) {
    queryParams.value.recordMonth = currentMonth();
  }
  getList();
}

function resetQuery() {
  if (!confirmDiscardIfDirty()) return;
  queryParams.value.recordMonth = currentMonth();
  handleQuery();
}

function handleExport() {
  proxy.download(
    "tk_custom/dummyPiece/monthly/export",
    queryParams.value,
    `${queryParams.value.recordMonth || "全部"}_假片重量月度录入.xlsx`,
  );
}

function buildTableRows() {
  const monthMap = new Map();
  monthlyList.value.forEach((item) => {
    monthMap.set(
      recordKey(item.packageName, item.pieceType, item.material),
      item,
    );
  });
  const weightMap = new Map();
  weightList.value.forEach((item) => {
    weightMap.set(
      recordKey(item.packageName, item.pieceType, item.material),
      item,
    );
  });

  const packages = [
    ...new Set(
      weightList.value.map((item) => item.packageName).filter(Boolean),
    ),
  ].sort((a, b) => packageSortIndex(a) - packageSortIndex(b));

  tableRows.value = packages.map((packageName) => {
    const row = {
      packageName,
      enabled: {},
      emptyCopper: null,
      emptyIron: null,
      glueCopper: null,
      glueIron: null,
      pieceCount: null,
    };
    comboColumns.forEach((col) => {
      const key = recordKey(packageName, col.pieceType, col.material);
      const enabled = weightMap.has(key);
      const record = monthMap.get(key);
      const baseWeight = weightMap.get(key);
      row.enabled[col.key] = enabled;
      if (col.fixed && baseWeight) {
        row[col.key] = Number(baseWeight.unitWeight);
      } else {
        row[col.key] = record ? Number(record.weightValue) : null;
      }
      if (
        record &&
        !col.fixed &&
        row.pieceCount === null &&
        record.pieceCount !== null &&
        record.pieceCount !== undefined
      ) {
        row.pieceCount = Number(record.pieceCount);
      }
    });
    return row;
  });
  tableSnapshot.value = JSON.stringify(
    tableRows.value.map((row) => [row.glueCopper, row.glueIron, row.pieceCount]),
  );
}

function tableDirty() {
  if (!tableSnapshot.value) return false;
  return (
    tableSnapshot.value !==
    JSON.stringify(
      tableRows.value.map((row) => [row.glueCopper, row.glueIron, row.pieceCount]),
    )
  );
}

function confirmDiscardIfDirty() {
  if (!tableDirty()) return true;
  return confirm("当前月份有未保存的修改，切换将丢失，继续吗？");
}

function saveMonthTable() {
  if (!queryParams.value.recordMonth) {
    toast.add({ title: "请先选择月份", color: "warning" });
    return;
  }
  const payload = [];
  for (const row of tableRows.value) {
    // 条数按行：只存有黑胶组合，空片固定值不存月度表
    const glueCols = comboColumns.filter(
      (col) => !col.fixed && row.enabled[col.key],
    );
    const filledGlue = glueCols.filter(
      (col) =>
        row[col.key] !== null &&
        row[col.key] !== undefined &&
        row[col.key] !== "",
    );
    const countFilled =
      row.pieceCount !== null &&
      row.pieceCount !== undefined &&
      row.pieceCount !== "";
    if (countFilled && filledGlue.length === 0) {
      toast.add({
        title: `${row.packageName}只填了条数，请先填写有黑胶重量`,
        color: "warning",
      });
      return;
    }
    filledGlue.forEach((col) => {
      payload.push({
        recordMonth: queryParams.value.recordMonth,
        packageName: row.packageName,
        pieceType: col.pieceType,
        material: col.material,
        weightValue: row[col.key],
        // 同一行条数同步到该行所有已填重量的有黑胶记录
        pieceCount: row.pieceCount,
      });
    });
  }
  if (!payload.length) {
    toast.add({ title: "没有可保存的数据", color: "warning" });
    return;
  }
  batchSaveDummyPieceMonthly(payload)
    .then(() => {
      toast.add({ title: "本月表格已保存", color: "success" });
      getList();
    })
    .catch((error) => {
      toast.add({
        title: error?.message || "保存失败，请重试",
        color: "error",
      });
    });
}

function rowTotal(row) {
  return rowGlueTotal(row);
}

function rowGlueTotal(row) {
  return comboColumns.reduce((sum, col) => {
    if (col.fixed) {
      return sum;
    }
    const n = Number(row[col.key] || 0);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

function recordKey(packageName, pieceType, material) {
  return `${packageName}||${pieceType}||${material}`;
}

function packageSortIndex(packageName) {
  const index = packageOrder.indexOf(packageName);
  return index === -1
    ? packageOrder.length + packageName.localeCompare("ZZZ")
    : index;
}

onMounted(() => {
  getWeights()
    .catch(() => {
      toast.add({ title: "单重资料加载失败，表格可能不完整", color: "warning" });
    })
    .then(() => {
      getList();
    });
});
</script>
