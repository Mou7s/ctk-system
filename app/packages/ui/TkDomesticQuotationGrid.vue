<template>
  <div ref="gridRoot" class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-muted/80 bg-elevated/20" @keydown.capture="handleHistoryShortcut">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-muted bg-muted/20 px-3 py-2 text-xs">
      <div class="flex min-w-0 items-center gap-2">
        <span class="font-semibold text-highlighted">报价明细</span>
        <UBadge color="neutral" variant="subtle" size="xs">{{ filledCount }} 行明细</UBadge>
        <span class="hidden truncate text-muted sm:inline" title="红色 * 为必填；支持从 Excel 复制明细后，在表格中粘贴">Excel 粘贴 · 红色 * 必填</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" title="撤销（Ctrl+Z）" :disabled="!props.canUndo" @click="emit('history', 'undo')">撤销</UButton>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-redo-2" title="重做（Ctrl+Y）" :disabled="!props.canRedo" @click="emit('history', 'redo')">重做</UButton>
        <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-rows-2" title="在当前指针或焦点所在行之前插入一行" @click="insertRow">插入行</UButton>
        <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-trash-2" title="删除当前指针或焦点所在行" @click="deleteRow">删除行</UButton>
        <UButton size="xs" color="primary" icon="i-lucide-plus" title="在末尾新增一行" @click="addRow">新增行</UButton>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto" @paste.capture="handlePaste">
      <table class="w-full min-w-[1120px] border-collapse text-xs">
        <thead class="sticky top-0 z-10 border-b border-muted bg-elevated/95 text-left text-muted backdrop-blur">
          <tr>
            <th class="w-12 min-w-12 border-r border-muted/50 px-2 py-2 text-center font-semibold">序号</th>
            <th
              v-for="column in columns"
              :key="column.key"
              class="border-r border-muted/50 px-2.5 py-2 font-semibold last:border-r-0"
              :style="{ minWidth: column.minWidth }"
            >
              {{ column.label }}<span v-if="column.required" class="ml-1 text-error">*</span>
            </th>
            <th class="w-12 min-w-12 px-1 py-2" aria-label="清空行" />
          </tr>
        </thead>
        <tbody class="divide-y divide-muted/40 bg-surface">
          <tr
            v-for="(row, rowIndex) in displayRows"
            :key="rowIndex"
            :class="activeRowIndex === rowIndex ? 'bg-primary/10 dark:bg-primary/15' : 'hover:bg-muted/20'"
            @click="selectRow(rowIndex)"
            @mouseenter="selectRow(rowIndex)"
          >
            <td class="border-r border-muted/40 px-2 py-1 text-center font-mono text-muted">{{ rowIndex + 1 }}</td>
            <td
              v-for="(column, columnIndex) in columns"
              :key="column.key"
              class="border-r border-muted/40 p-0.5 last:border-r-0"
            >
              <UInputMenu
                v-if="column.key === 'ctkMpn'"
                :model-value="row.ctkMpn"
                :items="materialOptions"
                :loading="materialLoading"
                value-key="value"
                label-key="label"
                :filter-fields="['label', 'value', 'ctkMpn', 'name', 'number', 'spec']"
                mode="autocomplete"
                size="xs"
                variant="none"
                create-item="always"
                open-on-click
                open-on-focus
                :data-grid-row="rowIndex"
                :data-grid-column="columnIndex"
                :aria-label="`第${rowIndex + 1}行${column.label}`"
                placeholder="从金蝶选择或输入CTK物料名称"
                class="h-8 w-full rounded-sm border border-transparent bg-transparent text-xs text-highlighted outline-none transition focus:border-primary/70 focus:bg-elevated focus:ring-1 focus:ring-primary/40"
                :content="{ align: 'start', sideOffset: 4 }"
                :ui="{ content: 'z-[10000] max-h-80 w-max min-w-(--reka-combobox-trigger-width) max-w-[min(calc(100vw-24px),var(--reka-combobox-content-available-width,100vw))]', itemLabel: 'whitespace-normal break-words overflow-visible text-clip', item: 'py-2' }"
                :open="isMaterialMenuOpen(rowIndex)"
                @update:open="value => handleMaterialMenuOpen(rowIndex, value)"
                @update:search-term="handleMaterialSearch"
                @input="event => handleMaterialInput(rowIndex, event)"
                @update:model-value="value => handleMaterialUpdate(rowIndex, value)"
                @create="value => handleMaterialCreate(rowIndex, value)"
                @focus="handleMaterialFocus(rowIndex)"
                @blur="event => handleMaterialBlur(rowIndex, event)"
                @keydown.enter.prevent
              />
              <input
                v-else
                :value="row[column.key]"
                :type="column.type === 'number' ? 'number' : 'text'"
                :min="column.type === 'number' ? '0.000001' : undefined"
                :step="column.type === 'number' ? '0.000001' : undefined"
                :inputmode="['number', 'price'].includes(column.type) ? 'decimal' : undefined"
                :data-grid-row="rowIndex"
                :data-grid-column="columnIndex"
                :aria-label="`第${rowIndex + 1}行${column.label}`"
                :placeholder="rowIndex === 0 && column.required ? '必填' : ''"
                class="h-8 w-full rounded-sm border border-transparent bg-transparent px-2 text-xs text-highlighted outline-none transition focus:border-primary/70 focus:bg-elevated focus:ring-1 focus:ring-primary/40"
                :class="['number', 'price'].includes(column.type) ? 'text-right tabular-nums' : ''"
                @focus="handleCellFocus(rowIndex)"
                @input="updateCell(rowIndex, column.key, $event.target.value)"
              >
            </td>
            <td class="px-1 text-center">
              <button
                type="button"
                class="rounded p-1 text-muted transition hover:bg-error/10 hover:text-error"
                :aria-label="`清空第${rowIndex + 1}行`"
                title="清空本行"
                @click="clearRow(rowIndex)"
              >
                <UIcon name="i-lucide-eraser" class="size-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  blankDomesticQuotationLine,
  DOMESTIC_QUOTATION_COLUMNS,
  DOMESTIC_QUOTATION_INITIAL_LINES,
  formatDomesticMaterialValue,
  hasDomesticQuotationLineData,
  mapDomesticMaterialOption,
  resolveDomesticMaterialSelection,
} from './domesticQuotationGrid.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'row-action', 'edit', 'history'])
const columns = DOMESTIC_QUOTATION_COLUMNS
const gridRoot = ref(null)
const activeRowIndex = ref(null)
const displayRows = computed(() => Array.from({ length: Math.max(DOMESTIC_QUOTATION_INITIAL_LINES, props.modelValue.length) }, (_, index) => ({
  ...blankDomesticQuotationLine(index + 1),
  ...(props.modelValue?.[index] || {}),
  lineNo: index + 1,
})))
const filledCount = computed(() => displayRows.value.filter(hasDomesticQuotationLineData).length)

function emitRows(rows) {
  const previousLines = displayRows.value.map((row) => ({ ...row }))
  const nextLines = Array.from({ length: Math.max(DOMESTIC_QUOTATION_INITIAL_LINES, rows.length) }, (_, index) => ({
    ...blankDomesticQuotationLine(index + 1),
    ...(rows[index] || {}),
    lineNo: index + 1,
  }))
  if (JSON.stringify(previousLines) === JSON.stringify(nextLines)) return false
  emit('edit', { previousLines })
  emit('update:modelValue', nextLines)
  return true
}

function updateCell(rowIndex, key, value) {
  const next = displayRows.value.map((row) => ({ ...row }))
  next[rowIndex][key] = value
  emitRows(next)
}

function updateRow(rowIndex, patch) {
  const next = displayRows.value.map((row) => ({ ...row }))
  Object.assign(next[rowIndex], patch)
  emitRows(next)
}

function selectRow(rowIndex) {
  if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < displayRows.value.length) {
    activeRowIndex.value = rowIndex
  }
}

function clearActiveRow() {
  activeRowIndex.value = null
}

function handleCellFocus(rowIndex) {
  selectRow(rowIndex)
}

function selectedRowIndex() {
  return Number.isInteger(activeRowIndex.value) && activeRowIndex.value >= 0 && activeRowIndex.value < displayRows.value.length
    ? activeRowIndex.value
    : 0
}

async function focusCell(rowIndex, columnIndex = 0) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= displayRows.value.length) return
  selectRow(rowIndex)
  await nextTick()
  const input = gridRoot.value?.querySelector?.(`[data-grid-row="${rowIndex}"][data-grid-column="${columnIndex}"]`)
  input?.focus?.()
}

function handleHistoryShortcut(event) {
  if (!(event.ctrlKey || event.metaKey)) return
  const key = String(event.key || '').toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    event.stopPropagation()
    emit('history', event.shiftKey ? 'redo' : 'undo')
  } else if (key === 'y') {
    event.preventDefault()
    event.stopPropagation()
    emit('history', 'redo')
  }
}

async function insertRow() {
  const at = selectedRowIndex()
  const next = displayRows.value.map(row => ({ ...row }))
  next.splice(at, 0, blankDomesticQuotationLine(at + 1))
  emitRows(next)
  await focusCell(at)
  emit('row-action', { action: 'insert', rowIndex: at })
}

async function deleteRow() {
  const at = selectedRowIndex()
  const next = displayRows.value.map(row => ({ ...row }))
  next.splice(at, 1)
  const changed = emitRows(next)
  await focusCell(Math.min(at, Math.max(DOMESTIC_QUOTATION_INITIAL_LINES, next.length) - 1))
  emit('row-action', { action: changed ? 'delete' : 'delete-empty', rowIndex: at })
}

async function addRow() {
  const next = displayRows.value.map(row => ({ ...row }))
  const at = next.length
  next.push(blankDomesticQuotationLine(at + 1))
  emitRows(next)
  await focusCell(at)
  emit('row-action', { action: 'add', rowIndex: at })
}

const materialOptions = ref([])
const materialLoading = ref(false)
const openMaterialMenuRow = ref(null)
let materialSearchTimer = null
let materialSearchSequence = 0

async function loadMaterialOptions(keyword, sequence) {
  materialLoading.value = true
  try {
    const request = (await import('@/utils/request')).default
    const response = await request({
      url: '/tk_custom/material/options',
      method: 'get',
      params: { keyword: String(keyword || '').trim(), limit: 50 },
    })
    if (sequence !== materialSearchSequence) return
    const rows = response?.data || response?.rows || []
    if (!Array.isArray(rows)) return

    const merged = new Map()
    for (const row of [...rows, ...materialOptions.value]) {
      const option = mapDomesticMaterialOption(row)
      if (!option) continue
      const key = `${option.ctkMpn.toUpperCase()}__${option.packageName.toUpperCase()}`
      if (!merged.has(key)) merged.set(key, option)
    }
    materialOptions.value = [...merged.values()]
  } catch {
    // 金蝶候选暂不可用时，仍允许手动输入型号。
  } finally {
    if (sequence === materialSearchSequence) materialLoading.value = false
  }
}

function handleMaterialSearch(keyword = '') {
  clearTimeout(materialSearchTimer)
  const sequence = ++materialSearchSequence
  materialSearchTimer = setTimeout(() => {
    void loadMaterialOptions(keyword, sequence)
  }, 150)
}

function isMaterialMenuOpen(rowIndex) {
  return openMaterialMenuRow.value === rowIndex
}

function handleMaterialMenuOpen(rowIndex, open) {
  if (open) openMaterialMenuRow.value = rowIndex
  else if (openMaterialMenuRow.value === rowIndex) openMaterialMenuRow.value = null
}

function handleMaterialFocus(rowIndex) {
  selectRow(rowIndex)
  openMaterialMenuRow.value = rowIndex
  handleMaterialSearch(displayRows.value[rowIndex]?.ctkMpn || '')
}

function handleMaterialInput(rowIndex, event) {
  const value = formatDomesticMaterialValue(event?.target?.value ?? '')
  if (value !== String(displayRows.value[rowIndex]?.ctkMpn || '').trim()) {
    updateCell(rowIndex, 'ctkMpn', value)
  }
  handleMaterialSearch(value)
}

function handleMaterialUpdate(rowIndex, value) {
  const selection = resolveDomesticMaterialSelection(value, materialOptions.value)
  const patch = { ctkMpn: selection.ctkMpn, minPackCount: selection.minPackCount }
  if (selection.packageName) patch.packageName = selection.packageName
  updateRow(rowIndex, patch)
}

function handleMaterialCreate(rowIndex, value) {
  handleMaterialUpdate(rowIndex, value)
  openMaterialMenuRow.value = null
}

function handleMaterialBlur(rowIndex, event) {
  const raw = event?.target?.value
  if (typeof raw !== 'string') return
  const value = formatDomesticMaterialValue(raw)
  if (value !== String(displayRows.value[rowIndex]?.ctkMpn || '').trim()) {
    handleMaterialUpdate(rowIndex, value)
  }
}

onMounted(() => handleMaterialSearch(''))
onBeforeUnmount(() => {
  clearTimeout(materialSearchTimer)
  materialSearchSequence += 1
})

function clearRow(rowIndex) {
  const next = displayRows.value.map((row) => ({ ...row }))
  next[rowIndex] = blankDomesticQuotationLine(rowIndex + 1)
  emitRows(next)
}

function handlePaste(event) {
  const input = event.target?.closest?.('[data-grid-row][data-grid-column]')
  if (!input) return
  const clipboardText = event.clipboardData?.getData('text/plain') || ''
  if (!clipboardText.includes('\t') && !/[\r\n]/u.test(clipboardText)) return

  event.preventDefault()
  event.stopPropagation()

  const startRow = Number(input.dataset.gridRow)
  const startColumn = Number(input.dataset.gridColumn)
  const matrix = clipboardText
    .replace(/\r\n?/gu, '\n')
    .replace(/\n+$/u, '')
    .split('\n')
    .map((line) => line.split('\t'))

  // 复制模板整行时，第一格是序号；网格自身已经显示序号，因此跳过它。
  const pasteRows = matrix.map((row) => row.length > columns.length ? row.slice(1) : row)
  const next = displayRows.value.map((row) => ({ ...row }))
  pasteRows.forEach((cells, rowOffset) => {
    const targetRow = startRow + rowOffset
    while (next.length <= targetRow) next.push(blankDomesticQuotationLine(next.length + 1))
    cells.forEach((value, columnOffset) => {
      const targetColumn = startColumn + columnOffset
      const column = columns[targetColumn]
      if (!column) return
      next[targetRow][column.key] = value.trim()
    })
  })
  emitRows(next)
}

defineExpose({ clearActiveRow })
</script>
