<template>
  <div class="quotation-line-cards flex h-full min-h-0 flex-col overflow-y-auto">
    <div v-if="!models.length" class="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-app-muted">
      {{ emptyText }}
    </div>

    <ul v-else class="flex flex-col gap-1.5 px-2.5 pt-2.5 pb-6">
      <li
        v-for="model in models"
        :key="model.key"
        class="rounded-xl border border-app-border bg-app-surface px-2.5 py-2 shadow-xs"
      >
        <!-- 标题行整行可点：展开/收起「全部字段」。原来这里是一个 40px 高的按钮行，
             加上 5 个带边框的字段格子，一张卡占掉 1/4 屏，有效信息却没几条 -->
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left"
          @click="toggle(model.key)"
        >
          <span class="shrink-0 font-mono text-[11px] text-app-muted">#{{ model.lineNo }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">{{ model.title }}</span>
          <UBadge color="neutral" variant="subtle" size="xs" class="shrink-0">{{ model.packageName }}</UBadge>
          <UBadge
            v-if="model.hasZeroPrice"
            color="warning"
            variant="soft"
            size="xs"
            icon="i-lucide-triangle-alert"
            class="shrink-0"
            :title="`${model.zeroPriceLabels.join(' / ')} 为 0，请确认是否已核价`"
          >
            {{ model.zeroPriceLabels.join('/') }}=0
          </UBadge>
          <UIcon
            :name="isExpanded(model.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-4 shrink-0 text-app-muted"
          />
        </button>

        <!-- 首屏 5 条：标签在左、值在右，两列一行，不再给每条套一个边框格子 -->
        <dl class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <div
            v-for="metric in model.metrics"
            :key="metric.key"
            class="flex items-baseline justify-between gap-2"
            :class="isTrailingOddMetric(metric, model) ? 'col-span-2' : ''"
          >
            <dt class="shrink-0 text-app-muted flex items-center gap-1" :title="metric.label">
              <span>{{ metric.short }}</span>
              <span
                v-if="reviewPriceEditable && metric.key === 'originalPriceRmb'"
                class="rounded bg-primary/15 px-1 py-0.2 text-[9px] font-medium text-primary"
              >可改</span>
            </dt>
            <dd v-if="reviewPriceEditable && metric.key === 'originalPriceRmb'" class="min-w-0 flex flex-col items-end gap-0.5">
              <div class="flex items-center gap-1">
                <div class="relative flex items-center">
                  <UInput
                    :model-value="model.reviewPriceRmb"
                    type="number"
                    min="0.01"
                    step="0.01"
                    size="xs"
                    :ui="{ base: '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-4 pr-5 font-mono text-xs' }"
                    :class="[
                      'w-28 font-mono rounded shadow-2xs',
                      isCardPriceModified(model)
                        ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'border-primary/40 bg-surface/90 focus-visible:ring-1 focus-visible:ring-primary'
                    ]"
                    :aria-label="`第${model.lineNo}行人民币单价`"
                    @update:model-value="priceRmb => emit('update:review-price', { id: model.key.startsWith('id:') ? Number(model.key.slice(3)) : null, lineNo: model.lineNo, priceRmb })"
                  />
                  <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted pointer-events-none">¥</span>
                  <UIcon
                    v-if="!isCardPriceModified(model)"
                    name="i-lucide-pencil"
                    class="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted/60 pointer-events-none"
                  />
                  <button
                    v-else
                    type="button"
                    class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-amber-600 rounded transition-colors"
                    title="恢复原单价"
                    @click.stop="handleRestoreCardPrice(model)"
                  >
                    <UIcon name="i-lucide-undo-2" class="size-3 text-amber-600 dark:text-amber-400" />
                  </button>
                </div>
                <TkQuotationHistoryPrices v-if="model.title !== '-'" :ctk-mpn="model.title" />
              </div>
              <div v-if="isCardPriceModified(model)" class="text-[10px] text-muted flex items-center gap-1">
                <span class="line-through">原: ¥{{ getCardBasePrice(model) }}</span>
                <span class="text-amber-600 dark:text-amber-400 font-medium">已改</span>
              </div>
            </dd>
            <dd v-else class="min-w-0 truncate font-mono font-semibold tabular-nums" :class="metricClass(metric)">{{ metric.value }}</dd>
          </div>
        </dl>

        <!-- 供在线录入复用：打开行编辑面板 -->
        <div v-if="editable" class="mt-1.5">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            class="min-h-10"
            icon="i-lucide-square-pen"
            @click="emit('edit-line', model.key)"
          >
            编辑本行
          </UButton>
        </div>

        <!-- 其余模板列：默认收起，点标题行展开（手机上别把 21 列一次糊上来） -->
        <dl v-if="isExpanded(model.key)" class="mt-1.5 space-y-0.5 border-t border-app-border/60 pt-1.5 text-xs">
          <div v-for="field in model.detailFields" :key="field.key" class="flex items-start justify-between gap-3">
            <dt class="shrink-0 text-app-muted">{{ field.label }}</dt>
            <dd class="min-w-0 break-all text-right text-app-text" :class="field.mono ? 'font-mono' : ''">{{ field.value }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>

<script setup>
// 手机端明细卡片：审核人核对价格用（桌面继续用 RevoGrid，见 TkQuotationGrid）。
// 展示模型全部来自 @ctk-system/shared 的 buildQuotationLineCardModel，
// 这里只负责渲染与展开收起，不做任何取值/格式化判断。
import { computed, ref } from 'vue'
import { buildQuotationLineCardModels } from '@ctk-system/shared'
import TkQuotationHistoryPrices from './TkQuotationHistoryPrices.vue'

const props = defineProps({
  lines: { type: Array, default: () => [] },
  emptyText: { type: String, default: '暂无明细行' },
  // 供在线录入复用：打开行编辑面板（本组件目前只读渲染，编辑交互由页面接管）
  editable: { type: Boolean, default: false },
  reviewPriceEditable: { type: Boolean, default: false },
})

const emit = defineEmits(['edit-line', 'update:review-price'])

const models = computed(() => buildQuotationLineCardModels(props.lines))
const expandedKeys = ref([])

function isExpanded(key) {
  return expandedKeys.value.includes(key)
}

function toggle(key) {
  expandedKeys.value = isExpanded(key)
    ? expandedKeys.value.filter((item) => item !== key)
    : [...expandedKeys.value, key]
}

/** 奇数个指标时最后一条占满整行（现在 5 条 → 交期单独一行） */
function isTrailingOddMetric(metric, model) {
  const list = model.metrics
  if (list.length % 2 === 0) return false
  return metric.key === list[list.length - 1].key
}

function metricClass(metric) {
  if (metric.zero) return 'text-amber-600 dark:text-amber-400'
  if (metric.missing) return 'text-app-muted'
  return 'text-app-text'
}

function getCardBasePrice(model) {
  const base = model?.originalPriceRmb ?? model?.metrics?.find((m) => m.key === 'originalPriceRmb')?.rawValue
  if (base == null || base === '') return null
  const num = Number(base)
  return Number.isFinite(num) ? (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2) : String(base)
}

function isCardPriceModified(model) {
  if (!model) return false
  const base = getCardBasePrice(model)
  if (base == null || model.reviewPriceRmb == null || model.reviewPriceRmb === '') return false
  const b = Number(base)
  const r = Number(model.reviewPriceRmb)
  if (!Number.isFinite(b) || !Number.isFinite(r)) return false
  return Math.abs(b - r) > 0.0001
}

function handleRestoreCardPrice(model) {
  const base = getCardBasePrice(model)
  if (base != null) {
    emit('update:review-price', {
      id: model.key.startsWith('id:') ? Number(model.key.slice(3)) : null,
      lineNo: model.lineNo,
      priceRmb: base,
    })
  }
}
</script>

<style scoped>
.quotation-line-cards :deep(input[type="number"]::-webkit-outer-spin-button),
.quotation-line-cards :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none !important;
  margin: 0 !important;
}

.quotation-line-cards :deep(input[type="number"]) {
  -moz-appearance: textfield !important;
  appearance: textfield !important;
}
</style>
