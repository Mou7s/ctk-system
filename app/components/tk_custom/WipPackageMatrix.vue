<template>
  <div class="wip-matrix">
    <!-- 工具条：图例 + 行轴切换（分段控件） -->
    <div class="matrix-bar">
      <div class="matrix-legend">
        <span class="matrix-legend__title">在制数量</span>
        <span class="matrix-legend__scale-wrap">
          <span class="matrix-legend__tick">0</span>
          <span class="matrix-legend__scale" aria-hidden="true">
            <i v-for="step in HEAT_STEPS" :key="step" :style="{ background: heatColor(step) }" />
          </span>
          <span class="matrix-legend__tick matrix-legend__tick--peak">{{ formatQty(matrix.maxCellQty) }}</span>
        </span>
      </div>

      <TkSegmented
        class="matrix-axis-switch"
        :model-value="transposed ? 'process' : 'package'"
        :items="AXIS_OPTIONS"
        label="矩阵行轴"
        @update:model-value="emit('set-transposed', $event === 'process')"
      />
    </div>

    <!-- 材质层：内容在下方滚动，表头吸顶/吸左 -->
    <div class="matrix-stage">
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="axis-corner">
                <span class="axis-corner__main">{{ rowAxisLabel }}</span>
                <span class="axis-corner__slash" aria-hidden="true">╲</span>
                <span class="axis-corner__sub">{{ columnAxisLabel }}</span>
              </th>
              <th v-for="column in columns" :key="column.name" class="axis-col">
                <button
                  class="axis-button"
                  type="button"
                  :title="`只看「${column.name}」，共 ${formatExact(column.wipQty)}`"
                  @click="emit('drill-axis', { axis: columnAxis, name: column.name })"
                >
                  <span class="axis-name">{{ column.name }}</span>
                  <span class="axis-qty">{{ formatQty(column.wipQty) }}</span>
                </button>
              </th>
              <th class="axis-col axis-col--total">
                <span class="axis-col__total">合计</span>
              </th>
            </tr>
          </thead>
          <tbody :key="signature">
            <tr v-for="(row, rowIndex) in grid" :key="row.name">
              <th class="axis-row">
                <button
                  class="axis-button axis-button--row"
                  type="button"
                  :title="`只看「${row.name}」，共 ${formatExact(row.wipQty)}`"
                  @click="emit('drill-axis', { axis: rowAxis, name: row.name })"
                >
                  <span class="axis-name">{{ row.name }}</span>
                  <span class="axis-meta">{{ row.materialCount }} 料 · {{ row.orderCount }} 单</span>
                </button>
              </th>
              <td
                v-for="(cell, columnIndex) in row.cells"
                :key="cell.processName + cell.packageName"
                class="matrix-cell"
                :class="{ 'matrix-cell--empty': !cell.hit }"
              >
                <button
                  v-if="cell.hit"
                  class="cell-button"
                  :class="{ 'is-negative': cell.wipQty < 0, 'cell-button--enter': isEnterCell(rowIndex, columnIndex) }"
                  type="button"
                  :style="{ ...heatStyle(cell), '--stagger': Math.min(rowIndex + columnIndex, 18) }"
                  :data-heat="heatPercent(cell)"
                  :aria-label="`${cell.packageName} 在 ${cell.processName} 在制 ${formatExact(cell.wipQty)}，${cell.orderCount} 个订单`"
                  :title="cellTitle(cell)"
                  @click="emit('drill-cell', { packageName: cell.packageName, processName: cell.processName })"
                >
                  <span class="cell-qty">{{ formatQty(cell.wipQty) }}</span>
                  <span class="cell-meta">
                    <template v-if="cell.unreportedCount">
                      <i class="cell-dot" aria-hidden="true" />
                      <span class="cell-flag">未汇报</span>
                      <span class="cell-orders">· {{ cell.orderCount }} 单</span>
                    </template>
                    <span v-else>{{ cell.orderCount }} 单</span>
                  </span>
                </button>
                <span v-else class="cell-empty" aria-hidden="true">—</span>
              </td>
              <td class="matrix-total">{{ formatQty(row.wipQty) }}</td>
            </tr>
            <tr v-if="grid.length === 0">
              <td :colspan="columns.length + 2" class="matrix-empty">当前筛选下没有在制数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import TkSegmented from '../../packages/ui/TkSegmented.vue'

const props = defineProps({
  matrix: {
    type: Object,
    default: () => ({ packages: [], processes: [], cells: [], totalQty: 0, maxCellQty: 0 })
  },
  transposed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['drill-cell', 'drill-axis', 'set-transposed'])

const HEAT_STEPS = [0.05, 0.3, 0.55, 0.8, 1]
// 进场动画只给首屏能看到的头几十个格子：420 个格子同时动画，主线程要多背 400 个动画，
// 而观众根本看不到屏幕外的那些
const ENTER_CELL_BUDGET = 40
const AXIS_OPTIONS = [
  { value: 'package', label: '封装为行' },
  { value: 'process', label: '工序为行' }
]

// 单元格按 封装 → 工序 两层索引，不把两个维度拼成一个字符串键
const cellIndex = computed(() => {
  const index = new Map()
  for (const cell of props.matrix.cells || []) {
    let byProcess = index.get(cell.packageName)
    if (!byProcess) {
      byProcess = new Map()
      index.set(cell.packageName, byProcess)
    }
    byProcess.set(cell.processName, cell)
  }
  return index
})

const rows = computed(() => (props.transposed ? props.matrix.processes || [] : props.matrix.packages || []))
const columns = computed(() => (props.transposed ? props.matrix.packages || [] : props.matrix.processes || []))
const rowAxis = computed(() => (props.transposed ? 'process' : 'package'))
const columnAxis = computed(() => (props.transposed ? 'package' : 'process'))
const rowAxisLabel = computed(() => (props.transposed ? '工序' : '封装'))
const columnAxisLabel = computed(() => (props.transposed ? '封装' : '工序'))

// 数据或轴向一变就换 key：进场弹簧动画重放（等价于「新内容到达」）
const signature = computed(() => [
  props.transposed ? 'T' : 'P',
  props.matrix.packages?.length || 0,
  props.matrix.processes?.length || 0,
  props.matrix.cells?.length || 0,
  Number(props.matrix.totalQty) || 0
].join('|'))

// 展开成渲染网格：每行带上自己那一行的格子，模板不再反复查表
const grid = computed(() => rows.value.map((row) => ({
  name: row.name,
  wipQty: row.wipQty,
  orderCount: row.orderCount,
  materialCount: row.materialCount,
  cells: columns.value.map((column) => {
    const packageName = props.transposed ? column.name : row.name
    const processName = props.transposed ? row.name : column.name
    const cell = cellIndex.value.get(packageName)?.get(processName)
    return cell
      ? { ...cell, hit: true }
      : { packageName, processName, wipQty: 0, orderCount: 0, materialCount: 0, unreportedCount: 0, unreportedQty: 0, hit: false }
  })
})))

// 对数标度：同一个矩阵里峰值能比最小值大四个数量级，开方仍会把中低量全压成一片浅色，
// 只有对数能让「1 万 / 1 千 / 1 百」在色深上分得开
function heatLevelPercent(weight) {
  const clamped = Math.min(Math.max(Number(weight) || 0, 0), 1)
  return Math.round(8 + clamped * 58)
}

function heatWeight(value) {
  const max = Number(props.matrix.maxCellQty) || 0
  const amount = Math.abs(Number(value) || 0)
  if (max <= 0 || amount <= 0) return 0
  return Math.log1p(amount) / Math.log1p(max)
}

function isEnterCell(rowIndex, columnIndex) {
  return rowIndex * (columns.value.length || 1) + columnIndex < ENTER_CELL_BUDGET
}

function heatColor(weight) {
  return `color-mix(in srgb, var(--wip-accent) ${heatLevelPercent(weight)}%, var(--app-surface))`
}

function heatStyle(cell) {
  return { background: heatColor(heatWeight(cell.wipQty)) }
}

function heatPercent(cell) {
  return heatLevelPercent(heatWeight(cell.wipQty))
}

function cellTitle(cell) {
  const parts = [
    `${cell.packageName} · ${cell.processName}`,
    `在制 ${formatExact(cell.wipQty)}`,
    `${cell.orderCount} 个订单 / ${cell.materialCount} 个物料`
  ]
  if (cell.unreportedCount) parts.push(`其中 ${cell.unreportedCount} 行未汇报（${formatExact(cell.unreportedQty)}）`)
  parts.push('点击查看明细')
  return parts.join('\n')
}

// 格子放不下 7 位数，按量级分三档显示（完整值始终留在 tooltip 与下钻明细里）：
// <1000 保留一位小数（22.4 这种小数量的小数点有意义）；1000~9999 取整带千分位；
// ≥1万 折成「万」。同一档里格式一致，扫一列不会一半有小数一半没有。
function formatQty(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  const absolute = Math.abs(number)
  if (absolute >= 10000) {
    return `${(number / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}万`
  }
  if (absolute >= 1000) {
    return Math.round(number).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  }
  return number.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

function formatExact(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}
</script>

<style scoped>
.wip-matrix {
  /* 弹簧 = 苹果那两组设计师参数（阻尼比 + 响应时间）编译成的停靠曲线：
     1.0/0.35s 临界阻尼无过冲（进场、面板）；0.8/0.3s 欠阻尼允许 1.5% 过冲（切换、手势） */
  --spring-soft: linear(0, 0.0459 3.7%, 0.1432 7.4%, 0.2603 11.1%, 0.3791 14.8%, 0.4898 18.5%, 0.5877 22.2%, 0.6709 25.9%, 0.7392 29.6%, 0.7951 33.3%, 0.8403 37%, 0.8763 40.7%, 0.9048 44.4%, 0.9272 48.1%, 0.9444 51.9%, 0.9575 55.6%, 0.9677 59.3%, 0.9755 63%, 0.9816 66.7%, 0.9861 70.4%, 0.9896 74.1%, 0.9922 77.8%, 0.9941 81.5%, 0.9956 85.2%, 0.9967 88.9%, 0.9976 92.6%, 0.9982 96.3%, 0.9987 100%);
  --spring-bounce: linear(0, 0.0434 3.7%, 0.1402 7.4%, 0.2627 11.1%, 0.3922 14.8%, 0.5165 18.5%, 0.6285 22.2%, 0.7247 25.9%, 0.8041 29.6%, 0.8673 33.3%, 0.9159 37%, 0.9519 40.7%, 0.9774 44.4%, 0.9947 48.1%, 1.0055 51.9%, 1.0115 55.6%, 1.0143 59.3%, 1.015 63%, 1.0143 66.7%, 1.0128 70.4%, 1.0109 74.1%, 1.009 77.8%, 1.0071 81.5%, 1.0054 85.2%, 1.004 88.9%, 1.0028 92.6%, 1.0019 96.3%, 1.0012 100%);

  /* 材质分层：细发丝线代替 1px 边框，表头/合计带用「比表面亮一档」的材质浮在内容之上。
     用 text 色做 6% 叠加：浅色下是浅灰带，深色下是抬高一档的深灰，两种主题都能读出层叠 */
  --matrix-hairline: color-mix(in srgb, var(--app-text) 8%, transparent);
  --matrix-material: color-mix(in srgb, var(--app-surface) 74%, transparent);
  --matrix-material-solid: color-mix(in srgb, var(--app-text) 7%, var(--app-surface));
  --matrix-tile-ring: color-mix(in srgb, var(--app-text) 6%, transparent);

  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  gap: 10px;
}

/* ── 工具条 ───────────────────────────────────────────── */
.matrix-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--app-page-text-muted);
  animation: rise 420ms var(--spring-soft) both;
}

.matrix-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.matrix-legend__title {
  font-weight: 600;
  color: var(--app-text-secondary);
  letter-spacing: -0.01em;
}

.matrix-legend__scale-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.matrix-legend__tick {
  font-size: 11px;
  color: var(--app-page-text-muted);
  font-variant-numeric: tabular-nums;
}

.matrix-legend__tick--peak {
  font-weight: 600;
  color: var(--app-text-secondary);
}

.matrix-legend__scale {
  display: inline-flex;
  border-radius: 999px;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--matrix-hairline);
}

.matrix-legend__scale i {
  width: 18px;
  height: 9px;
}

/* 分段控件由 @ctk-system/ui 的 TkSegmented 提供（滑块弹簧、等宽选项、无障碍都在那边） */
.matrix-axis-switch {
  flex-shrink: 0;
}

/* ── 材质层 ───────────────────────────────────────────── */
.matrix-stage {
  position: relative;
  /* 贴合内容高度：行少时不拖一块空面板，行多时再内部滚动 */
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  border-radius: 14px;
  overflow: hidden;
  /* 面板坐在纯色页面底色上，模糊后面没有东西可看 —— 用实底表面 + 发丝线 + 软投影分层，
     把 backdrop-filter 留给真正浮在内容之上的小面积材质（抽屉、吸顶条） */
  background: var(--app-surface);
  box-shadow:
    0 0 0 1px var(--matrix-hairline),
    0 8px 24px -14px var(--app-shadow);
  animation: materialIn 440ms var(--spring-soft) both;
}

.matrix-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.matrix-table {
  /* 列少时也铺满整个材质面板，不留一块看起来「没画完」的空白 */
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  color: var(--app-text);
}

.matrix-table th,
.matrix-table td {
  padding: 0;
  font-weight: inherit;
}

/* ── 坐标轴：吸顶 / 吸左 ───────────────────────────────
   这里的材质是不透明的（canvas 实测 alpha=1），所以不写 backdrop-filter：
   背景不透明时模糊只是白烧 GPU，屏幕上没有任何区别。 */
.axis-corner,
.axis-col,
.axis-row {
  background: var(--matrix-material-solid);
}

.axis-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 4;
  /* 表格铺满面板时把多出来的宽度分给数据列，标签列固定住 */
  width: 148px;
  min-width: 136px;
  padding: 9px 12px !important;
  text-align: left;
  white-space: nowrap;
  box-shadow: inset -1px -1px 0 var(--matrix-hairline);
}

.axis-corner__main {
  font-weight: 600;
  color: var(--app-text-secondary);
  letter-spacing: -0.01em;
}

.axis-corner__slash {
  margin: 0 5px;
  color: var(--app-page-text-muted);
}

.axis-corner__sub {
  color: var(--app-page-text-muted);
}

.axis-col {
  position: sticky;
  top: 0;
  z-index: 3;
  min-width: 92px;
  box-shadow: inset -1px -1px 0 var(--matrix-hairline), 0 3px 6px -5px var(--app-shadow);
}

.axis-col__total {
  display: inline-block;
  padding: 9px 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.axis-row {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 148px;
  min-width: 136px;
  text-align: left;
  box-shadow: inset -1px -1px 0 var(--matrix-hairline), 3px 0 6px -5px var(--app-shadow);
}

.axis-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--app-text-secondary);
  transition: background-color 180ms ease, transform 140ms var(--spring-bounce);
}

.axis-button--row {
  align-items: flex-start;
}

@media (hover: hover) {
  .axis-button:hover {
    background: color-mix(in srgb, var(--wip-accent) 10%, transparent);
  }

  .axis-button:hover .axis-name {
    color: var(--wip-accent);
  }
}

/* 按下即反馈，不等 click */
.axis-button:active {
  transform: scale(0.97);
}

.axis-name {
  max-width: 100%;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.axis-qty,
.axis-meta {
  font-size: 11px;
  /* 轴上的次要信息用「文本色降透明」而不是灰阶变量：浅色深色都保持对比 */
  color: color-mix(in srgb, var(--app-text) 72%, transparent);
  font-variant-numeric: tabular-nums;
}

/* ── 格子 ─────────────────────────────────────────────── */
td.matrix-cell {
  padding: 3px;
  min-width: 92px;
  height: 52px;
  vertical-align: middle;
}

.matrix-cell--empty {
  background: color-mix(in srgb, var(--app-text) 2%, transparent);
}

.cell-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 100%;
  height: 100%;
  min-height: 46px;
  padding: 4px 6px;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  color: var(--app-text);
  box-shadow: inset 0 0 0 1px var(--matrix-tile-ring);
  transition: transform 180ms var(--spring-bounce), box-shadow 180ms ease;
}

.cell-button:active {
  transform: scale(0.965);
  transition-duration: 90ms;
}

@media (hover: hover) {
  .cell-button:hover {
    transform: translateY(-1px) scale(1.015);
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--wip-accent) 65%, transparent),
      0 6px 14px -8px var(--app-shadow);
  }
}

.cell-button:focus-visible {
  outline: 2px solid var(--wip-accent);
  outline-offset: 2px;
}

.cell-qty {
  font-size: 13.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  color: var(--wip-accent-strong, var(--wip-accent));
}

html.dark .cell-qty {
  color: var(--app-text);
}

.cell-button.is-negative {
  background: color-mix(in srgb, #dc2626 14%, var(--app-surface)) !important;
}

.cell-button.is-negative .cell-qty {
  color: #dc2626;
}

.cell-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: color-mix(in srgb, var(--app-text) 72%, transparent);
  white-space: nowrap;
}

.cell-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
}

.cell-orders {
  color: color-mix(in srgb, var(--app-text) 55%, transparent);
}

/* 热力块本身就有蓝底，警示色只留给圆点；文字跟着主题文字色才在任何色深上读得清 */
.cell-flag {
  color: color-mix(in srgb, var(--app-text) 92%, transparent);
  font-weight: 600;
  letter-spacing: 0;
}

.cell-empty {
  display: block;
  text-align: center;
  font-size: 13px;
  /* 空格子要能一眼读出「这里没有在制」，而不是看起来像漏画了（深色下 30% 几乎看不见） */
  color: color-mix(in srgb, var(--app-text) 48%, transparent);
}

/* ── 合计：列合计在吸顶列头，行合计吸右（横向滚动时「这个封装一共多少」不该被推出屏幕） ── */
.matrix-total {
  position: sticky;
  right: 0;
  z-index: 2;
  padding: 7px 12px !important;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  background: var(--matrix-material-solid);
  color: var(--app-text);
  box-shadow: inset 1px 0 0 var(--matrix-hairline), -6px 0 8px -7px var(--app-shadow);
}

.axis-col--total {
  position: sticky;
  right: 0;
  z-index: 5;
  min-width: 88px;
  background: var(--matrix-material-solid);
  box-shadow: inset 1px 1px 0 var(--matrix-hairline), 0 3px 6px -5px var(--app-shadow);
}

.matrix-empty {
  padding: 40px !important;
  text-align: center;
  color: var(--app-page-text-muted);
}

/* ── 动效 ─────────────────────────────────────────────── */
.cell-button--enter {
  animation: cellIn 480ms var(--spring-soft) both;
  animation-delay: calc(var(--stagger, 0) * 7ms);
}

@keyframes cellIn {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes materialIn {
  from {
    opacity: 0;
    transform: scale(0.994);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ── 无障碍：减弱动态 / 降低透明度 / 增强对比 ─────────── */
@media (prefers-reduced-motion: reduce) {
  .matrix-bar,
  .matrix-stage,
  .cell-button {
    animation: none;
  }

  .cell-button,
  .cell-button:hover,
  .cell-button:active,
  .cell-button--enter,
  .axis-button,
  .axis-button:active {
    transform: none;
    transition: box-shadow 120ms linear, background-color 120ms linear;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .axis-corner,
  .axis-col,
  .axis-row {
    background: var(--app-surface);
  }

}

@media (prefers-contrast: more) {
  .matrix-stage {
    box-shadow: 0 0 0 1px var(--app-text);
  }

  .axis-corner,
  .axis-col,
  .axis-row,
  .matrix-total {
    box-shadow: inset -1px -1px 0 color-mix(in srgb, var(--app-text) 35%, transparent);
  }

  .cell-button {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 30%, transparent);
  }
}
</style>
