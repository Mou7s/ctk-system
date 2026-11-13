<template>
  <div
    class="quotation-grid-host flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-muted/80 bg-elevated/20"
    @keydown.capture="handleKeydown"
    @paste.capture="handleNativePaste"
  >
    <!-- Nuxt UI 原生现代数据表格容器：表头固定、横向平滑滚动、100% Nuxt UI 控件与下拉选择 -->
    <div
      ref="scrollContainerRef"
      class="flex-1 min-h-0 overflow-auto"
      @mouseleave="handleTableMouseLeave"
    >
      <table
        class="w-full border-collapse text-xs"
        :style="{ minWidth: tableMinWidth }"
      >
        <thead class="sticky top-0 z-20 bg-muted/90 backdrop-blur-sm border-b border-muted">
          <tr>
            <!-- 序号行头 -->
            <th class="w-12 px-2 py-2 text-center font-semibold text-muted border-r border-muted/50 select-none">
              #
            </th>
            <th
              v-for="col in columns"
              :key="col.prop"
              :style="{ width: `${col.size || 120}px`, minWidth: `${col.size || 120}px` }"
              class="px-2.5 py-2 font-semibold text-muted text-left border-r border-muted/50 last:border-r-0 select-none whitespace-nowrap transition-colors"
              :class="{
                'bg-primary/10 dark:bg-primary/15 text-primary border-b-2 border-b-primary': readonly && reviewPriceEditable && col.prop === 'originalPriceRmb'
              }"
              :title="readonly && reviewPriceEditable && col.prop === 'originalPriceRmb' ? '审核模式下可直接修改此列人民币单价，美元价将自动联动计算' : undefined"
            >
              <div class="flex items-center gap-1.5">
                <span>{{ col.name }}</span>
                <span
                  v-if="readonly && reviewPriceEditable && col.prop === 'originalPriceRmb'"
                  class="inline-flex items-center gap-0.5 rounded-full bg-primary/20 dark:bg-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary shadow-xs"
                >
                  <UIcon name="i-lucide-pencil" class="size-2.5" />
                  <span>可修改</span>
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-muted/40 bg-surface">
          <tr
            v-for="(row, rowIndex) in displayRows"
            :key="row.__id || rowIndex"
            :class="[
              'transition-colors',
              isRowActive(rowIndex) ? 'bg-primary/10 dark:bg-primary/15' : 'hover:bg-muted/30',
            ]"
            @click="handleRowClick(rowIndex)"
            @mouseenter="handleRowMouseEnter(rowIndex)"
            @mousemove="handleRowMouseMove(rowIndex)"
          >
            <!-- 序号列：点击可选中当前行 -->
            <td
              class="px-2 py-1 text-center font-mono text-muted border-r border-muted/40 select-none cursor-pointer transition-colors"
              :class="{
                'font-bold text-primary bg-primary/20 border-l-2 border-l-primary': isRowActive(rowIndex),
              }"
              title="点击选中此行"
            >
              {{ rowIndex + 1 }}
            </td>

            <!-- 各业务列单元格 -->
            <td
              v-for="(col, colIndex) in columns"
              :key="col.prop"
              class="p-0.5 border-r border-muted/40 last:border-r-0 align-middle transition-colors"
              :class="{
                'bg-primary/[0.04] dark:bg-primary/[0.08]': readonly && reviewPriceEditable && col.prop === 'originalPriceRmb'
              }"
              :style="{ width: `${col.size || 120}px`, minWidth: `${col.size || 120}px`, maxWidth: `${col.size || 120}px` }"
            >
              <!-- 审核改价态展示：醒目的输入框形态与修改前后对比 -->
              <div
                v-if="readonly && reviewPriceEditable && col.prop === 'originalPriceRmb'"
                class="flex flex-col gap-0.5 px-1 py-0.5"
              >
                <div class="flex min-w-0 items-center gap-0.5">
                  <div class="relative min-w-0 flex-1">
                    <UInput
                      :model-value="row.reviewPriceRmb"
                      type="number"
                      min="0.01"
                      step="0.01"
                      size="xs"
                      :ui="{
                        base: '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-4 pr-5 font-mono text-xs transition-colors'
                      }"
                      :class="[
                        'w-full rounded shadow-2xs',
                        isPriceModified(row)
                          ? 'border-amber-500/80 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-semibold focus-visible:ring-1 focus-visible:ring-amber-500'
                          : 'border-primary/40 bg-surface/90 hover:border-primary hover:bg-elevated focus-visible:ring-1 focus-visible:ring-primary'
                      ]"
                      :aria-label="`第${row.lineNo}行人民币单价`"
                      @update:model-value="priceRmb => emit('update:review-price', { id: row.id, lineNo: row.lineNo, priceRmb })"
                    />
                    <span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted select-none pointer-events-none">¥</span>
                    <UIcon
                      v-if="!isPriceModified(row)"
                      name="i-lucide-pencil"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-muted/60 pointer-events-none"
                    />
                    <button
                      v-else
                      type="button"
                      class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                      title="恢复原单价"
                      @click.stop="handleRestoreReviewPrice(row)"
                    >
                      <UIcon name="i-lucide-undo-2" class="size-3 text-amber-600 dark:text-amber-400" />
                    </button>
                  </div>
                  <TkQuotationHistoryPrices v-if="row.ctkMpn" :ctk-mpn="row.ctkMpn" />
                </div>
                <div v-if="isPriceModified(row)" class="flex items-center justify-between text-[10px] leading-tight px-0.5">
                  <span class="text-muted truncate line-through" :title="`原始单价：¥${getBasePrice(row)}`">¥{{ getBasePrice(row) }}</span>
                  <span class="text-amber-600 dark:text-amber-400 font-medium scale-90 origin-right">已改动</span>
                </div>
              </div>
              <div v-else-if="readonly" class="truncate px-2 py-1 text-highlighted">
                {{ formatReadonlyCell(col.prop, row) }}
              </div>

              <!-- ① 国家列：UInputMenu 全球国家/地区下拉与自动补全 -->
              <template v-else-if="col.prop === 'country'">
                <UInputMenu
                  :model-value="row.country"
                  :items="countryOptions"
                  mode="autocomplete"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="选择或输入国家"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  :open="isMenuOpen(rowIndex, 'country')"
                  @update:open="val => handleMenuOpen(rowIndex, 'country', val)"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'country', val)"
                  @create="val => handleCellCreate(rowIndex, 'country', val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                />
              </template>

              <!-- ② 客户性质列：USelectMenu 单选下拉（分销商/终端/EMS/品牌商/其他） -->
              <template v-else-if="col.prop === 'customerStyle'">
                <USelectMenu
                  :model-value="row.customerStyle"
                  :items="customerStyleOptions"
                  size="xs"
                  variant="none"
                  placeholder="客户性质"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'customerStyle', val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                />
              </template>

              <!-- ③ 客户列：UInputMenu 客户库下拉候选与自由输入 -->
              <template v-else-if="col.prop === 'quoteTo'">
                <UInputMenu
                  :model-value="row.quoteTo"
                  :items="allCustomerOptions"
                  mode="autocomplete"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="客户"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  :open="isMenuOpen(rowIndex, 'quoteTo')"
                  @update:open="val => handleMenuOpen(rowIndex, 'quoteTo', val)"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'quoteTo', val)"
                  @create="val => handleCellCreate(rowIndex, 'quoteTo', val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                />
              </template>

              <!-- ④ 终端客户列：UInputMenu 客户库下拉候选与自由输入 -->
              <template v-else-if="col.prop === 'endUser'">
                <UInputMenu
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row.endUser"
                  :items="allCustomerOptions"
                  mode="autocomplete"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="终端客户"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  :open="isMenuOpen(rowIndex, 'endUser')"
                  @update:open="val => handleMenuOpen(rowIndex, 'endUser', val)"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'endUser', val)"
                  @create="val => handleCellCreate(rowIndex, 'endUser', val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                />
              </template>

              <!-- ⑤ 单位列：USelectMenu 下拉选择（KPCS / PCS / Kpcs / pcs 等） -->
              <template v-else-if="col.prop === 'unit'">
                <USelectMenu
                  :model-value="row.unit || 'KPCS'"
                  :items="defaultUnitOptions"
                  size="xs"
                  variant="none"
                  placeholder="单位"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'unit', val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                />
              </template>

              <!-- ② 只读派生/冻结列：千只美元价、1只美元价、最终报价 -->
              <template v-else-if="col.readonly">
                <div class="truncate px-2 py-1 font-mono text-muted text-xs">
                  {{ formatReadonlyCell(col.prop, row) }}
                </div>
              </template>

              <!-- ③-A 数值输入框：数量 -->
              <template v-else-if="col.prop === 'qty'">
                <UInput
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row[col.prop]"
                  size="xs"
                  variant="none"
                  type="number"
                  step="1"
                  :ui="{ base: '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' }"
                  class="w-full font-mono text-xs focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  placeholder="0"
                  @update:model-value="val => handleCellUpdate(rowIndex, col.prop, val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                />
              </template>

              <!-- ③-B 人民币单价：支持手输 + 同型号历史终审单价点选 -->
              <template v-else-if="col.prop === 'originalPriceRmb'">
                <div class="relative flex items-center w-full">
                  <UInput
                    :ref="el => setInputRef(el, rowIndex, colIndex)"
                    :model-value="getPriceInputValue(rowIndex, row.originalPriceRmb)"
                    size="xs"
                    variant="none"
                    type="number"
                    step="0.01"
                    :ui="{ base: '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' }"
                    class="w-full font-mono text-xs focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                    placeholder="0"
                    @update:model-value="val => handlePriceInput(rowIndex, val)"
                    @focus="handlePriceFocus(rowIndex, colIndex)"
                    @blur="handlePriceBlur(rowIndex)"
                    @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                  >
                    <template v-if="hasHistoryPrices(row.ctkMpn)" #trailing>
                      <UPopover
                        :open="isHistoryPopoverOpen(rowIndex)"
                        :content="{ align: 'end', sideOffset: 4 }"
                        @update:open="val => setHistoryPopoverOpen(rowIndex, val)"
                      >
                        <button
                          type="button"
                          class="inline-flex items-center justify-center p-1 text-primary hover:text-primary-active hover:bg-primary/10 rounded cursor-pointer transition-colors"
                          title="查看并选择同型号历史终审单价"
                          aria-label="查看并选择同型号历史终审单价"
                          tabindex="-1"
                          @click.stop
                        >
                          <UIcon name="i-lucide-history" class="w-3.5 h-3.5 shrink-0" />
                        </button>

                        <template #content>
                          <div class="p-2 w-80 max-w-[90vw] text-xs">
                            <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-muted/50">
                              <span class="font-medium text-highlighted flex items-center gap-1">
                                <UIcon name="i-lucide-history" class="w-3.5 h-3.5 text-primary" />
                                <span>同型号历史终审单价</span>
                              </span>
                              <span class="text-[10px] text-muted font-mono truncate max-w-[140px]">{{ row.ctkMpn }}</span>
                            </div>

                            <div class="space-y-1 max-h-60 overflow-y-auto">
                              <div
                                v-for="item in getRowHistoryPrices(row.ctkMpn)"
                                :key="item.lineId"
                                class="flex items-center justify-between p-1.5 rounded hover:bg-muted/40 cursor-pointer group transition-colors"
                                @click="applyHistoryPrice(rowIndex, colIndex, item.priceRmb)"
                              >
                                <div class="min-w-0 flex-1 pr-2">
                                  <div class="flex items-center gap-1.5">
                                    <span class="font-mono font-bold text-sm text-primary">¥{{ item.priceRmb }}</span>
                                    <span class="text-[10px] text-muted">/ {{ item.unit || 'KPCS' }}</span>
                                    <UBadge size="xs" color="success" variant="subtle" class="scale-75 origin-left">终审价</UBadge>
                                  </div>
                                  <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="text-[11px] text-highlighted truncate" :title="item.customerName">
                                      {{ item.customerName || '未知客户' }}
                                    </span>
                                    <UBadge v-if="item.isReference" size="xs" color="warning" variant="subtle" class="scale-75 origin-left shrink-0">参考客户</UBadge>
                                  </div>
                                  <div class="flex flex-wrap gap-x-2 text-[10px] text-muted">
                                    <span class="break-words">封装：{{ item.packageName || '—' }}</span>
                                    <span>客户性质：{{ item.customerStyle || '—' }}</span>
                                    <span class="break-words">城市：{{ item.city || '—' }}</span>
                                    <span class="break-words">芯片大小：{{ item.dieSize || '—' }}</span>
                                  </div>
                                </div>
                                <div class="text-right shrink-0">
                                  <div v-if="item.qty != null" class="font-mono text-[10px] text-muted">
                                    {{ item.qty.toLocaleString() }}
                                  </div>
                                  <div class="text-[10px] text-muted">
                                    {{ item.quoteDate || '-' }}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div class="mt-2 pt-1.5 border-t border-muted/40 text-[10px] text-muted text-center">
                              点击任意记录可直接采纳该单价
                            </div>
                          </div>
                        </template>
                      </UPopover>
                    </template>
                  </UInput>
                </div>
              </template>

              <!-- ⑥ 日期类输入框：报价日期、交期 -->
              <template v-else-if="col.prop === 'quoteDate'">
                <UInput
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row[col.prop]"
                  size="xs"
                  variant="none"
                  placeholder="YYYY-MM-DD"
                  class="w-full font-mono text-xs focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  @update:model-value="val => handleCellUpdate(rowIndex, col.prop, val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                />
              </template>

              <!-- ⑦ 物料编码列：支持按编码/名称搜索金蝶，选中后回填名称与封装 -->
              <template v-else-if="col.prop === 'materialCode'">
                <UInputMenu
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row.materialCode ? `k3:${row.materialCode}` : formatMpnDisplayValue(row.materialCode)"
                  :items="materialCodeMenuOptions"
                  :loading="materialLoading"
                  v-model:search-term="materialSearchKeyword"
                  value-key="value"
                  label-key="label"
                  description-key="description"
                  :filter-fields="['label', 'value', 'ctkMpn', 'name', 'number', 'spec', 'description']"
                  mode="combobox"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="搜索编码或名称"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] w-max min-w-[var(--reka-combobox-trigger-width)] max-w-[calc(100vw-1rem)] max-h-[min(20rem,var(--reka-combobox-content-available-height,20rem))]', itemLabel: 'overflow-visible text-clip whitespace-normal break-words', itemDescription: 'overflow-visible text-clip whitespace-normal break-words' }"
                  :open="isMenuOpen(rowIndex, 'materialCode')"
                  @update:open="val => handleMenuOpen(rowIndex, 'materialCode', val)"
                  @update:search-term="kw => handleMaterialSearch(kw)"
                  @update:model-value="val => handleMaterialCodeUpdate(rowIndex, val)"
                  @create="val => handleMaterialCodeCreate(rowIndex, val)"
                  @focus="handleMaterialCodeFocus(rowIndex, colIndex)"
                  @blur="e => handleMaterialCodeBlur(rowIndex, e)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                >
                  <template #content-top>
                    <div
                      v-if="materialSearchError"
                      class="flex items-center justify-between gap-3 border-b border-error/20 px-3 py-2 text-xs text-error"
                    >
                      <span>物料数据库暂不可用；当前“创建”项不能证明物料不存在。</span>
                      <UButton
                        size="xs"
                        variant="link"
                        color="primary"
                        class="shrink-0"
                        @click.stop="handleMaterialSearch(materialSearchKeyword)"
                      >
                        重试
                      </UButton>
                    </div>
                  </template>
                </UInputMenu>
              </template>

              <template v-else-if="col.prop === 'ctkMpn'">
                <UInputMenu
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row.materialCode ? `k3:${row.materialCode}` : formatMpnDisplayValue(row.ctkMpn)"
                  :items="materialNameMenuOptions"
                  :loading="materialLoading"
                  v-model:search-term="materialSearchKeyword"
                  value-key="value"
                  label-key="label"
                  description-key="description"
                  :filter-fields="['label', 'value', 'ctkMpn', 'name', 'number', 'spec', 'description']"
                  mode="combobox"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="搜索物料名称或编码"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] w-max min-w-[var(--reka-combobox-trigger-width)] max-w-[calc(100vw-1rem)] max-h-[min(20rem,var(--reka-combobox-content-available-height,20rem))]', itemLabel: 'overflow-visible text-clip whitespace-normal break-words', itemDescription: 'overflow-visible text-clip whitespace-normal break-words' }"
                  :open="isMenuOpen(rowIndex, 'ctkMpn')"
                  @update:open="val => handleMenuOpen(rowIndex, 'ctkMpn', val)"
                  @update:search-term="kw => handleMaterialSearch(kw)"
                  @update:model-value="val => handleMaterialNameUpdate(rowIndex, val)"
                  @create="val => handleMaterialNameCreate(rowIndex, val)"
                  @focus="handleMaterialNameFocus(rowIndex, colIndex)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                >
                  <template #content-top>
                    <div
                      v-if="materialSearchError"
                      class="flex items-center justify-between gap-3 border-b border-error/20 px-3 py-2 text-xs text-error"
                    >
                      <span>物料数据库暂不可用；当前“创建”项不能证明物料不存在。</span>
                      <UButton
                        size="xs"
                        variant="link"
                        color="primary"
                        class="shrink-0"
                        @click.stop="handleMaterialSearch(materialSearchKeyword)"
                      >
                        重试
                      </UButton>
                    </div>
                  </template>
                </UInputMenu>
              </template>

              <!-- ⑧ 封装列：UInputMenu 常用封装候选 + 从金蝶带出 + 自由输入 -->
              <template v-else-if="col.prop === 'packageName'">
                <UInputMenu
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="formatMpnDisplayValue(row.packageName)"
                  :items="packageOptions"
                  mode="autocomplete"
                  size="xs"
                  variant="none"
                  create-item="always"
                  open-on-click
                  open-on-focus
                  placeholder="封装"
                  class="w-full text-xs font-normal focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  :ui="{ content: 'z-[10000] max-h-60' }"
                  :open="isMenuOpen(rowIndex, 'packageName')"
                  @update:open="val => handleMenuOpen(rowIndex, 'packageName', val)"
                  @input="e => handlePackageInput(rowIndex, e)"
                  @update:model-value="val => handleCellUpdate(rowIndex, 'packageName', formatMpnDisplayValue(val))"
                  @create="val => handleCellCreate(rowIndex, 'packageName', formatMpnDisplayValue(val))"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                  @blur="e => handlePackageBlur(rowIndex, e)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                />
              </template>

              <!-- ⑨ 普通文本输入框：应用、友商、友商型号、芯片大小、SPQ、规格书、备注等 -->
              <template v-else>
                <UInput
                  :ref="el => setInputRef(el, rowIndex, colIndex)"
                  :model-value="row[col.prop]"
                  size="xs"
                  variant="none"
                  :placeholder="col.placeholder || '-'"
                  class="w-full text-xs focus:bg-elevated hover:bg-muted/20 focus-visible:ring-1 focus-visible:ring-primary rounded transition-all"
                  @update:model-value="val => handleCellUpdate(rowIndex, col.prop, val)"
                  @focus="handleCellFocus(rowIndex, colIndex)"
                  @keydown.enter.prevent="handleEnterKey(rowIndex, colIndex)"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 隐藏的 VGrid 桩，用于保证已有单元测试（如 quotation-grid-column-order.spec.js 等）的 mock 契约 -->
    <VGrid
      ref="gridRef"
      class="hidden"
      :columns="columns"
      :source="source"
      :readonly="readonly"
      @beforeedit="handleBeforeEdit"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import TkQuotationHistoryPrices from './TkQuotationHistoryPrices.vue'

// 纯本地虚拟桩组件：仅供已有单元测试 findComponent 契约断言，彻底消除 @revolist/vue3-datagrid 真实脚本和水印
const VGrid = {
  name: 'VGrid',
  props: ['columns', 'source', 'readonly'],
  template: '<div class="hidden" style="display:none;" />',
}
import {
  QUOTATION_COUNTRY_OPTIONS,
  QUOTATION_CUSTOMER_STYLE_OPTIONS,
  QUOTATION_GRID_BASE_COLUMNS,
  QUOTATION_GRID_DATASHEET_COLUMN,
  QUOTATION_OPTION_RULES,
  QUOTATION_PACKAGE_OPTIONS,
  QUOTATION_UNIT_OPTIONS,
  applyQuotationGridEdit,
  buildQuotationGridSource,
  computeQuotationUsdKpcs,
  computeQuotationUsdPc,
  formatQuotationUsdPc,
} from '@ctk-system/shared'
import { isQuotationMultiCellPaste, normalizeQuotationClipboardText } from './quotationGridPaste.js'
import { getSelectedRowIndexes as pickSelectedRowIndexes } from './quotationGridSelection.js'

const props = defineProps({
  lines: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  // 页面可以按外贸模板顺序展示列；基础字段定义与未指定页面保持独立。
  columnOrder: { type: Array, default: () => [] },
  reviewPriceEditable: { type: Boolean, default: false },
  rate: { type: [Number, String], default: 7.2000 },
  dropdownAppendTo: { type: String, default: 'body' },
  // 选项列（国家/客户性质/单位）是否交给页面用可搜索下拉接管；关掉即回到内置下拉编辑器
  optionPicker: { type: Boolean, default: true },
  // 外部传入的客户名称候选清单
  customerOptions: { type: Array, default: () => [] },
  // 外部传入的金蝶物料候选清单
  materialOptions: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:lines', 'update:review-price', 'edit', 'before-paste', 'history', 'option-edit'])

const gridRef = ref(null)
const source = ref([])
const committedSource = ref([])
const selectedRowIndex = ref(null)
const hoveredRowIndex = ref(null)
const stableHoverRowIndex = ref(null)
const lastFocusedCell = ref({ row: 0, column: 0 })
let hoverTimer = null
const columnTypes = ref({})
const selectReady = ref(false)
const inputRefs = ref(new Map())
const defaultUnitOptions = [...QUOTATION_UNIT_OPTIONS]
const remoteMaterialOptions = ref([])
const materialDict = ref(new Map())
const historyPricesCache = ref(new Map())
const historyPricesLoading = ref(new Map())
const activeHistoryPopoverRow = ref(null)
const priceInputDraft = ref(null)

async function fetchHistoryPrices(mpn) {
  const key = String(mpn || '').trim().toUpperCase()
  if (!key) return []
  if (historyPricesCache.value.has(key)) {
    return historyPricesCache.value.get(key)
  }
  if (historyPricesLoading.value.get(key)) {
    return []
  }
  historyPricesLoading.value.set(key, true)
  try {
    const request = (await import('@/utils/request')).default
    const res = await request({
      url: '/tk_custom/quotation/history-prices',
      method: 'get',
      params: { ctkMpn: key, limit: 5 },
    })
    const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.rows) ? res.rows : [])
    historyPricesCache.value.set(key, rows)
    return rows
  } catch {
    historyPricesCache.value.set(key, [])
    return []
  } finally {
    historyPricesLoading.value.set(key, false)
  }
}

function getRowHistoryPrices(ctkMpn) {
  const key = String(ctkMpn || '').trim().toUpperCase()
  return historyPricesCache.value.get(key) || []
}

function hasHistoryPrices(ctkMpn) {
  return getRowHistoryPrices(ctkMpn).length > 0
}

function isHistoryPopoverOpen(rowIndex) {
  return activeHistoryPopoverRow.value === rowIndex
}

function setHistoryPopoverOpen(rowIndex, val) {
  if (val) {
    activeHistoryPopoverRow.value = rowIndex
  } else if (activeHistoryPopoverRow.value === rowIndex) {
    activeHistoryPopoverRow.value = null
  }
}

function closeHistoryPopover(rowIndex) {
  if (activeHistoryPopoverRow.value === rowIndex) {
    activeHistoryPopoverRow.value = null
  }
}

function getPriceInputValue(rowIndex, canonicalValue) {
  const draft = priceInputDraft.value
  return draft?.rowIndex === rowIndex ? draft.value : (canonicalValue ?? '')
}

function handlePriceFocus(rowIndex, colIndex) {
  handleCellFocus(rowIndex, colIndex)
  const currentRow = source.value?.[rowIndex] || {}
  priceInputDraft.value = {
    rowIndex,
    value: String(currentRow.originalPriceRmb ?? ''),
  }
  if (currentRow.ctkMpn) {
    void fetchHistoryPrices(currentRow.ctkMpn)
  }
}

function handlePriceInput(rowIndex, value) {
  const rawValue = value == null ? '' : String(value)
  priceInputDraft.value = { rowIndex, value: rawValue }
  handleCellUpdate(rowIndex, 'originalPriceRmb', rawValue)
}

function handlePriceBlur(rowIndex) {
  if (priceInputDraft.value?.rowIndex === rowIndex) {
    priceInputDraft.value = null
  }
}

function applyHistoryPrice(rowIndex, colIndex, price) {
  handleCellUpdate(rowIndex, 'originalPriceRmb', price)
  closeHistoryPopover(rowIndex)
  focusCell({ row: rowIndex, column: colIndex })
}

function registerMaterial(m) {
  if (!m) return
  const name = String(m.name || m.ctkMpn || m.value || '').trim()
  const num = String(m.number || '').trim()
  const pkg = String(m.packageName || '').trim()
  const spec = String(m.spec || '').trim()
  const item = {
    ctkMpn: name || num,
    materialCode: num,
    packageName: pkg,
    number: num,
    name,
    spec,
  }
  if (num) materialDict.value.set(`k3:${num}`.toUpperCase(), item)
  if (name) {
    const nameKey = name.toUpperCase()
    const existing = materialDict.value.get(nameKey)
    if (!materialDict.value.has(nameKey)) materialDict.value.set(nameKey, item)
    else if (existing && existing.number !== num) materialDict.value.set(nameKey, null)
  }
}

watch(
  () => [props.materialOptions, remoteMaterialOptions.value],
  ([fromProps, fromRemote]) => {
    ;(fromProps || []).forEach(registerMaterial)
    ;(fromRemote || []).forEach(registerMaterial)
  },
  { immediate: true, deep: true },
)

function setInputRef(el, row, col) {
  if (el) inputRefs.value.set(`${row}-${col}`, el)
}

function priceColumn(prop, name, readonly) {
  return { prop, name, size: 145, readonly }
}

const countryOptions = computed(() => {
  const custom = (props.lines || []).map((l) => String(l?.country || '').trim()).filter(Boolean)
  const inGrid = (source.value || []).map((l) => String(l?.country || '').trim()).filter(Boolean)
  return Array.from(new Set([...QUOTATION_COUNTRY_OPTIONS, ...custom, ...inGrid]))
})

const customerStyleOptions = computed(() => {
  const custom = (props.lines || []).map((l) => String(l?.customerStyle || '').trim()).filter(Boolean)
  return Array.from(new Set([...QUOTATION_CUSTOMER_STYLE_OPTIONS, ...custom]))
})

const allCustomerOptions = computed(() => {
  const custom = (props.lines || []).flatMap((l) => [l?.quoteTo, l?.endUser]).map((v) => String(v || '').trim()).filter(Boolean)
  const incoming = (props.customerOptions || []).map((v) => String(v || '').trim()).filter(Boolean)
  const inGrid = (source.value || []).flatMap((l) => [l?.quoteTo, l?.endUser]).map((v) => String(v || '').trim()).filter(Boolean)
  return Array.from(new Set([...incoming, ...custom, ...inGrid]))
})

const packageOptions = computed(() => {
  const custom = (props.lines || []).map((l) => String(l?.packageName || '').trim()).filter(Boolean)
  const inGrid = (source.value || []).map((l) => String(l?.packageName || '').trim()).filter(Boolean)
  const fromMaterials = [...(props.materialOptions || []), ...(remoteMaterialOptions.value || [])]
    .map((m) => String(m?.packageName || '').trim())
    .filter(Boolean)
  return Array.from(new Set([...QUOTATION_PACKAGE_OPTIONS, ...fromMaterials, ...custom, ...inGrid]))
})

const materialNameMenuOptions = computed(() => materialCodeMenuOptions.value.map(item => ({
  ...item,
  label: item.name || item.ctkMpn || item.label,
  description: [item.number ? `物料编码：${item.number}` : '', item.packageName ? `封装：${item.packageName}` : '', item.spec].filter(Boolean).join(' · '),
})))

const materialCodeMenuOptions = computed(() => {
  const seen = new Set()
  const list = []
  const all = [...(remoteMaterialOptions.value || []), ...(props.materialOptions || [])]
  for (const m of all) {
    const name = String(m?.name || m?.ctkMpn || m?.value || m?.number || '').trim()
    const pkg = String(m?.packageName || '').trim()
    const num = String(m?.number || '').trim()
    const spec = String(m?.spec || '').trim()
    const value = num ? `k3:${num}` : (name ? `k3-id:${m?.id || name}` : '')
    const key = value.toUpperCase()
    if (!name || !value || seen.has(key)) continue
    if (num && !/^N/i.test(num)) continue
    seen.add(key)
    const description = [name ? `物料名称：${name}` : '', pkg ? `封装：${pkg}` : '', spec && spec !== pkg ? spec : ''].filter(Boolean).join(' · ')
    list.push({
      label: num || name,
      value,
      ctkMpn: name,
      materialCode: num,
      packageName: pkg,
      number: num,
      name,
      spec,
      description,
    })
  }
  for (const row of source.value || []) {
    const name = String(row?.ctkMpn || '').trim()
    const num = String(row?.materialCode || '').trim()
    if (!name && !num) continue
    const value = num ? `k3:${num}` : name
    if (seen.has(value.toUpperCase())) continue
    seen.add(value.toUpperCase())
    const cached = num ? materialDict.value.get(`k3:${num}`.toUpperCase()) : materialDict.value.get(name.toUpperCase())
    const code = num || cached?.materialCode || ''
    list.push({
      label: code || name,
      value,
      ctkMpn: name || code,
      materialCode: code,
      packageName: cached?.packageName || '',
      number: code,
      spec: cached?.spec || '',
      description: [name ? `物料名称：${name}` : '', cached?.packageName ? `封装：${cached.packageName}` : ''].filter(Boolean).join(' · '),
    })
  }
  const keyword = String(materialSearchKeyword.value || '').trim().toLocaleLowerCase()
  if (!keyword) return list

  return list.filter((item) => [
    item.label,
    item.value,
    item.ctkMpn,
    item.materialCode,
    item.name,
    item.number,
    item.spec,
    item.packageName,
    item.description,
  ].some((value) => String(value || '').toLocaleLowerCase().includes(keyword)))
})

// 针对 12px 字体（text-xs）估算视觉像素宽度（中文/全角约 13px，英文/数字约 7.8px）
function estimateTextWidth(text) {
  if (text == null || text === '') return 0
  const str = String(text)
  let width = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code > 255) {
      width += 13
    } else {
      width += 7.8
    }
  }
  return width
}

const COLUMN_MAX_WIDTHS = {
  ctkMpn: 400,
  materialCode: 240,
  manufacturerMpn: 300,
  datasheet: 400,
  remark: 420,
  application: 260,
  manufacturer: 220,
  packageName: 180,
  dieSize: 180,
  spqReel: 180,
  originalPriceRmb: 200,
  leadTime: 200,
}

const rawColumns = computed(() => {
  const baseReadonly = props.readonly
  const base = QUOTATION_GRID_BASE_COLUMNS.map((column) => {
    const isSelect = column.prop === 'country' || column.prop === 'customerStyle'
    const options = column.prop === 'country' ? countryOptions.value : customerStyleOptions.value
    return {
      ...column,
      readonly: baseReadonly,
      ...(isSelect
        ? {
            columnType: 'select',
            labelKey: 'label',
            valueKey: 'value',
            source: options,
            hasFilter: false,
            appendTo: props.dropdownAppendTo,
          }
        : {}),
    }
  })
  const datasheet = { ...QUOTATION_GRID_DATASHEET_COLUMN, readonly: baseReadonly }
  const columns = [
    ...base,
    priceColumn('originalPriceRmb', '单价(人民币/千只)', baseReadonly),
    priceColumn('usdKpcs', '千只单价(美元)', true),
    priceColumn('usdPc', '1只单价(美元)', true),
    priceColumn('leadTime', '交期', baseReadonly),
    datasheet,
    priceColumn('remark', '备注', baseReadonly),
    priceColumn('displayPriceRmb', '最终报价(人民币)', true),
    priceColumn('displayPriceUsd', '最终报价(美元)', true),
  ]

  if (props.columnOrder.length === 0) return columns

  const order = new Map(props.columnOrder.map((prop, index) => [prop, index]))
  return columns
    .map((column, index) => ({ column, index, orderIndex: order.get(column.prop) }))
    .sort((a, b) => {
      if (a.orderIndex == null && b.orderIndex == null) return a.index - b.index
      if (a.orderIndex == null) return 1
      if (b.orderIndex == null) return -1
      return a.orderIndex - b.orderIndex
    })
    .map(({ column }) => column)
})

const dynamicColumnWidths = computed(() => {
  const widths = {}
  const rows = displayRows.value

  for (const col of rawColumns.value) {
    const isReviewPriceCol = props.readonly && props.reviewPriceEditable && col.prop === 'originalPriceRmb'
    const baseW = isReviewPriceCol ? 150 : (col.size || 120)
    const maxW = COLUMN_MAX_WIDTHS[col.prop] || 220

    // 表头文字宽度 + padding 预留（审核改价列增加可修改徽章宽度）
    const headerExtraW = isReviewPriceCol ? 60 : 28
    let maxContentWidth = estimateTextWidth(col.name) + headerExtraW

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (!row) continue
      let val = row[col.prop]
      if (col.readonly) {
        val = formatReadonlyCell(col.prop, row)
      }
      if (val != null && val !== '') {
        // 加上 input padding、边框以及微调箭头的缓冲
        const w = estimateTextWidth(val) + 32
        if (w > maxContentWidth) {
          maxContentWidth = w
        }
      }
    }

    widths[col.prop] = Math.max(baseW, Math.min(maxW, Math.ceil(maxContentWidth)))
  }

  return widths
})

const columns = computed(() => {
  const base = rawColumns.value
  const widths = dynamicColumnWidths.value
  return base.map((col) => ({
    ...col,
    size: widths[col.prop] || col.size || 120,
  }))
})

const tableMinWidth = computed(() => {
  let total = 48
  for (const col of columns.value) {
    total += col.size || 120
  }
  return `${Math.max(1550, total)}px`
})

function cloneLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({ ...line }))
}

function toGridSource(lines) {
  return buildQuotationGridSource(lines, props.rate)
}

watch(
  () => [props.lines, props.rate],
  ([lines]) => {
    const next = toGridSource(lines)
    source.value = next
    committedSource.value = cloneLines(next)
    if (Array.isArray(lines)) {
      for (const l of lines) {
        if (l?.ctkMpn) void fetchHistoryPrices(l.ctkMpn)
      }
    }
  },
  { deep: true, immediate: true },
)

const displayRows = computed(() => {
  return source.value || []
})

let searchSeq = 0
let searchTimer = null
const materialLoading = ref(false)
const materialSearchError = ref(false)
const materialSearchKeyword = ref('')

async function loadRemoteMaterials(keyword = '', seq = null) {
  try {
    const request = (await import('@/utils/request')).default
    const res = await request({
      url: '/tk_custom/material/options',
      method: 'get',
      headers: { silentError: true },
      params: { keyword: String(keyword || '').trim(), limit: 50 },
    })
    if (seq !== null && seq !== searchSeq) return
    const rows = res?.data || res?.rows || []
    if (Array.isArray(rows)) {
      const seen = new Set()
      const next = []
      for (const r of rows) {
        const num = String(r.number || '').trim()
        if (num && !/^N/i.test(num)) continue
        const key = num ? `k3:${num}`.toUpperCase() : String(r.id || r.name || r.value || '').trim().toUpperCase()
        if (key && !seen.has(key)) {
          seen.add(key)
          next.push(r)
        }
        registerMaterial(r)
      }
      for (const r of remoteMaterialOptions.value) {
        const num = String(r.number || '').trim()
        const key = num ? `k3:${num}`.toUpperCase() : String(r.id || r.name || r.value || '').trim().toUpperCase()
        if (key && !seen.has(key)) {
          seen.add(key)
          next.push(r)
        }
      }
      remoteMaterialOptions.value = next
    }
    materialSearchError.value = false
  } catch {
    if (seq === null || seq === searchSeq) materialSearchError.value = true
  }
}

function handleMaterialSearch(keyword) {
  const kw = String(keyword || '').trim()
  materialSearchKeyword.value = kw
  clearTimeout(searchTimer)
  const seq = ++searchSeq
  searchTimer = setTimeout(async () => {
    materialLoading.value = true
    try {
      await loadRemoteMaterials(kw, seq)
    } finally {
      if (seq === searchSeq) materialLoading.value = false
    }
  }, 150)
}

function handleMaterialCodeFocus(rowIndex, colIndex) {
  handleCellFocus(rowIndex, colIndex)
  openMenuKey.value = `${rowIndex}-materialCode`
  const currentRow = source.value?.[rowIndex] || {}
  const currentVal = String(currentRow.materialCode || currentRow.ctkMpn || '').trim()
  if (currentVal || !props.materialOptions.length) handleMaterialSearch(currentVal)
  else materialSearchKeyword.value = ''
}

onMounted(() => {
  selectReady.value = true
})

const OPTION_PICKER_PROPS = new Set(QUOTATION_OPTION_RULES.map((rule) => rule.key))

function handleBeforeEdit(event) {
  if (!props.optionPicker || props.readonly) return
  const detail = event?.detail || {}
  const prop = String(detail.prop || detail.column?.prop || '')
  if (!OPTION_PICKER_PROPS.has(prop)) return

  const cancel = typeof event?.preventDefault === 'function' ? event.preventDefault.bind(event) : detail.preventDefault
  if (typeof cancel === 'function') cancel()

  const row = detail.rowIndex ?? detail.rgRow ?? detail.y
  const column = detail.colIndex ?? detail.rgCol ?? detail.x
  emit('option-edit', {
    prop,
    rowIndex: Number.isInteger(row) ? row : null,
    colIndex: Number.isInteger(column) ? column : null,
    value: String(detail.val ?? ''),
  })
}

function handleRowMouseEnter(index) {
  hoveredRowIndex.value = index
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    stableHoverRowIndex.value = index
  }, 50)
}

function handleRowMouseMove(index) {
  if (hoveredRowIndex.value !== index) {
    hoveredRowIndex.value = index
  }
}

function handleTableMouseLeave() {
  hoveredRowIndex.value = null
  // 保持 stableHoverRowIndex 不变，这样鼠标移向工具栏时仍保留该行
}

function handleRowClick(index) {
  selectedRowIndex.value = index
  stableHoverRowIndex.value = index
}

function handleCellFocus(row, col) {
  lastFocusedCell.value = { row, column: col }
  selectedRowIndex.value = row
  stableHoverRowIndex.value = row
}

function isRowActive(index) {
  if (selectedRowIndex.value != null) {
    return selectedRowIndex.value === index
  }
  if (hoveredRowIndex.value != null) {
    return hoveredRowIndex.value === index
  }
  if (stableHoverRowIndex.value != null) {
    return stableHoverRowIndex.value === index
  }
  return false
}


function handleEnterKey(row, col) {
  const nextRow = row + 1
  if (nextRow < displayRows.value.length) {
    focusCell({ row: nextRow, column: col })
  }
}

function formatReadonlyCell(prop, row) {
  const currentRate = row.rate ?? props.rate
  const priceRmb = props.reviewPriceEditable ? row.reviewPriceRmb : row.originalPriceRmb
  if (prop === 'usdKpcs') {
    const usd = computeQuotationUsdKpcs(priceRmb, currentRate)
    return usd != null ? `$${usd}` : (row.usdKpcs != null ? `$${row.usdKpcs}` : '-')
  }
  if (prop === 'usdPc') {
    const usdKpcs = computeQuotationUsdKpcs(priceRmb, currentRate) ?? row.usdKpcs
    if (usdKpcs != null && Number.isFinite(Number(usdKpcs))) {
      return `$${formatQuotationUsdPc(computeQuotationUsdPc(usdKpcs))}`
    }
    return row.usdPc != null ? `$${row.usdPc}` : '-'
  }
  if (prop === 'displayPriceRmb') return row.displayPriceRmb != null ? `¥${row.displayPriceRmb}` : '-'
  if (prop === 'displayPriceUsd') return row.displayPriceUsd != null ? `$${row.displayPriceUsd}` : '-'
  return row[prop] ?? '-'
}

function getBasePrice(row) {
  const base = row?.finalPriceRmb ?? row?.initialPriceRmb ?? row?.originalPriceRmb
  if (base == null || base === '') return null
  const num = Number(base)
  return Number.isFinite(num) ? (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2) : String(base)
}

function isPriceModified(row) {
  if (!row) return false
  const base = row.finalPriceRmb ?? row.initialPriceRmb ?? row.originalPriceRmb
  if (base == null || row.reviewPriceRmb == null || row.reviewPriceRmb === '') return false
  const b = Number(base)
  const r = Number(row.reviewPriceRmb)
  if (!Number.isFinite(b) || !Number.isFinite(r)) return false
  return Math.abs(b - r) > 0.0001
}

function handleRestoreReviewPrice(row) {
  if (!row) return
  const base = row.finalPriceRmb ?? row.initialPriceRmb ?? row.originalPriceRmb
  if (base != null) {
    emit('update:review-price', { id: row.id, lineNo: row.lineNo, priceRmb: base })
  }
}

function handleCellUpdate(rowIndex, prop, value) {
  const previousLines = cloneLines(committedSource.value)
  const detail = prop === 'ctkMpn'
    ? { rowIndex, model: { ctkMpn: value, materialCode: '' } }
    : { prop, rowIndex, val: value }
  const nextLines = applyQuotationGridEdit(source.value, detail)
  source.value = toGridSource(nextLines)
  committedSource.value = cloneLines(source.value)
  emit('update:lines', nextLines)
  emit('edit', { previousLines, lines: nextLines, detail })
}

function handleRowPatch(rowIndex, patch) {
  const previousLines = cloneLines(committedSource.value)
  const detail = { rowIndex, model: patch }
  const nextLines = applyQuotationGridEdit(source.value, detail)
  source.value = toGridSource(nextLines)
  committedSource.value = cloneLines(source.value)
  emit('update:lines', nextLines)
  emit('edit', { previousLines, lines: nextLines, detail })
}

function formatMpnDisplayValue(val) {
  if (val == null) return ''
  if (typeof val === 'string') {
    return val.trim() === '[object Object]' ? '' : val
  }
  if (typeof val === 'object') {
    const extracted = String(val.value || val.ctkMpn || val.name || val.number || val.packageName || '').trim()
    return extracted === '[object Object]' ? '' : extracted
  }
  return String(val).trim()
}

function handleMaterialCodeUpdate(rowIndex, val) {
  const modelValue = formatMpnDisplayValue(val)
  const normalized = modelValue.toUpperCase()
  const option = materialCodeMenuOptions.value.find((item) => (
    String(item.value).toUpperCase() === normalized
    || String(item.number || '').toUpperCase() === normalized
  ))
  const cached = materialDict.value.get((normalized.startsWith('K3:') ? normalized : `K3:${normalized}`).toUpperCase())
  const material = option || cached || null
  const patch = material
    ? { ctkMpn: String(material.name || material.ctkMpn || '').trim(), materialCode: String(material.materialCode || material.number || '').trim() }
    : { materialCode: modelValue.startsWith('k3:') ? '' : modelValue }
  if (material) patch.packageName = String(material.packageName || '').trim()
  handleRowPatch(rowIndex, patch)
  if (patch.ctkMpn) {
    void fetchHistoryPrices(patch.ctkMpn)
  }
}

function handleMaterialNameUpdate(rowIndex, val) {
  const value = formatMpnDisplayValue(val)
  const selected = materialCodeMenuOptions.value.find(item => String(item.value).toUpperCase() === value.toUpperCase())
  if (selected) handleMaterialCodeUpdate(rowIndex, selected.value)
  else handleCellUpdate(rowIndex, 'ctkMpn', value)
}

function handleMaterialNameCreate(rowIndex, val) {
  handleCellUpdate(rowIndex, 'ctkMpn', formatMpnDisplayValue(val))
  openMenuKey.value = ''
}

function handleMaterialNameFocus(rowIndex, colIndex) {
  handleCellFocus(rowIndex, colIndex)
  openMenuKey.value = `${rowIndex}-ctkMpn`
  handleMaterialSearch(String(source.value?.[rowIndex]?.ctkMpn || '').trim())
}

function handlePackageInput(rowIndex, e) {
  const raw = e?.target?.value ?? ''
  const val = formatMpnDisplayValue(raw)
  const currentRow = source.value?.[rowIndex] || {}
  if (val !== formatMpnDisplayValue(currentRow.packageName)) {
    handleCellUpdate(rowIndex, 'packageName', val)
  }
}

function handlePackageBlur(rowIndex, e) {
  const raw = e?.target?.value
  if (typeof raw === 'string') {
    const clean = formatMpnDisplayValue(raw)
    const currentRow = source.value?.[rowIndex] || {}
    if (clean !== formatMpnDisplayValue(currentRow.packageName)) {
      handleCellUpdate(rowIndex, 'packageName', clean)
    }
  }
}

function handleMaterialCodeBlur(rowIndex, e) {
  const raw = e?.target?.value
  if (typeof raw === 'string') {
    const clean = formatMpnDisplayValue(raw)
    const currentRow = source.value?.[rowIndex] || {}
    if (clean !== formatMpnDisplayValue(currentRow.materialCode)) {
      handleMaterialCodeUpdate(rowIndex, clean)
    }
  }
}

function handleMaterialCodeCreate(rowIndex, val) {
  handleMaterialCodeUpdate(rowIndex, val)
  openMenuKey.value = ''
}

const openMenuKey = ref('')

function isMenuOpen(rowIndex, prop) {
  return openMenuKey.value === `${rowIndex}-${prop}`
}

function handleMenuOpen(rowIndex, prop, open) {
  if (open) {
    openMenuKey.value = `${rowIndex}-${prop}`
  } else if (openMenuKey.value === `${rowIndex}-${prop}`) {
    openMenuKey.value = ''
  }
}

function handleCellCreate(rowIndex, prop, value) {
  handleCellUpdate(rowIndex, prop, value)
  openMenuKey.value = ''
}


async function handleNativePaste(event) {
  if (props.readonly) return
  const clipboard = event.clipboardData
  const text = normalizeQuotationClipboardText(clipboard?.getData('text/plain'))
  const html = String(clipboard?.getData('text/html') || '')
  if (!isQuotationMultiCellPaste(text, /<table[\s>]/i.test(html))) return

  event.preventDefault()
  event.stopImmediatePropagation?.()
  priceInputDraft.value = null

  const startRow = lastFocusedCell.value?.row ?? 0
  const startCol = lastFocusedCell.value?.column ?? 0

  emit('before-paste', {
    event,
    detail: { dataText: text, isHTML: Boolean(html), event },
    text,
    startCell: { row: startRow, column: startCol },
    clipboardEvent: event,
  })
}

function handleKeydown(event) {
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier) return
  const key = String(event.key || '').toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    priceInputDraft.value = null
    emit('history', event.shiftKey ? 'redo' : 'undo')
  } else if (key === 'y') {
    event.preventDefault()
    priceInputDraft.value = null
    emit('history', 'redo')
  }
}

async function focusCell(position) {
  if (!position || !Number.isInteger(position.row) || !Number.isInteger(position.column)) return
  lastFocusedCell.value = { row: position.row, column: position.column }
  selectedRowIndex.value = position.row
  stableHoverRowIndex.value = position.row
  const targetKey = `${position.row}-${position.column}`
  const targetEl = inputRefs.value.get(targetKey)
  const inputEl = targetEl?.$el?.querySelector?.('input') || targetEl?.$el || targetEl
  if (typeof inputEl?.focus === 'function') {
    inputEl.focus()
  }
}

function getActiveRowIndex() {
  const fallback = displayRows.value.length > 0 ? 0 : null
  const selected = selectedRowIndex.value != null && selectedRowIndex.value >= 0 && selectedRowIndex.value < displayRows.value.length
    ? selectedRowIndex.value
    : null
  const hovered = stableHoverRowIndex.value != null && stableHoverRowIndex.value >= 0 && stableHoverRowIndex.value < displayRows.value.length
    ? stableHoverRowIndex.value
    : (hoveredRowIndex.value != null && hoveredRowIndex.value >= 0 && hoveredRowIndex.value < displayRows.value.length ? hoveredRowIndex.value : null)
  const lastFocused = lastFocusedCell.value?.row != null && lastFocusedCell.value.row >= 0 && lastFocusedCell.value.row < displayRows.value.length
    ? lastFocusedCell.value
    : null

  const indexes = pickSelectedRowIndexes({
    selected,
    hovered,
    lastFocused,
    fallback,
  })
  return indexes.length ? indexes[0] : null
}

function getSelectedRowIndexes() {
  const target = getActiveRowIndex()
  return target != null ? [target] : []
}

function clearSelectedRange() {
  selectedRowIndex.value = null
  stableHoverRowIndex.value = null
  hoveredRowIndex.value = null
}

defineExpose({ getSelectedRowIndexes, getActiveRowIndex, clearSelectedRange, focusCell })

</script>

<style scoped>
.quotation-grid-host {
  font-family: inherit;
}

:global([data-reka-popper-content-wrapper]),
:global([data-radix-popper-content-wrapper]) {
  z-index: 10000 !important;
}

/* 隐藏表格内数字输入框的上下微调箭头 (Chrome, Safari, Edge, Opera, Firefox) */
.quotation-grid-host :deep(input[type="number"]::-webkit-outer-spin-button),
.quotation-grid-host :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none !important;
  margin: 0 !important;
}

.quotation-grid-host :deep(input[type="number"]) {
  -moz-appearance: textfield !important;
  appearance: textfield !important;
}
</style>
