<template>
  <div class="space-y-3 p-3">
    <article v-for="(line, index) in lines" :key="line.id || line.lineNo || index" class="rounded-lg border border-muted bg-default p-3">
      <div class="flex items-start gap-2">
        <span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted">{{ line.lineNo || index + 1 }}</span>
        <div class="min-w-0 flex-1 space-y-2">
          <div><p class="text-[11px] text-muted">客户物料名称</p><p class="break-words text-sm font-medium text-highlighted">{{ line.customerMaterialName || '—' }}</p></div>
          <div><p class="text-[11px] text-muted">CTK物料名称</p><p class="break-words text-sm font-semibold text-highlighted">{{ line.ctkMpn || '—' }}</p></div>
        </div>
      </div>
      <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-muted pt-3 text-sm">
        <div class="min-w-0"><dt class="text-xs text-muted">封装</dt><dd class="mt-1 break-words">{{ line.packageName || '—' }}</dd></div>
        <div class="min-w-0"><dt class="text-xs text-muted">含税单价（元/PCS）</dt><dd class="mt-1 break-words font-semibold text-primary">¥{{ formatPrice(line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb) }}</dd></div>
        <div class="col-span-2"><dt class="text-xs text-muted">最小包装数（PCS）</dt><dd class="mt-1">{{ line.minPackCount ?? '—' }}</dd></div>
      </dl>
      <p v-if="!domesticQuotationUnit(line.unit)" class="mt-2 text-xs text-warning">历史单位未确认，以上价格与包装数为原值</p>
      <div v-if="reviewStage" class="mt-3 space-y-1.5 border-t border-muted pt-3">
        <label class="block text-xs font-medium" :for="`domestic-review-${line.id || index}`">本次审核价（元/PCS）</label>
        <UInput :id="`domestic-review-${line.id || index}`" :model-value="line.reviewPriceRmb" :disabled="!domesticQuotationUnit(line.unit)" type="number" min="0.00001" step="0.00001" class="w-full" :aria-label="`第${line.lineNo || index + 1}行本次审核价`" @update:model-value="value => emit('review-price', line.id, value)" />
        <p class="text-xs text-muted">原报价 ¥{{ formatPrice(line.originalPriceRmb) }}</p>
      </div>
      <div v-if="line.remark" class="mt-3 border-t border-muted pt-2 text-xs"><span class="text-muted">备注：</span><span class="whitespace-pre-wrap break-words">{{ line.remark }}</span></div>
    </article>
    <p v-if="!lines.length" class="py-8 text-center text-sm text-muted">暂无报价明细</p>
  </div>
</template>

<script setup>
import { domesticQuotationUnit } from '../shared/domesticQuotationUnits.js'
defineProps({ lines: { type: Array, default: () => [] }, reviewStage: { type: String, default: '' }, formatPrice: { type: Function, required: true } })
const emit = defineEmits(['review-price'])
</script>
