<template>
  <div
    class="sample-progress-grid-host h-full min-h-0 w-full overflow-hidden"
    @mousedown.capture="handleMouseDown"
    @mouseup.capture="handleMouseUp"
    @paste.capture="handleNativePaste"
    @wheel.capture="handleWheel"
  >
    <VGrid
      ref="gridRef"
      class="h-full w-full"
      :source="filteredRows"
      :columns="columns"
      :column-types="columnTypes"
      :range="true"
      :use-clipboard="{ rangeFill: true }"
      :apply-on-close="true"
      :readonly="readonly"
      :row-headers="true"
      :resize="true"
      :can-move-columns="false"
      :filter="false"
      :exporting="false"
      :theme="'default'"
      :aria-label="'客户样品进度表格'"
      @afteredit="handleAfterEdit"
      @beforecellfocus="handleCellFocus"
      @beforepaste="handleBeforePaste"
      @setrange="handleSetRange"
    />
  </div>

  <Teleport to="body">
    <div
      v-if="filterPanel.open"
      ref="filterPopoverRef"
      class="sample-progress-filter-popover"
      :style="filterPopoverStyle"
      @mousedown.stop
    >
      <input
        ref="filterSearchRef"
        v-model="filterSearch"
        class="sample-progress-filter-search"
        type="search"
        placeholder="搜索"
        aria-label="筛选值搜索"
        @keydown.stop
      />

      <label class="sample-progress-filter-option sample-progress-filter-all">
        <input
          type="checkbox"
          :checked="allVisibleFilterValuesSelected"
          :indeterminate="someVisibleFilterValuesSelected && !allVisibleFilterValuesSelected"
          @change="toggleAllVisibleFilterValues"
        />
        <span>全选</span>
      </label>

      <div class="sample-progress-filter-values">
        <label v-for="option in visibleFilterOptions" :key="option.key" class="sample-progress-filter-option">
          <input
            type="checkbox"
            :checked="draftFilterValues.includes(option.key)"
            @change="toggleFilterValue(option.key)"
          />
          <span>{{ option.label }}</span>
        </label>
        <div v-if="!visibleFilterOptions.length" class="sample-progress-filter-empty">暂无值</div>
      </div>

      <div class="sample-progress-filter-actions">
        <button type="button" class="sample-progress-filter-confirm" @click="applyFilter">确定</button>
        <button type="button" class="sample-progress-filter-clear" @click="clearFilter">清除</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import VGrid from '@revolist/vue3-datagrid'
import { h as revoH } from '@revolist/revogrid'
import {
  filterSampleProgressRows,
  getSampleProgressFilterOptions,
  getSampleProgressFilterValueKey,
  normalizeSampleProgressGridValue,
} from '@ctk-system/shared'
import { handleQuotationGridWheel } from './quotationGridWheel.js'
import { isQuotationGridClick } from './quotationGridEdit.js'
import { isQuotationMultiCellPaste, normalizeQuotationClipboardText } from './quotationGridPaste.js'
import { getSelectedRowIndexes as getSelectedRowIndexesFromState } from './quotationGridSelection.js'
import { SampleProgressDateEditor, SampleProgressNumberEditor } from './sampleProgressGridEditors.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  canEditRow: { type: Function, default: () => true },
  canRemove: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] },
})

const emit = defineEmits(['edit', 'paste', 'action', 'filter'])
const gridRef = ref(null)
const columnTypes = ref({})
const selectReady = ref(false)
const lastFocusedCell = ref(null)
const selectedRange = ref(null)
const mouseStart = ref(null)
const filterPopoverRef = ref(null)
const filterSearchRef = ref(null)
const filterSearch = ref('')
const filterPanel = ref({ open: false, key: '', left: 0, top: 0 })
const draftFilterValues = ref([])
const activeFilters = ref({})

const stateLabels = {
  saving: '保存中',
  dirty: '待保存',
  error: '保存失败',
  draft: '新增草稿',
  saved: '已保存',
}

function actionButton(label, title, action, model, className = '') {
  return revoH('button', {
    type: 'button',
    class: `sample-grid-action-button ${className}`,
    title,
    'aria-label': title,
    onClick: (event) => {
      event.stopPropagation()
      emit('action', { action, row: model })
    },
  }, label)
}

function renderActions(_createElement, { model }) {
  const state = model?.__localState || 'saved'
  const children = [revoH('span', { class: `sample-grid-state is-${state}` }, stateLabels[state] || state)]
  if (state === 'error') children.push(actionButton('重试', '重试保存', 'retry', model))
  if (model?.__isDraft) children.push(actionButton('取消', '取消新增', 'cancel', model))
  else if (props.canRemove) children.push(actionButton('删除', '删除记录', 'delete', model, 'is-danger'))
  return revoH('div', { class: 'sample-grid-actions' }, children)
}

function isFilterActive(key) {
  return Object.prototype.hasOwnProperty.call(activeFilters.value, key)
}

function renderFilterIcon(h) {
  return h('svg', {
    class: 'sample-grid-filter-svg',
    viewBox: '0 0 24 24',
    width: '14',
    height: '14',
    'aria-hidden': 'true',
  }, [
    h('path', {
      d: 'M4 5h16l-6.2 7.1v5.1l-3.6 1.8v-6.9L4 5z',
      fill: 'currentColor',
    }),
  ])
}

function renderLeafHeader(h, data) {
  const field = props.fields.find((item) => item.key === data?.prop)
  const label = field?.header || data?.name || ''
  const active = field ? isFilterActive(field.key) : false
  return h('div', { class: 'sample-grid-header-content' }, [
    h('span', { class: 'sample-grid-header-title' }, label),
    h('button', {
      type: 'button',
      class: `sample-grid-filter-button${active ? ' is-active' : ''}`,
      title: `${label}筛选`,
      'aria-label': `${label}筛选`,
      onMouseDown: (event) => {
        event.preventDefault()
        event.stopPropagation()
      },
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (field) openFilter(field, event)
      },
    }, renderFilterIcon(h)),
  ])
}

const groupNameByKey = computed(() => {
  const map = {}
  for (const group of props.groups || []) {
    for (const key of group.keys || []) map[key] = group.name
  }
  return map
})

const groupColorByName = computed(() => {
  const map = {}
  for (const group of props.groups || []) map[group.name] = group.color || ''
  return map
})

const filteredRows = computed(() => filterSampleProgressRows(props.rows, activeFilters.value))

const filterOptions = computed(() => {
  const key = filterPanel.value.key
  if (!key) return []
  const rowsForOptions = props.rows.filter((row) => Object.entries(activeFilters.value).every(([filterKey, values]) => (
    filterKey === key || values.includes(getSampleProgressFilterValueKey(row?.[filterKey]))
  )))
  return getSampleProgressFilterOptions(rowsForOptions, key)
})

const visibleFilterOptions = computed(() => {
  const search = filterSearch.value.trim().toLocaleLowerCase()
  if (!search) return filterOptions.value
  return filterOptions.value.filter((option) => option.label.toLocaleLowerCase().includes(search))
})

const allVisibleFilterValuesSelected = computed(() => {
  const values = visibleFilterOptions.value.map((option) => option.key)
  return values.length > 0 && values.every((value) => draftFilterValues.value.includes(value))
})

const someVisibleFilterValuesSelected = computed(() => {
  const values = visibleFilterOptions.value.map((option) => option.key)
  return values.some((value) => draftFilterValues.value.includes(value))
})

const filterPopoverStyle = computed(() => ({
  left: `${filterPanel.value.left}px`,
  top: `${filterPanel.value.top}px`,
}))

function getFilterOptionKeys() {
  return filterOptions.value.map((option) => option.key)
}

function openFilter(field, event) {
  const target = event?.currentTarget
  const rect = target?.getBoundingClientRect?.()
  if (!field || !rect) return
  const width = 205
  const estimatedHeight = 290
  const left = Math.min(Math.max(8, rect.left - 70), Math.max(8, window.innerWidth - width - 8))
  const top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - estimatedHeight - 8))
  filterPanel.value = { open: true, key: field.key, left, top }
  filterSearch.value = ''
  draftFilterValues.value = isFilterActive(field.key)
    ? [...activeFilters.value[field.key]]
    : getFilterOptionKeys()
  nextTick(() => filterSearchRef.value?.focus?.())
}

function toggleFilterValue(valueKey) {
  const values = new Set(draftFilterValues.value)
  if (values.has(valueKey)) values.delete(valueKey)
  else values.add(valueKey)
  draftFilterValues.value = [...values]
}

function toggleAllVisibleFilterValues() {
  const visibleKeys = visibleFilterOptions.value.map((option) => option.key)
  const values = new Set(draftFilterValues.value)
  if (allVisibleFilterValuesSelected.value) visibleKeys.forEach((key) => values.delete(key))
  else visibleKeys.forEach((key) => values.add(key))
  draftFilterValues.value = [...values]
}

function closeFilter() {
  filterPanel.value = { ...filterPanel.value, open: false }
  filterSearch.value = ''
}

function emitFilterCount() {
  emit('filter', Object.keys(activeFilters.value).length)
}

function applyFilter() {
  const key = filterPanel.value.key
  if (!key) return closeFilter()
  const allKeys = getFilterOptionKeys()
  const next = { ...activeFilters.value }
  if (draftFilterValues.value.length === allKeys.length && allKeys.every((value) => draftFilterValues.value.includes(value))) {
    delete next[key]
  } else {
    next[key] = [...draftFilterValues.value]
  }
  activeFilters.value = next
  closeFilter()
  emitFilterCount()
}

function clearFilter() {
  const key = filterPanel.value.key
  if (key) {
    const next = { ...activeFilters.value }
    delete next[key]
    activeFilters.value = next
  }
  closeFilter()
  emitFilterCount()
}

function handleDocumentMouseDown(event) {
  if (!filterPanel.value.open) return
  const path = event.composedPath?.() || []
  if (filterPopoverRef.value && (path.includes(filterPopoverRef.value) || path.some((item) => item?.classList?.contains('sample-grid-filter-button')))) return
  closeFilter()
}

function buildLeafColumn(field) {
  const baseItems = (field.items || []).map((item) => (
    item && typeof item === 'object'
      ? item
      : { label: String(item), value: item }
  ))
  const knownValues = new Set(baseItems.map((item) => item.value))
  const historicalItems = Array.from(new Set(
    props.rows
      .map((row) => row?.[field.key])
      .filter((value) => value !== '' && value != null && !knownValues.has(value)),
  )).map((value) => ({ label: `${value}（历史值）`, value }))
  return {
    prop: field.key,
    name: field.header,
    size: field.size,
    columnTemplate: (h, data) => renderLeafHeader(h, data),
    readonly: ({ model }) => props.readonly || !props.canEditRow(model),
    ...(field.type === 'date' ? { editor: SampleProgressDateEditor } : {}),
    ...(field.type === 'number' ? { editor: SampleProgressNumberEditor } : {}),
    ...(field.type === 'select' && selectReady.value
      ? {
          columnType: 'select',
          source: [...baseItems, ...historicalItems],
          labelKey: 'label',
          valueKey: 'value',
          hasFilter: false,
          appendTo: 'body',
        }
      : {}),
    ...(field.key === 'partNo' ? { cellProperties: () => ({ class: 'font-mono' }) } : {}),
  }
}

// Build grouped columns: consecutive fields sharing the same band name are
// wrapped into a single ColumnGrouping header; ungrouped fields stay plain.
const columns = computed(() => {
  const groupMap = groupNameByKey.value
  const result = []
  let currentGroup = null
  for (const field of props.fields) {
    const leaf = buildLeafColumn(field)
    const name = groupMap[field.key]
    if (!name) {
      currentGroup = null
      result.push(leaf)
    } else if (currentGroup && currentGroup.name === name) {
      currentGroup.children.push(leaf)
    } else {
      const color = groupColorByName.value[name] || ''
      currentGroup = {
        name,
        children: [leaf],
        columnTemplate: (h) => h('div', {
          class: 'sample-grid-band',
          style: { backgroundColor: color },
        }, name),
      }
      result.push(currentGroup)
    }
  }
  result.push({
    prop: '__localState',
    name: '保存状态 / 操作',
    size: 190,
    readonly: true,
    pin: 'colPinEnd',
    cellTemplate: renderActions,
  })
  return result
})

function flattenLeafColumns(cols = columns.value) {
  const out = []
  for (const col of cols) {
    if (col && Array.isArray(col.children)) out.push(...flattenLeafColumns(col.children))
    else if (col) out.push(col)
  }
  return out
}

onMounted(async () => {
  document.addEventListener('mousedown', handleDocumentMouseDown)
  try {
    const { default: SelectTypePlugin } = await import('@revolist/revogrid-column-select')
    columnTypes.value = { select: new SelectTypePlugin() }
    selectReady.value = true
  } catch (error) {
    console.error('[SampleProgressGrid] 下拉编辑器加载失败', error)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)
})

watch(
  () => props.rows,
  () => nextTick(() => getGridElement()?.refresh?.('all')),
  { deep: true },
)

function getGridElement() {
  return gridRef.value?.$el || gridRef.value
}

function handleWheel(event) {
  handleQuotationGridWheel(event, getGridElement())
}

function handleCellFocus(event) {
  const detail = event?.detail || {}
  const row = detail.rowIndex ?? detail.rgRow ?? detail.y
  const column = detail.colIndex ?? detail.rgCol ?? detail.x
  if (Number.isInteger(row) && Number.isInteger(column)) lastFocusedCell.value = { row, column }
}

function handleSetRange(event) {
  const range = event?.detail || event
  if (range && Number.isInteger(range.y) && Number.isInteger(range.y1)) {
    selectedRange.value = { x: range.x, x1: range.x1, y: range.y, y1: range.y1 }
  }
}

function getGridCellFromEvent(event) {
  return event.composedPath?.().find((element) => element?.classList?.contains('rgCell')) || null
}

function getCellPosition(cell) {
  const row = Number(cell?.dataset?.rgrow)
  const column = Number(cell?.dataset?.rgcol)
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null
}

function handleMouseDown(event) {
  const position = getCellPosition(getGridCellFromEvent(event))
  mouseStart.value = event.button === 0 && position
    ? { position, clientX: event.clientX, clientY: event.clientY }
    : null
}

function handleMouseUp(event) {
  const start = mouseStart.value
  mouseStart.value = null
  if (!isQuotationGridClick(start, event)) return

  window.setTimeout(async () => {
    const grid = getGridElement()
    const focused = await grid?.getFocused?.()
    const position = focused?.cell
      ? { row: focused.cell.y, column: focused.cell.x }
      : start.position
    if (position.row !== start.position.row || position.column !== start.position.column) return
    const flatColumns = flattenLeafColumns()
    const column = focused?.column || flatColumns[position.column]
    const model = focused?.model || filteredRows.value[position.row]
    if (!column || column.readonly === true || column.prop === '__localState' || props.readonly || !props.canEditRow(model)) return
    await grid?.setCellEdit?.(position.row, column.prop, 'rgRow')
  }, 0)
}

async function getPasteStartCell() {
  const grid = getGridElement()
  const focused = await grid?.getFocused?.()
  const range = await grid?.getSelectedRange?.()
  if (focused?.cell) {
    const model = focused.model || filteredRows.value[focused.cell.y]
    const row = props.rows.indexOf(model)
    return { row: row >= 0 ? row : focused.cell.y, column: focused.cell.x }
  }
  if (range) {
    const visibleRow = Math.min(range.y, range.y1)
    const row = props.rows.indexOf(filteredRows.value[visibleRow])
    return { row: row >= 0 ? row : visibleRow, column: Math.min(range.x, range.x1) }
  }
  if (!lastFocusedCell.value) return null
  const row = props.rows.indexOf(filteredRows.value[lastFocusedCell.value.row])
  return { row: row >= 0 ? row : lastFocusedCell.value.row, column: lastFocusedCell.value.column }
}

async function emitMatrixPaste({ event, text, detail, clipboardEvent }) {
  const grid = getGridElement()
  const startCell = await getPasteStartCell()
  const activeEditor = grid?.querySelector?.('revogr-edit')
  await activeEditor?.cancelChanges?.()
  await grid?.clearFocus?.()
  emit('paste', { event, detail, text, startCell, clipboardEvent })
}

async function handleNativePaste(event) {
  if (props.readonly) return
  const text = normalizeQuotationClipboardText(event.clipboardData?.getData('text/plain'))
  const html = String(event.clipboardData?.getData('text/html') || '')
  if (!isQuotationMultiCellPaste(text, /<table[\s>]/i.test(html))) return
  event.preventDefault()
  event.stopImmediatePropagation?.()
  await emitMatrixPaste({
    event,
    text,
    detail: { dataText: text, isHTML: Boolean(html), event },
    clipboardEvent: event,
  })
}

async function handleBeforePaste(event) {
  const detail = event?.detail || {}
  const text = normalizeQuotationClipboardText(detail.dataText)
  if (!isQuotationMultiCellPaste(text, Boolean(detail.isHTML))) return
  event.preventDefault()
  await emitMatrixPaste({ event, text, detail, clipboardEvent: detail.event })
}

function handleAfterEdit(event) {
  const detail = event?.detail || {}
  const rowIndex = Number(detail.rowIndex)
  const column = props.fields.find((item) => item.key === detail.prop) || {}
  const row = detail.model || props.rows[rowIndex]
  if (!row || !detail.prop) return
  emit('edit', {
    row,
    rowIndex,
    key: detail.prop,
    value: normalizeSampleProgressGridValue(detail.val, column),
    detail,
  })
}

async function getSelectedRowIndexes() {
  const range = (await getGridElement()?.getSelectedRange?.()) || selectedRange.value
  const focused = await getGridElement()?.getFocused?.()
  const visibleIndexes = getSelectedRowIndexesFromState({ range, focused, lastFocused: lastFocusedCell.value })
  return visibleIndexes
    .map((index) => props.rows.indexOf(filteredRows.value[index]))
    .filter((index) => index >= 0)
}

function clearSelectedRange() {
  selectedRange.value = null
  getGridElement()?.clearFocus?.()
}

function getActiveFilterCount() {
  return Object.keys(activeFilters.value).length
}

function clearAllFilters() {
  activeFilters.value = {}
  closeFilter()
  emitFilterCount()
}

defineExpose({ getSelectedRowIndexes, clearSelectedRange, getActiveFilterCount, clearAllFilters })
</script>

<style scoped>
.sample-progress-grid-host :deep(revo-grid) {
  display: block;
  height: 100%;
  width: 100%;
  min-height: 0;
  font-size: 12px;
}

:deep(.sample-grid-band) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  font-weight: 600;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.sample-grid-header-content) {
  display: flex;
  min-width: 0;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
}

:deep(.sample-grid-header-title) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.sample-grid-filter-button) {
  display: inline-flex;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 3px;
  color: #6b7280;
  background: transparent;
  cursor: pointer;
}

:deep(.sample-grid-filter-button:hover),
:deep(.sample-grid-filter-button.is-active) {
  color: #2563eb;
  background: #dbeafe;
}

:deep(.sample-grid-filter-svg) {
  display: block;
}

:global(.sample-grid-actions) {
  display: flex;
  height: 100%;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  white-space: nowrap;
}

:global(.sample-grid-state) {
  border-radius: 999px;
  padding: 2px 7px;
  background: color-mix(in srgb, var(--app-border) 55%, transparent);
  font-size: 11px;
}

:global(.sample-grid-state.is-saved) { color: #059669; }
:global(.sample-grid-state.is-dirty),
:global(.sample-grid-state.is-draft) { color: #d97706; }
:global(.sample-grid-state.is-saving) { color: #0284c7; }
:global(.sample-grid-state.is-error) { color: #dc2626; }

:global(.sample-grid-action-button) {
  border: 0;
  background: transparent;
  color: var(--ui-primary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
}

:global(.sample-grid-action-button.is-danger) { color: #dc2626; }
:global(.sample-grid-action-button:hover) { text-decoration: underline; }

:global(.sample-progress-filter-popover) {
  position: fixed;
  z-index: 10000;
  display: flex;
  width: 205px;
  max-height: min(360px, calc(100vh - 16px));
  flex-direction: column;
  padding: 6px;
  overflow: hidden;
  border: 1px solid #9ca3af;
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 3px 10px rgb(0 0 0 / 22%);
  color: #111827;
  font-size: 13px;
}

:global(.sample-progress-filter-search) {
  width: 100%;
  height: 32px;
  flex: 0 0 auto;
  padding: 0 9px;
  border: 1px solid #9ca3af;
  border-radius: 2px;
  outline: none;
  color: #111827;
  background: #fff;
}

:global(.sample-progress-filter-search:focus) { border-color: #2563eb; }

:global(.sample-progress-filter-option) {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 3px 7px;
  cursor: pointer;
  user-select: none;
}

:global(.sample-progress-filter-option:hover) { background: #eff6ff; }

:global(.sample-progress-filter-option input) {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: #2563eb;
}

:global(.sample-progress-filter-all) {
  margin-top: 5px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
}

:global(.sample-progress-filter-values) {
  min-height: 0;
  overflow-y: auto;
}

:global(.sample-progress-filter-empty) {
  padding: 12px 8px;
  color: #6b7280;
  text-align: center;
}

:global(.sample-progress-filter-actions) {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 7px 0 1px;
  border-top: 1px solid #e5e7eb;
}

:global(.sample-progress-filter-actions button) {
  min-width: 48px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #2563eb;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
}

:global(.sample-progress-filter-confirm) {
  color: #fff;
  background: #4f7ff0;
}

:global(.sample-progress-filter-clear) {
  color: #2563eb;
  background: #fff;
}

/* 深色模式：筛选弹层是一套写死浅色的独立浮层，挂在 body 上不继承页面主题 */
:global(html.dark .sample-progress-filter-popover) {
  border-color: var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}

:global(html.dark .sample-progress-filter-search) {
  border-color: var(--app-border);
  color: var(--app-text);
  background: var(--app-page-hover);
}

:global(html.dark .sample-progress-filter-search::placeholder) {
  color: var(--app-page-text-muted);
}

:global(html.dark .sample-progress-filter-option:hover) {
  background: var(--app-page-hover);
}

:global(html.dark .sample-progress-filter-all),
:global(html.dark .sample-progress-filter-actions) {
  border-color: var(--app-border);
}

:global(html.dark .sample-progress-filter-empty) {
  color: var(--app-page-text-muted);
}

:global(html.dark .sample-progress-filter-clear) {
  color: var(--app-link-color);
  background: var(--app-surface);
}

/* 深色模式：列筛选按钮在深色表头上不能再用浅蓝 hover 底 */
:global(html.dark .sample-grid-filter-button) {
  color: var(--app-text-secondary);
}

:global(html.dark .sample-grid-filter-button:hover),
:global(html.dark .sample-grid-filter-button.is-active) {
  color: #93c5fd;
  background: rgba(96, 165, 250, 0.18);
}
</style>
