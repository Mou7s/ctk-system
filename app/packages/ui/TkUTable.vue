<template>
  <UTable
    ref="tableRef"
    v-model:row-selection="selectionModel"
    :data="data"
    :columns="columns"
    :loading="loading"
    :sticky="sticky"
    :ui="mergedUi"
    v-bind="$attrs"
    :on-select="interactive ? handleSelect : undefined"
    @dblclick="handleDoubleClick"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="slotData">
      <slot :name="slotName" v-bind="slotData" />
    </template>
  </UTable>
</template>

<script setup>
// vue 的 API 显式 import：Nuxt 里本来就有自动导入，显式写上以后
// 没有 Nuxt 自动导入的环境（vitest / 本地预览 harness）也能跑
import { computed, ref, watch } from "vue";
// 行交互的纯函数放独立文件，便于单测，也避免浏览器里两套「双击取哪一行」的算法
import { isRepeatClick, resolveRowFromDoubleClick } from "./tkTableInteraction.js";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  data: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  // 与 UTable 对齐：支持 true / 'header' / 'footer'（主题里的 sticky 变体）
  sticky: { type: [Boolean, String], default: true },
  interactive: { type: Boolean, default: true },
  // 跳过下面这份项目默认主题：th/td 字号、内边距、分隔线、表头底色全部回到 Nuxt UI 官方原样，
  // 调用方 ui 里显式传的类照旧叠加。只给明确要「官方观感」的地方用（如在制明细抽屉）。
  stockTheme: { type: Boolean, default: false },
  rowSelection: { type: Object, default: undefined },
  ui: { type: Object, default: () => ({}) },
  wrapperClass: { type: [String, Array, Object], default: "" },
  ignoreSelector: {
    type: String,
    default:
      'button, a, input, textarea, select, img, [role="checkbox"], [data-row-interaction="ignore"]',
  },
});

const emit = defineEmits([
  "update:rowSelection",
  "selection-change",
  "row-click",
  "row-open",
  "row-dblclick",
  "select",
]);

const tableRef = ref();
const internalSelection = ref({});
let lastClickedIndex = null;
// 记下同一次交互里单击命中的行与它所在的 tr：双击定位行用它，不再靠 DOM 行序号
let lastClickedRow = null;
let lastClickedTr = null;

// 数据换了，上一轮记录的行/tr 就作废（tr 元素会被 Vue 复用给别的行）
watch(
  () => props.data,
  () => {
    lastClickedIndex = null;
    lastClickedRow = null;
    lastClickedTr = null;
  },
);

// 使用 Nuxt UI 语义色；hover 写在 tbody 选择器上，避免每个 td 单独 transition/color-mix（宽表会卡）
const defaultUi = {
  root: "min-h-0 overflow-auto bg-default [&>table]:min-w-full",
  base: "min-w-full border-separate border-spacing-0 bg-default",
  td: "border-b border-default/50 bg-default px-3 py-2.5 text-[13px] text-default whitespace-nowrap align-middle",
  th: "border-b border-default !bg-default px-3 py-2.5 text-left text-xs font-bold text-highlighted whitespace-nowrap",
  tr: "",
  tbody:
    "[&>tr:hover>td]:bg-elevated/50 [&>tr[data-selected=true]>td]:bg-elevated/50",
  thead: "!bg-default",
  empty: "py-8 text-center text-sm text-muted",
  loading: "py-8 text-center",
};

function uiClass(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.flat(Infinity).filter(Boolean).join(" ");
  if (typeof value === "object" && value.base) return uiClass(value.base);
  return "";
}

function joinUi(...parts) {
  return parts.flat(Infinity).map(uiClass).filter(Boolean).join(" ");
}

const mergedUi = computed(() => {
  const baseUi = props.stockTheme ? {} : defaultUi;
  const customUi = props.ui || {};
  const merged = {};
  for (const key of Object.keys(defaultUi)) {
    merged[key] = joinUi(baseUi[key], customUi[key]);
  }
  for (const key of Object.keys(customUi)) {
    if (!(key in merged)) merged[key] = uiClass(customUi[key]);
  }
  merged.tr = joinUi(
    baseUi.tr,
    props.interactive ? "cursor-pointer" : "",
    customUi.tr,
  );
  merged.td = joinUi(baseUi.td, customUi.td);
  merged.tbody = joinUi(baseUi.tbody, customUi.tbody);
  merged.root = joinUi(baseUi.root, props.wrapperClass, customUi.root);
  return merged;
});

function visibleRows() {
  return (
    tableRef.value?.tableApi?.getRowModel?.().rows ||
    props.data.map((original, index) => ({
      id: String(index),
      index,
      original,
    }))
  );
}

function selectedOriginals(selection) {
  const selectedIds = new Set(
    Object.entries(selection || {})
      .filter(([, selected]) => selected)
      .map(([id]) => String(id)),
  );
  return visibleRows()
    .filter((row) => selectedIds.has(String(row.id)))
    .map((row) => row.original);
}

function updateSelection(selection) {
  const nextSelection = { ...selection };
  internalSelection.value = nextSelection;
  emit("update:rowSelection", nextSelection);
  emit("selection-change", selectedOriginals(nextSelection));
}

const selectionModel = computed({
  get: () => props.rowSelection ?? internalSelection.value,
  set: updateSelection,
});

function shouldIgnoreEvent(event) {
  return !props.interactive || event?.target?.closest?.(props.ignoreSelector);
}

function handleSelect(event, row) {
  // 双击的第二下 click 交给 dblclick：否则会先选中→再取消→再选中，事件也重复发一遍
  if (isRepeatClick(event)) return;

  emit("select", event, row);
  if (shouldIgnoreEvent(event) || !row) return;

  const rowKey = String(row.id);
  if (event?.shiftKey && lastClickedIndex !== null) {
    const start = Math.min(lastClickedIndex, row.index);
    const end = Math.max(lastClickedIndex, row.index);
    const nextSelection = { ...selectionModel.value };
    for (const item of visibleRows()) {
      if (item.index >= start && item.index <= end) {
        nextSelection[String(item.id)] = true;
      }
    }
    updateSelection(nextSelection);
  } else {
    const selectedKeys = Object.keys(selectionModel.value || {}).filter(
      (key) => selectionModel.value[key],
    );
    updateSelection(
      selectedKeys.length === 1 && selectedKeys[0] === rowKey
        ? {}
        : { [rowKey]: true },
    );
  }

  lastClickedIndex = row.index;
  lastClickedRow = row;
  lastClickedTr = event?.currentTarget ?? null;
  emit("row-click", row.original, row, event);
}

function handleDoubleClick(event) {
  if (shouldIgnoreEvent(event)) return;
  const tableRow = event.target?.closest?.("tbody tr");
  if (!tableRow) return;
  const row = resolveRowFromDoubleClick({
    recordedRow: lastClickedRow,
    recordedTr: lastClickedTr,
    tr: tableRow,
    rows: visibleRows(),
    // 兜底路径才用：展开行/虚拟滚动下 DOM 序号与行模型不一致
    domIndex: Array.from(tableRow.parentElement?.children || []).indexOf(
      tableRow,
    ),
  });
  if (!row) return;

  updateSelection({ [String(row.id)]: true });
  lastClickedIndex = row.index;
  emit("row-open", row.original, row, event);
  emit("row-dblclick", row.original, row, event);
}

const tableApi = computed(() => tableRef.value?.tableApi ?? null);

function getContainerEl() {
  return tableRef.value?.$el ?? null;
}

defineExpose({ tableRef, tableApi, getContainerEl });
</script>
