<template>
  <div class="absolute inset-0 overflow-y-auto bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
    <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <div class="flex min-w-0 items-center gap-3">
          <UButton
            v-if="view === 'detail'"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="返回列表"
            class="-ml-2 shrink-0"
            @click="backToList"
          />
          <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-500 text-white shadow-sm">
            <UIcon name="i-lucide-package-check" class="size-5" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-base font-bold sm:text-lg">销售出库单处理</h1>
            <p class="truncate text-xs text-slate-500 dark:text-slate-400">
              {{ headerSubtitle }}
            </p>
          </div>
        </div>
        <div
          class="flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold"
          :class="kingdeeStatus.containerClass"
        >
          <span class="size-2 rounded-full" :class="kingdeeStatus.dotClass" />
          <span class="hidden sm:inline">金蝶 K3Cloud · {{ kingdeeStatus.label }}</span>
          <span class="sm:hidden">{{ kingdeeStatus.label }}</span>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <template v-if="view === 'list'">
        <section class="relative overflow-hidden rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white px-5 py-5 text-slate-950 shadow-sm dark:border-primary-900/50 dark:from-primary-950 dark:to-slate-950 dark:text-white sm:px-7 sm:py-6">
          <div class="absolute -right-12 -top-16 size-48 rounded-full bg-primary-500/10 blur-2xl dark:bg-primary-500/20" />
          <div class="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
            <div class="min-w-0">
              <p class="mb-2 text-xs font-bold tracking-[0.18em] text-primary-600 dark:text-primary-300">仓库出库作业</p>
              <h2 class="text-2xl font-black tracking-tight sm:text-3xl">
                {{ isHistory ? '审核历史' : '待审核销售出库单' }}
              </h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ isHistory
                  ? `已审核的金蝶销售出库单，按审核时间从近到远排列（默认近 ${HISTORY_DAYS} 天）。`
                  : '以下单据来自金蝶 K3Cloud。核对客户、物料及实发数量后，可执行出库审核。' }}
              </p>
            </div>
            <div class="grid grid-cols-2 divide-x divide-slate-200 rounded-xl bg-white/70 py-2 text-center ring-1 ring-slate-200/70 dark:divide-white/15 dark:bg-white/5 dark:ring-white/5">
              <div class="px-2">
                <div class="text-3xl font-black tabular-nums">{{ orders.length }}</div>
                <div class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                  {{ isHistory ? '已审核单据' : '待审核单据' }}
                </div>
              </div>
              <div class="px-2">
                <div class="text-3xl font-black tabular-nums">{{ totalLineCount }}</div>
                <div class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">明细行数</div>
              </div>
            </div>
          </div>
        </section>

        <div class="mt-4 flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition"
            :class="listMode === 'pending'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            @click="switchListMode('pending')"
          >
            待审核
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition"
            :class="listMode === 'history'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            @click="switchListMode('history')"
          >
            审核历史
          </button>
        </div>

        <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="lg"
              class="min-w-0 flex-1"
              placeholder="搜索单号、客户、物料编码"
            />
            <UButton
              v-if="!isHistory"
              icon="i-lucide-scan-barcode"
              color="primary"
              variant="soft"
              size="lg"
              class="justify-center sm:w-auto"
              @click="openScanner('order')"
            >
              扫描条码
            </UButton>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="soft"
              size="lg"
              class="justify-center sm:w-auto"
              :loading="loading"
              @click="loadOrders"
            >
              刷新金蝶
            </UButton>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            <USelect
              v-model="customerFilter"
              :items="customerOptions"
              value-key="value"
              label-key="label"
              icon="i-lucide-building-2"
              size="md"
              aria-label="按客户筛选"
            />
            <UPopover v-model:open="dateFilterOpen">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar-days"
                size="md"
                class="w-full justify-start font-normal"
                :aria-label="isHistory ? '按审核日期筛选' : '按单据日期筛选'"
              >
                <span :class="dateFilter ? '' : 'text-dimmed'">{{ dateFilter || (isHistory ? '审核日期' : '单据日期') }}</span>
              </UButton>
              <template #content>
                <div class="p-2"><UCalendar v-model="dateFilterValue" locale="zh-CN" /></div>
              </template>
            </UPopover>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-rotate-ccw"
              class="justify-center"
              :disabled="!hasActiveFilters"
              @click="clearFilters"
            >
              清除筛选
            </UButton>
          </div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {{ isHistory
                ? `显示 ${filteredOrders.length} 张已审核销售出库单（按审核时间倒序，近 ${HISTORY_DAYS} 天）`
                : `显示 ${filteredOrders.length} 张金蝶已提交、待审核的销售出库单` }}
            </span>
            <span v-if="lastSyncedAt">更新于 {{ lastSyncedAt }}</span>
          </div>
        </section>

        <div v-if="loading" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <USkeleton v-for="index in 6" :key="index" class="h-44 rounded-xl" />
        </div>

        <section v-else-if="errorMessage" class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/70 dark:bg-red-950/30">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-cloud-off" class="mt-0.5 size-5 shrink-0 text-red-600" />
            <div class="min-w-0 flex-1">
              <h3 class="font-bold text-red-900 dark:text-red-200">金蝶数据加载失败</h3>
              <p class="mt-1 text-sm text-red-700 dark:text-red-300">{{ errorMessage }}</p>
            </div>
            <UButton color="error" variant="soft" size="sm" @click="loadOrders">重试</UButton>
          </div>
        </section>

        <!-- 审核历史：表格列表 -->
        <section
          v-else-if="filteredOrders.length && isHistory"
          class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th class="whitespace-nowrap px-4 py-3">审核时间</th>
                  <th class="whitespace-nowrap px-4 py-3">单号</th>
                  <th class="whitespace-nowrap px-4 py-3">客户</th>
                  <th class="whitespace-nowrap px-4 py-3">仓库</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">物料数</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">实发数量</th>
                  <th class="whitespace-nowrap px-4 py-3">单据日期</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr
                  v-for="order in paginatedHistoryOrders"
                  :key="order.billNo"
                  class="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  @click="openOrder(order)"
                >
                  <td class="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {{ order.approveDate }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-primary-600 dark:text-primary-400">
                    {{ order.billNo }}
                  </td>
                  <td class="max-w-[12rem] truncate px-4 py-3 font-medium" :title="order.customerName">
                    {{ order.customerName }}
                  </td>
                  <td class="max-w-[10rem] truncate px-4 py-3 text-slate-500 dark:text-slate-400" :title="order.stockNames.join('、')">
                    {{ order.stockNames.join('、') || '-' }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">{{ order.items.length }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{{ formatQty(order.totalQty) }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{{ order.deliveryDate }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-right">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-eye"
                      @click.stop="openOrder(order)"
                    >
                      明细
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span>共 {{ filteredOrders.length }} 条</span>
              <span>每页</span>
              <USelect
                v-model="historyPageSize"
                :items="historyPageSizeOptions"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-24"
                aria-label="审核历史每页行数"
              />
            </div>
            <UPagination
              v-model:page="historyPage"
              :total="filteredOrders.length"
              :items-per-page="historyPageSize"
              show-edges
              size="sm"
            />
          </div>
        </section>

        <!-- 待审核：卡片 -->
        <section v-else-if="filteredOrders.length" class="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="order in filteredOrders"
            :key="order.billNo"
            type="button"
            class="group w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-700 sm:p-4"
            @click="openOrder(order)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-mono text-xs font-extrabold text-primary-600 dark:text-primary-400">{{ order.billNo }}</div>
                <h3 class="mt-1 line-clamp-1 text-sm font-bold leading-5 sm:text-base">{{ order.customerName }}</h3>
              </div>
              <span class="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
                待审核
              </span>
            </div>

            <div class="my-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-2 text-center dark:divide-slate-800 dark:bg-slate-950/60">
              <div>
                <div class="text-base font-black tabular-nums">{{ order.items.length }}</div>
                <div class="text-[10px] text-slate-500">物料</div>
              </div>
              <div>
                <div class="text-base font-black tabular-nums">{{ formatQty(order.totalQty) }}</div>
                <div class="text-[10px] text-slate-500">实发数量</div>
              </div>
              <div>
                <div class="text-xs font-bold leading-6">{{ order.deliveryDate }}</div>
                <div class="text-[10px] text-slate-500">单据日期</div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 text-xs">
              <span class="truncate text-slate-500 dark:text-slate-400">
                <UIcon name="i-lucide-warehouse" class="mr-1 inline size-4 align-[-2px]" />
                {{ order.stockNames.join('、') || '未指定仓库' }}
              </span>
              <span class="flex shrink-0 items-center gap-1 font-bold text-primary-600 dark:text-primary-400">
                查看明细
                <UIcon name="i-lucide-arrow-right" class="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        </section>

        <section v-else class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
            <UIcon name="i-lucide-clipboard-check" class="size-7" />
          </div>
          <h3 class="mt-4 text-lg font-bold">
            {{ emptyTitle }}
          </h3>
          <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            {{ emptyDescription }}
          </p>
        </section>
      </template>

      <template v-else-if="activeOrder">
        <section
          class="overflow-hidden rounded-2xl border shadow-sm"
          :class="isHistory
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-slate-950 dark:border-emerald-900/50 dark:from-emerald-950 dark:to-slate-950 dark:text-white'
            : 'border-primary-200 bg-gradient-to-br from-primary-50 to-white text-slate-950 dark:border-primary-900/50 dark:from-primary-950 dark:to-slate-950 dark:text-white'"
        >
          <div class="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="rounded-lg px-2.5 py-1 text-xs font-black text-white"
                  :class="isHistory ? 'bg-emerald-500' : 'bg-primary-500'"
                >
                  {{ isHistory ? '已审核' : '待审核' }}
                </span>
                <span
                  class="rounded-lg border bg-white px-2.5 py-1 font-mono text-sm font-black tracking-wide dark:bg-slate-950/70"
                  :class="isHistory
                    ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-200'
                    : 'border-primary-200 text-primary-700 dark:border-primary-800 dark:text-primary-200'"
                >
                  单号 {{ activeOrder.billNo }}
                </span>
              </div>
              <h2 class="mt-3 text-xl font-black leading-tight sm:text-2xl">{{ activeOrder.customerName }}</h2>
              <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                <span><UIcon name="i-lucide-calendar-days" class="mr-1 inline size-4 align-[-2px]" />单据 {{ activeOrder.deliveryDate }}</span>
                <span v-if="isHistory && activeOrder.approveDate">
                  <UIcon name="i-lucide-badge-check" class="mr-1 inline size-4 align-[-2px]" />审核 {{ activeOrder.approveDate }}
                </span>
                <span><UIcon name="i-lucide-warehouse" class="mr-1 inline size-4 align-[-2px]" />{{ activeOrder.stockNames.join('、') || '未指定仓库' }}</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:min-w-64">
              <div class="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/5">
                <div class="text-2xl font-black tabular-nums">{{ activeOrder.items.length }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">物料明细</div>
              </div>
              <div class="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/5">
                <div class="text-2xl font-black tabular-nums">{{ formatQty(orderTotalQty) }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">出库总数</div>
              </div>
            </div>
          </div>
        </section>

        <section class="mt-4 min-w-0" :class="isHistory ? 'pb-6' : 'pb-24'">
          <div class="mb-3 flex items-end gap-3 px-1">
            <div>
              <h3 class="font-bold">出库明细</h3>
              <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {{ isHistory
                  ? '数据来源：金蝶已审核销售出库单'
                  : activeOrder?.documentStatus === 'B'
                    ? '单据已提交；数量沿用金蝶实发数，本页负责物料和库位核对'
                    : '按销售出库单仓位出库；单据未带仓位时再现场补选' }}
              </p>
            </div>
          </div>

          <div v-if="pickingLoading" class="rounded-xl border border-dashed border-primary-300 bg-primary-50 px-4 py-5 text-center text-sm text-primary-700 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-200">
            正在读取金蝶实时库位库存…
          </div>

          <div v-else class="grid gap-2.5 lg:grid-cols-2">
            <article
              v-for="(item, index) in activeOrder.items"
              :key="item.entryId"
              class="rounded-xl border bg-white p-3 shadow-sm transition dark:bg-slate-900"
              :class="selectedItemEntryId === item.entryId
                ? 'border-primary-400 ring-2 ring-primary-100 dark:border-primary-600 dark:ring-primary-950'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'"
              @click="selectPickItem(item)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 flex-1 items-start gap-2.5">
                  <span class="grid size-7 shrink-0 place-items-center rounded-md bg-slate-100 text-[11px] font-black tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {{ index + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span class="font-mono text-xs font-black text-primary-600 dark:text-primary-400">
                        {{ item.materialNumber }}
                      </span>
                      <h4 class="break-words text-sm font-bold leading-5 text-slate-950 dark:text-white">
                        {{ item.materialName }}
                      </h4>
                    </div>
                    <div class="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      <UIcon name="i-lucide-tags" class="mt-0.5 size-3.5 shrink-0" />
                      <span class="break-words">{{ item.specification || '-' }}</span>
                    </div>
                  </div>
                </div>
                <div class="shrink-0 text-right">
                  <div class="text-[10px] font-semibold text-slate-400">计划</div>
                  <div class="text-base font-black tabular-nums leading-6 text-slate-700 dark:text-slate-200">
                    {{ formatQty(item.planQty) }}
                  </div>
                </div>
              </div>

              <div class="mt-2.5 flex min-w-0 items-center gap-2 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                <span class="flex shrink-0 items-center gap-1 font-bold text-slate-400">
                  <UIcon name="i-lucide-warehouse" class="size-3.5" />仓库
                </span>
                <span class="break-words font-semibold text-slate-600 dark:text-slate-300">{{ item.stockName || '-' }}</span>
              </div>

              <div v-if="!isHistory" class="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="text-[10px] font-semibold text-slate-400">
                    {{ item.documentLocationNumber ? '出库仓位（按销售出库单）' : '出库仓位（单据未填写，请现场确认）' }}
                  </div>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    :class="item.documentLocationNumber
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'"
                  >
                    {{ item.documentLocationNumber ? '已从单据带入' : '需要补选' }}
                  </span>
                </div>
                <div v-if="item.documentLocationNumber" class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span class="font-semibold text-slate-700 dark:text-slate-200">{{ item.documentLocationName || item.documentLocationNumber }}</span>
                  <span v-if="item.documentLocationName && item.documentLocationNumber" class="font-mono text-xs text-slate-400">{{ item.documentLocationNumber }}</span>
                </div>
                <template v-else>
                  <UInput
                    v-model="item.pickedLocation"
                    @update:model-value="syncFinalLocation(item)"
                    size="sm"
                    class="mt-1 font-mono"
                    placeholder="请输入或从库存建议选择"
                    @click.stop
                  />
                  <p class="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">销售出库单未带仓位，请从实际库存建议中选择或扫描确认。</p>
                </template>
              </div>

              <div v-if="!isHistory" class="mt-2 space-y-1.5 rounded-lg border border-primary-100 bg-primary-50/50 p-2 dark:border-primary-900/50 dark:bg-primary-950/20">
                <div class="text-[10px] font-semibold text-primary-700 dark:text-primary-300">本行拣货来源</div>
                <div
                  v-for="segment in item.pickSegments"
                  :key="segment.id"
                  class="rounded-lg border border-primary-100/80 bg-white/70 p-2 dark:border-primary-900/60 dark:bg-slate-900/60"
                  @click.stop="item.activeSegmentId = segment.id"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                        <span :class="segment.conversionRequired ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-200'">
                          {{ segment.sourceMaterialCode }}<span v-if="segment.conversionRequired"> → {{ item.materialNumber }}</span>
                        </span>
                        <span v-if="segment.conversionRequired" class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          已选库存
                        </span>
                      </div>
                      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span v-if="segment.conversionRequired">来源仓库：<strong class="text-slate-700 dark:text-slate-200">{{ segment.sourceStockName || segment.stockNumber || '未选择' }}</strong></span>
                        <span>来源库位：<strong class="font-mono text-slate-700 dark:text-slate-200">{{ segment.sourceLocationNumber || '未选择' }}</strong></span>
                        <span>批次：<strong class="font-mono text-slate-700 dark:text-slate-200">{{ segment.sourceLotNumber || '无批次' }}</strong></span>
                        <span v-if="segment.conversionRequired && requiresTransfer(segment, item)" class="font-semibold text-amber-700 dark:text-amber-300">需调拨到出库仓</span>
                      </div>
                    </div>
                    <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" aria-label="删除拣货来源" @click.stop="removePickSegment(item, segment.id)" />
                  </div>
                  <div class="mt-2 flex items-center gap-2">
                    <label class="shrink-0 text-[10px] font-semibold text-slate-400">来源数量</label>
                    <UInput v-model.number="segment.qty" type="number" min="0" step="0.001" size="xs" class="max-w-32 font-mono" aria-label="来源数量" />
                  </div>
                </div>
              </div>

              <div v-if="!isHistory" class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span :class="item.materialScanned ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'">
                    {{ item.materialScanned ? '物料已扫码' : '未扫码，按单据物料出库' }}
                  </span>
                  <span class="font-semibold text-slate-600 dark:text-slate-300">
                    仓位：{{ item.pickedLocation || '未确认' }}<span v-if="item.documentLocationNumber" class="ml-1 text-emerald-600 dark:text-emerald-300">（按单据）</span>
                  </span>
                  <span v-if="item.pickedLotNumber" class="text-slate-500 dark:text-slate-400">
                    批次：{{ item.pickedLotNumber }}
                  </span>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <UButton size="xs" color="primary" variant="soft" icon="i-lucide-scan-line" @click.stop="openItemScanner('material', item)">
                    扫物料
                  </UButton>
                  <UButton v-if="needsLocationScan(item)" size="xs" color="neutral" variant="soft" icon="i-lucide-map-pin" @click.stop="openItemScanner('location', item)">
                    扫库位
                  </UButton>
                </div>
              </div>

              <div v-if="!isHistory && !item.documentLocationNumber && item.inventoryOptions?.length" class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="option in item.inventoryOptions.slice(0, 4)"
                  :key="`${option.stockLocationNumber || 'NOLOC'}-${option.lotNumber || 'NOLOT'}`"
                  type="button"
                  class="rounded-lg border border-slate-200 px-2 py-1 text-left text-[11px] text-slate-600 transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-950/30"
                  @click.stop="applyInventorySuggestion(item, option)"
                >
                  {{ option.stockLocationNumber || '无库位' }} · 可用 {{ formatQty(option.availableQty) }}
                  <span v-if="option.lotNumber">· {{ option.lotNumber }}</span>
                </button>
              </div>
            </article>
          </div>
        </section>

        <div
          v-if="!isHistory"
          class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        >
          <div class="mx-auto max-w-lg space-y-2">
            <div
              v-if="!canComplete && !pickingLoading && completionHint"
              class="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              {{ completionHint }}
            </div>
            <div class="flex items-center gap-3">
            <div class="min-w-20">
              <div class="text-sm font-black">{{ activeOrder.items.length }} 项明细</div>
              <div class="text-xs text-slate-500">待审核</div>
            </div>
            <UButton
              color="primary"
              size="xl"
              icon="i-lucide-cloud-upload"
              class="flex-1 justify-center font-bold"
              :disabled="!canComplete || pickingLoading"
              @click="confirmOpen = true"
            >
              确认出库
            </UButton>
            </div>
          </div>
        </div>
      </template>
    </main>

    <UModal v-model:open="confirmOpen" title="确认完成出库">
      <template #body>
        <div v-if="activeOrder" class="space-y-4">
          <div class="rounded-xl bg-primary-50 p-4 text-sm leading-6 text-primary-900 dark:bg-primary-950/40 dark:text-primary-100">
            确认后将审核金蝶销售出库单 <strong class="font-mono">{{ activeOrder.billNo }}</strong>。审核成功后将正式完成出库并扣减库存。
          </div>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">物料明细</dt>
              <dd class="mt-1 text-xl font-black">{{ activeOrder.items.length }} 项</dd>
            </div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">出库总数</dt>
              <dd class="mt-1 text-xl font-black">{{ formatQty(orderTotalQty) }}</dd>
            </div>
          </dl>
          <p v-if="!canComplete" class="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            请检查出库仓位确认情况；物料扫码为可选操作，未扫码时按销售出库单物料出库。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="confirmOpen = false">取消</UButton>
          <UButton color="primary" icon="i-lucide-check" :loading="submitting" :disabled="!canComplete" @click="completeOutbound">确认出库</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="conversionOpen" title="选择转换来源库存">
      <template #body>
        <div class="space-y-4">
          <div class="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            扫描物料与金蝶出库明细不一致。请先从所有仓库的实际物料库存中选择来源仓库、库位和批次，系统会自动带入拣货来源。
          </div>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">单据物料</dt>
              <dd class="mt-1 font-mono font-black">{{ conversionDraft.targetMaterialCode }}</dd>
            </div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">实际物料</dt>
              <dd class="mt-1 font-mono font-black text-amber-600">{{ conversionDraft.sourceMaterialCode }}</dd>
            </div>
          </dl>
          <UFormField label="本次转换数量">
            <UInput v-model.number="conversionDraft.suggestedQty" type="number" min="0" step="0.001" size="lg" class="w-full font-mono" />
          </UFormField>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-bold">选择来源库存</div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  所有仓库 · 同时显示在手和可用库存，仅可选择可用量大于 0 的库存
                </p>
              </div>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="conversionInventoryLoading"
                @click="loadConversionInventory"
              >
                重新查询
              </UButton>
            </div>

            <div v-if="conversionInventoryLoading" class="mt-3 space-y-2">
              <USkeleton v-for="index in 3" :key="index" class="h-14 rounded-lg" />
            </div>
            <div v-else-if="conversionInventoryError" class="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <div>{{ conversionInventoryError }}</div>
              <UButton class="mt-2" color="error" variant="soft" size="xs" @click="loadConversionInventory">重试查询</UButton>
            </div>
            <div v-else-if="!conversionInventoryOptions.length" class="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              所有仓库都没有查到在手的实际物料库存，暂时不能继续转换出库。
            </div>
            <div v-else class="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              <button
                v-for="(option, index) in conversionInventoryOptions"
                :key="conversionOptionKey(option, index)"
                type="button"
                class="w-full rounded-lg border p-3 text-left transition"
                :class="conversionSelectedInventory === option
                  ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-100 dark:border-primary-600 dark:bg-primary-950/40 dark:ring-primary-950'
                  : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-700 dark:hover:bg-primary-950/30'"
                :disabled="!option.stockLocationNumber || !(availableQtyForOption(option) > 0)"
                @click="selectConversionInventory(option)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                      <span>{{ option.stockName || option.stockNumber || '未填写仓库' }}</span>
                      <span v-if="option.stockNumber" class="font-mono text-slate-400">{{ option.stockNumber }}</span>
                      <span v-if="requiresTransfer(option, conversionDraft.item)" class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">需调拨</span>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                      <span>{{ option.stockLocationName || option.stockLocationNumber || '未配置库位' }}</span>
                      <span v-if="option.stockLocationNumber" class="font-mono text-slate-400">{{ option.stockLocationNumber }}</span>
                      <span v-if="conversionSelectedInventory === option" class="rounded-full bg-primary-500 px-1.5 py-0.5 text-[10px] text-white">已选择</span>
                    </div>
                    <div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      批次：{{ option.lotNumber || '无批次' }}
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <div class="text-[10px] text-slate-400">在手 / 可用</div>
                    <div class="font-mono text-sm font-black" :class="availableQtyForOption(option) > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'">
                      {{ formatQty(option.baseQty) }} / {{ formatQty(availableQtyForOption(option)) }}
                    </div>
                    <div v-if="availableQtyForOption(option) <= 0" class="mt-0.5 text-[10px] text-amber-600 dark:text-amber-300">当前不可选择</div>
                  </div>
                </div>
              </button>
            </div>
            <p
              v-if="conversionInventoryOptions.length && !hasAvailableConversionInventory(conversionInventoryOptions)"
              class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              已查到在手库存，但所有记录的可用量都是 0。当前不能选择这些库存，请先在金蝶确认占用/锁定状态，或选择其他有可用量的库存。
            </p>
            <p v-if="conversionSelectedInventory" class="mt-2 text-xs leading-5 text-primary-700 dark:text-primary-300">
              已选择来源仓库、库位和批次；如果来源仓库不是出库仓库，最终确认时会先生成组装拆卸单，再生成直接调拨单，完成后才审核销售出库。
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="conversionOpen = false">取消</UButton>
          <UButton color="primary" icon="i-lucide-check" :disabled="!conversionSelectedInventory || conversionInventoryLoading" @click="confirmBusinessConversion">确认选择</UButton>
        </div>
      </template>
    </UModal>

    <CameraBarcodeScanner v-model:open="scannerOpen" @detected="handleBarcodeDetected" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { completeSalesOutbound, getSalesOutboundPicking, listKingdeeInventory, listSalesOutbound } from '@/api/tk_custom/stockDocument'
import CameraBarcodeScanner from '@/components/tk_custom/CameraBarcodeScanner.vue'
import { parseMaterialCode } from '@/packages/shared/barcode'
import { buildOutboundPickSegments, outboundQtyForItem } from '@/packages/shared/wmsOutbound'

const toast = useToast()
const HISTORY_DAYS = 90
const DEFAULT_CONVERSION_CONFIRM_REASON = '出库页面确认物料转换'
const view = ref('list')
/** pending | history */
const listMode = ref('pending')
const orders = ref([])
const activeOrder = ref(null)
const searchQuery = ref('')
const customerFilter = ref('__all__')
const dateFilter = ref('')

// UCalendar 日期筛选（原生 type="date" 替换）
import { parseDate } from '@internationalized/date'

const dateFilterOpen = ref(false)
const dateFilterValue = computed({
  get() {
    if (!dateFilter.value) return null
    try { return parseDate(String(dateFilter.value).slice(0, 10)) } catch { return null }
  },
  set(val) {
    dateFilter.value = val ? val.toString() : ''
    dateFilterOpen.value = false
  }
})
const loading = ref(false)
const submitting = ref(false)
const confirmOpen = ref(false)
const errorMessage = ref('')
const lastSyncedAt = ref('')
const scannerOpen = ref(false)
const scannerMode = ref('order')
const pickingLoading = ref(false)
const selectedItemEntryId = ref('')
const conversionOpen = ref(false)
const conversionInventoryLoading = ref(false)
const conversionInventoryError = ref('')
const conversionInventoryOptions = ref([])
const conversionSelectedInventory = ref(null)
const conversionDraft = reactive({
  item: null,
  sourceMaterialCode: '',
  targetMaterialCode: '',
  suggestedQty: 0
})
let conversionInventoryRequest = 0
const historyPage = ref(1)
const historyPageSize = ref(100)
const historyPageSizeOptions = [20, 50, 100, 200].map(value => ({ label: `${value} 条`, value }))

const isHistory = computed(() => listMode.value === 'history')
const totalLineCount = computed(() => orders.value.reduce((sum, order) => sum + order.items.length, 0))
const customerOptions = computed(() => [
  { label: '全部客户', value: '__all__' },
  ...[...new Set(orders.value.map(order => order.customerName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map(customerName => ({ label: customerName, value: customerName }))
])
const kingdeeStatus = computed(() => {
  if (loading.value) {
    return {
      label: '同步中',
      dotClass: 'bg-amber-400',
      containerClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
    }
  }
  if (errorMessage.value) {
    return {
      label: '连接异常',
      dotClass: 'bg-red-500',
      containerClass: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
    }
  }
  return {
    label: '连接正常',
    dotClass: 'bg-emerald-500',
    containerClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
})
const filteredOrders = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  return orders.value.filter(order => {
    if (customerFilter.value !== '__all__' && order.customerName !== customerFilter.value) return false
    if (dateFilter.value) {
      const day = isHistory.value
        ? String(order.approveDate || '').slice(0, 10)
        : order.deliveryDate
      if (day !== dateFilter.value) return false
    }
    if (!keyword) return true
    return [
      order.billNo,
      order.customerName,
      ...order.items.flatMap(item => [item.materialNumber, item.materialName, item.specification])
    ].some(value => String(value || '').toLowerCase().includes(keyword))
  })
})
const paginatedHistoryOrders = computed(() => {
  const start = (historyPage.value - 1) * historyPageSize.value
  return filteredOrders.value.slice(start, start + historyPageSize.value)
})
watch([searchQuery, customerFilter, dateFilter, historyPageSize], () => {
  historyPage.value = 1
})
watch(() => filteredOrders.value.length, (total) => {
  const lastPage = Math.max(Math.ceil(total / historyPageSize.value), 1)
  if (historyPage.value > lastPage) historyPage.value = lastPage
})
const hasActiveFilters = computed(() => Boolean(searchQuery.value || customerFilter.value !== '__all__' || dateFilter.value))
const orderTotalQty = computed(() => activeOrder.value?.items.reduce((sum, item) => sum + outboundQtyForItem(item), 0) || 0)
const selectedPickItem = computed(() => activeOrder.value?.items.find(item => item.entryId === selectedItemEntryId.value) || activeOrder.value?.items[0] || null)
function completionIssue(item) {
  const documentQty = outboundQtyForItem(item)
  if (documentQty === 0) return ''
  const segments = item?.pickSegments?.length ? item.pickSegments : buildOutboundPickSegments(item)
  if (Math.abs(segments.reduce((sum, segment) => sum + Number(segment.qty || 0), 0) - documentQty) > 0.0001) return `明细 ${item.materialNumber} 的来源数量还差 ${formatQty(documentQty - sumPickQty(item))}。`
  if (!item.stockNumber) return `明细 ${item.materialNumber} 缺少出库仓库。`
  if (!item.pickedLocation) return `明细 ${item.materialNumber} 还没有确认出库仓位。`
  for (const segment of segments) {
    if (!(Number(segment.qty) > 0)) return `明细 ${item.materialNumber} 存在无效的来源数量。`
    if (!segment.sourceLocationNumber) return `明细 ${item.materialNumber} 的来源物料 ${segment.sourceMaterialCode} 还没有确认来源库位。`
    if (segment.conversionRequired && !segment.businessConfirmed) {
      return `明细 ${item.materialNumber} 的物料转换还没有确认。`
    }
    if (!segment.conversionRequired && segment.sourceMaterialCode.toUpperCase() !== String(item.materialNumber || '').toUpperCase()) {
      return `明细 ${item.materialNumber} 存在未确认的混出物料。`
    }
  }
  return ''
}
const completionHint = computed(() => activeOrder.value?.items.map(completionIssue).find(Boolean) || '')
const canComplete = computed(() => {
  if (isHistory.value || pickingLoading.value || !activeOrder.value?.items?.length) return false
  return activeOrder.value.items.every(item => !completionIssue(item))
})
const headerSubtitle = computed(() => {
  if (view.value === 'detail') return activeOrder.value?.billNo || ''
  return isHistory.value ? '金蝶已审核单据' : '金蝶已提交单据'
})
const emptyTitle = computed(() => {
  if (searchQuery.value || dateFilter.value || customerFilter.value !== '__all__') {
    return '未找到匹配的销售出库单'
  }
  return isHistory.value ? '暂无审核历史' : '暂无待审核销售出库单'
})
const emptyDescription = computed(() => {
  if (searchQuery.value || dateFilter.value || customerFilter.value !== '__all__') {
    return '请调整单号、客户、物料或日期后重新查询。'
  }
  return isHistory.value
    ? `近 ${HISTORY_DAYS} 天内没有已审核的销售出库单。`
    : '金蝶连接正常，当前没有已提交且待审核的销售出库单。'
})

function formatQty(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function availableQtyForOption(option) {
  const available = option?.availableQty
  if (available !== null && available !== undefined && available !== '') {
    const parsed = Number(available)
    if (Number.isFinite(parsed)) return parsed
  }
  // Availability must be explicitly returned by the inventory query. Never
  // fall back to on-hand quantity here, otherwise a missing status/lock value
  // could make locked inventory selectable.
  return 0
}

function hasAvailableConversionInventory(options) {
  return Array.isArray(options) && options.some(option => availableQtyForOption(option) > 0)
}

function requiresTransfer(source, targetItem = null) {
  const targetStock = String(targetItem?.stockNumber || conversionDraft.item?.stockNumber || selectedPickItem.value?.stockNumber || '').trim().toUpperCase()
  const sourceStock = String(source?.stockNumber || '').trim().toUpperCase()
  return Boolean(sourceStock && targetStock && sourceStock !== targetStock)
}

function conversionOptionKey(option, index) {
  return [
    option?.materialNumber,
    option?.stockNumber,
    option?.stockLocationNumber || 'NOLOC',
    option?.lotNumber || 'NOLOT',
    index,
  ].join('-')
}

function sumPickQty(item) {
  return (Array.isArray(item?.pickSegments) ? item.pickSegments : [])
    .reduce((sum, segment) => sum + Number(segment.qty || 0), 0)
}

function remainingPickQty(item) {
  return Math.max(outboundQtyForItem(item) - sumPickQty(item), 0)
}

function newSegmentId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatApproveDate(value) {
  const text = String(value || '').trim()
  if (!text) return '-'
  // 金蝶可能返回 "2026-07-16T14:30:00" 或 "2026-07-16 14:30:00"
  const normalized = text.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized.slice(0, 10)
}

function historyBeginDate() {
  const d = new Date()
  d.setDate(d.getDate() - HISTORY_DAYS)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clearFilters() {
  searchQuery.value = ''
  customerFilter.value = '__all__'
  dateFilter.value = ''
}

function openScanner(mode = 'order') {
  scannerMode.value = mode
  scannerOpen.value = true
}

function openItemScanner(mode, item) {
  if (!item || isHistory.value) return
  selectPickItem(item)
  openScanner(mode)
}

function needsLocationScan(item) {
  if (!item) return false
  if (!item.documentLocationNumber) return true
  return (item.pickSegments || []).some(segment => segment.conversionRequired && !segment.sourceLocationNumber)
}

function selectPickItem(item) {
  if (item?.entryId) selectedItemEntryId.value = item.entryId
}

function parseLocationCode(rawValue) {
  const value = String(rawValue || '').trim().toUpperCase()
  return value.startsWith('LOC:') ? value.slice(4).trim() : value
}

function switchListMode(mode) {
  if (listMode.value === mode) return
  listMode.value = mode
  clearFilters()
  view.value = 'list'
  activeOrder.value = null
  historyPage.value = 1
  loadOrders()
}

function handleBarcodeDetected(rawValue) {
  const value = String(rawValue || '').trim()
  if (scannerMode.value === 'order') {
    searchQuery.value = parseMaterialCode(value)
    toast.add({
      title: '条码识别成功',
      description: `已按“${searchQuery.value}”筛选销售出库单`,
      color: 'success'
    })
    return
  }

  const item = selectedPickItem.value
  if (!item) {
    toast.add({ title: '请先选择出库明细', color: 'warning' })
    return
  }
  if (scannerMode.value === 'material') {
    const materialCode = parseMaterialCode(value)
    if (materialCode && materialCode !== String(item.materialNumber || '').trim().toUpperCase()) {
      openBusinessConversion(item, materialCode)
      return
    }
    if (materialCode !== String(item.materialNumber || '').trim().toUpperCase()) {
      toast.add({ title: '物料不匹配', description: `当前明细要求 ${item.materialNumber}`, color: 'error' })
      return
    }
    const segment = addPickSegment(item, materialCode, false)
    if (!segment) return
    toast.add({ title: '物料扫码成功', description: materialCode, color: 'success' })
    return
  }

  const locationCode = parseLocationCode(value)
  if (!locationCode) {
    toast.add({ title: '无法识别库位码', color: 'error' })
    return
  }
  const sourceSegment = activeSegment(item)
  if (sourceSegment?.conversionRequired && !sourceSegment.sourceLocationNumber) {
    sourceSegment.sourceLocationNumber = locationCode
    sourceSegment.stockNumber = item.stockNumber || ''
    const sourceOptions = item.inventoryOptions.filter(option =>
      String(option.materialNumber || item.materialNumber || '').trim().toUpperCase() === sourceSegment.sourceMaterialCode
        && String(option.stockLocationNumber || '').trim().toUpperCase() === locationCode
    )
    const sourceLots = [...new Set(sourceOptions.map(option => String(option.lotNumber || '').trim()).filter(Boolean))]
    if (sourceLots.length === 1) sourceSegment.sourceLotNumber = sourceLots[0]
    if (sourceLots.length > 1) sourceSegment.sourceLotNumber = ''
    toast.add({ title: '来源库位确认成功', description: locationCode, color: 'success' })
    return
  }
  if (item.documentLocationNumber) {
    toast.add({ title: '出库仓位已按销售出库单固定', description: item.documentLocationName || item.documentLocationNumber, color: 'warning' })
    return
  }
  item.pickedLocation = locationCode
  const matchedOptions = item.inventoryOptions.filter(option =>
    String(option.stockLocationNumber || '').trim().toUpperCase() === locationCode
  )
  const matchedLots = [...new Set(matchedOptions.map(option => String(option.lotNumber || '').trim()).filter(Boolean))]
  if (matchedLots.length === 1) {
    item.pickedLotNumber = matchedLots[0]
  } else if (matchedLots.length > 1) {
    item.pickedLotNumber = ''
    toast.add({ title: '该库位有多个批次', description: '请点击下方库存建议选择具体批次', color: 'warning' })
    return
  }
  toast.add({ title: '库位确认成功', description: locationCode, color: 'success' })
}

function applyInventorySuggestion(item, option) {
  if (!item || !option) return
  if (item.documentLocationNumber) {
    toast.add({ title: '出库仓位已按销售出库单固定', description: item.documentLocationName || item.documentLocationNumber, color: 'warning' })
    return
  }
  selectPickItem(item)
  item.pickedLocation = String(option.stockLocationNumber || '').trim().toUpperCase()
  if (option.lotNumber) item.pickedLotNumber = option.lotNumber
  const sourceSegment = activeSegment(item)
  if (sourceSegment && sourceSegment.sourceMaterialCode === String(item.materialNumber || '').trim().toUpperCase()) {
    sourceSegment.sourceLocationNumber = item.pickedLocation
    sourceSegment.stockNumber = item.stockNumber || ''
    if (option.lotNumber) sourceSegment.sourceLotNumber = option.lotNumber
  }
  toast.add({ title: '已选择推荐库位', description: item.pickedLocation || '无库位', color: 'success' })
}

function activeSegment(item) {
  if (!item) return null
  const segments = Array.isArray(item.pickSegments) ? item.pickSegments : []
  return segments.find(segment => segment.id === item.activeSegmentId) || segments[segments.length - 1] || null
}

function addPickSegment(item, sourceMaterialCode, conversionRequired, reason = '') {
  const qty = remainingPickQty(item)
  if (!(qty > 0)) {
    toast.add({ title: '鏈槑缁嗗凡瀹屾垚鎷ｈ揣', color: 'warning' })
    return null
  }
  const segment = {
    id: newSegmentId(),
    sourceMaterialCode: String(sourceMaterialCode || '').trim().toUpperCase(),
    qty,
    stockNumber: item.stockNumber || '',
    sourceLocationNumber: conversionRequired ? '' : (item.pickedLocation || ''),
    sourceLotNumber: conversionRequired ? '' : (item.pickedLotNumber || ''),
    conversionRequired,
    businessConfirmed: !conversionRequired || Boolean(reason),
    businessConfirmReason: reason
  }
  item.pickSegments.push(segment)
  item.activeSegmentId = segment.id
  item.materialScanned = true
  return segment
}

function removePickSegment(item, segmentId) {
  item.pickSegments = item.pickSegments.filter(segment => segment.id !== segmentId)
  item.activeSegmentId = item.pickSegments[item.pickSegments.length - 1]?.id || ''
  item.materialScanned = item.pickSegments.length > 0
}

function syncFinalLocation(item) {
  if (!item) return
  if (item.documentLocationNumber) {
    item.pickedLocation = item.documentLocationNumber
    return
  }
  item.pickedLocation = String(item.pickedLocation || '').trim().toUpperCase()
  for (const segment of item.pickSegments || []) {
    if (!segment.conversionRequired) segment.sourceLocationNumber = item.pickedLocation
  }
}

function openBusinessConversion(item, sourceMaterialCode) {
  conversionDraft.item = item
  conversionDraft.sourceMaterialCode = String(sourceMaterialCode || '').trim().toUpperCase()
  conversionDraft.targetMaterialCode = String(item.materialNumber || '').trim().toUpperCase()
  conversionDraft.suggestedQty = remainingPickQty(item)
  conversionInventoryOptions.value = []
  conversionSelectedInventory.value = null
  conversionInventoryError.value = ''
  conversionOpen.value = true
  loadConversionInventory()
}

async function loadConversionInventory() {
  const item = conversionDraft.item
  const materialCode = String(conversionDraft.sourceMaterialCode || '').trim().toUpperCase()
  const stockNumber = String(item?.stockNumber || '').trim()
  if (!materialCode || !stockNumber) {
    conversionInventoryOptions.value = []
    conversionInventoryError.value = '实际物料或出库仓库为空，无法查询来源库存。'
    return
  }

  const requestId = ++conversionInventoryRequest
  conversionInventoryLoading.value = true
  conversionInventoryError.value = ''
  conversionInventoryOptions.value = []
  conversionSelectedInventory.value = null
  try {
    const response = await listKingdeeInventory({
      material: materialCode,
      availableOnly: 'false',
      pageNum: 1,
      pageSize: 100
    })
    if (requestId !== conversionInventoryRequest) return
    if (response?.code !== 200) throw new Error(response?.msg || '金蝶库存查询返回异常')
    const rows = Array.isArray(response?.data?.rows) ? response.data.rows : []
    conversionInventoryOptions.value = rows.filter(option => Number(option?.baseQty) > 0 || availableQtyForOption(option) > 0)
  } catch (error) {
    if (requestId !== conversionInventoryRequest) return
    conversionInventoryError.value = error?.data?.msg || error?.message || '实际物料库存查询失败，请重试。'
  } finally {
    if (requestId === conversionInventoryRequest) conversionInventoryLoading.value = false
  }
}

function selectConversionInventory(option) {
  if (!option || !option.stockLocationNumber || !(availableQtyForOption(option) > 0)) return
  conversionSelectedInventory.value = option
}

function confirmBusinessConversion() {
  const item = conversionDraft.item
  const reason = DEFAULT_CONVERSION_CONFIRM_REASON
  const qty = Number(conversionDraft.suggestedQty)
  const inventory = conversionSelectedInventory.value
  if (!item || !conversionDraft.sourceMaterialCode || !(qty > 0)) {
    return toast.add({ title: '请填写本次转换数量', color: 'warning' })
  }
  if (!inventory) {
    return toast.add({ title: '请选择实际物料库存', color: 'warning' })
  }
  if (qty > remainingPickQty(item)) {
    return toast.add({ title: '转换数量超过当前明细剩余数量', color: 'warning' })
  }
  if (qty > availableQtyForOption(inventory)) {
    return toast.add({ title: '转换数量超过所选库存可用量', description: `当前可用 ${formatQty(availableQtyForOption(inventory))}，可分次选择其他库存。`, color: 'warning' })
  }
  const segment = addPickSegment(item, conversionDraft.sourceMaterialCode, true, reason)
  if (!segment) return
  segment.qty = qty
  segment.stockNumber = String(inventory.stockNumber || item.stockNumber || '').trim()
  segment.sourceStockName = String(inventory.stockName || segment.stockNumber).trim()
  segment.sourceLocationNumber = String(inventory.stockLocationNumber || '').trim().toUpperCase()
  segment.sourceLotNumber = String(inventory.lotNumber || '').trim()
  conversionOpen.value = false
  toast.add({
    title: '已选择转换来源库存',
    description: `${segment.sourceStockName} · ${segment.sourceLocationNumber}${segment.sourceLotNumber ? ` · 批次 ${segment.sourceLotNumber}` : ''}${requiresTransfer(segment, item) ? '，最终确认时将先调拨' : ''}`,
    color: 'success'
  })
}

function groupRows(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.billNo)) {
      grouped.set(row.billNo, {
        id: row.id,
        billNo: row.billNo,
        documentStatus: row.documentStatus || '',
        customerName: row.relatedName || row.relatedNumber || '未填写客户',
        deliveryDate: String(row.date || '').slice(0, 10) || '-',
        approveDate: formatApproveDate(row.approveDate),
        approveDateRaw: String(row.approveDate || ''),
        stockNames: [],
        totalQty: 0,
        items: []
      })
    }
    const order = grouped.get(row.billNo)
    const stockName = row.stockName || row.stockNumber || ''
    if (stockName && !order.stockNames.includes(stockName)) order.stockNames.push(stockName)
    if (!order.documentStatus && row.documentStatus) order.documentStatus = row.documentStatus
    const planQty = Number(row.qty || 0)
    const storedRealQty = row.realQty === null || row.realQty === undefined || row.realQty === ''
      ? planQty
      : Number(row.realQty)
    order.totalQty += planQty
    // 取最新审核时间
    const nextApprove = String(row.approveDate || '')
    if (nextApprove && (!order.approveDateRaw || nextApprove > order.approveDateRaw)) {
      order.approveDateRaw = nextApprove
      order.approveDate = formatApproveDate(nextApprove)
    }
    order.items.push({
      entryId: String(row.entryId),
      materialNumber: row.materialNumber || '-',
      materialName: row.materialName || '未填写物料名称',
      specification: row.specification || '',
      stockName,
      planQty,
      realQty: Number.isFinite(storedRealQty) ? storedRealQty : planQty,
      materialScanned: false,
      pickSegments: [],
      activeSegmentId: '',
      documentLocationNumber: String(row.stockLocationNumber || '').trim().toUpperCase(),
      documentLocationName: String(row.stockLocationName || '').trim(),
      pickedLocation: String(row.stockLocationNumber || '').trim().toUpperCase(),
      suggestedLocation: row.stockLocationNumber || '',
      pickedLotNumber: row.lotNumber || '',
      stockNumber: row.stockNumber || '',
      inventoryOptions: Array.isArray(row.inventoryOptions) ? row.inventoryOptions : []
    })
  }
  const list = [...grouped.values()]
  if (isHistory.value) {
    list.sort((a, b) => String(b.approveDateRaw || '').localeCompare(String(a.approveDateRaw || '')))
  }
  return list
}

async function loadOrders() {
  loading.value = true
  errorMessage.value = ''
  try {
    const params = {
      pageNum: 1,
      pageSize: 1000,
      documentStatus: isHistory.value ? 'C' : 'B'
    }
    if (isHistory.value) {
      params.beginDate = historyBeginDate()
    }
    const response = await listSalesOutbound(params)
    if (response?.code !== 200) throw new Error(response?.msg || '金蝶查询返回异常')
    const rows = Array.isArray(response?.data?.rows) ? response.data.rows : []
    orders.value = groupRows(rows)
    lastSyncedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    orders.value = []
    errorMessage.value = error?.data?.msg || error?.message || '请检查金蝶连接后重试'
  } finally {
    loading.value = false
  }
}

async function openOrder(order) {
  activeOrder.value = {
    ...order,
    items: order.items.map(item => ({ ...item }))
  }
  view.value = 'detail'
  selectedItemEntryId.value = activeOrder.value.items[0]?.entryId || ''
  if (isHistory.value) return
  pickingLoading.value = true
  try {
    const response = await getSalesOutboundPicking(order.billNo)
    if (response?.code !== 200) throw new Error(response?.msg || '读取拣货库存失败')
    const rows = Array.isArray(response?.data?.rows) ? response.data.rows : []
    const detailOrder = groupRows(rows).find(item => item.billNo === order.billNo)
    if (detailOrder) {
      activeOrder.value = detailOrder
      selectedItemEntryId.value = detailOrder.items[0]?.entryId || ''
    }
  } catch (error) {
    toast.add({ title: '读取库位库存失败', description: error?.message || String(error), color: 'error' })
  } finally {
    pickingLoading.value = false
  }
}

function backToList() {
  view.value = 'list'
  activeOrder.value = null
  confirmOpen.value = false
  conversionOpen.value = false
  selectedItemEntryId.value = ''
  pickingLoading.value = false
}

async function completeOutbound() {
  if (!activeOrder.value || isHistory.value) return
  if (!canComplete.value) {
    toast.add({ title: '拣货信息未完成', description: '请确认物料和库位信息', color: 'warning' })
    return
  }
  submitting.value = true
  try {
    const billNo = activeOrder.value.billNo
    const response = await completeSalesOutbound({
      billNo,
      requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      items: activeOrder.value.items.map(item => ({
        entryId: item.entryId,
        materialCode: item.materialNumber,
        stockNumber: item.stockNumber || '',
        stockLocationNumber: item.pickedLocation,
        lotNumber: item.pickedLotNumber || '',
        actualQty: outboundQtyForItem(item),
        picks: buildOutboundPickSegments(item)
      }))
    })
    if (response?.code !== 200) throw new Error(response?.msg || '金蝶出库返回异常')
    confirmOpen.value = false
    orders.value = orders.value.filter(order => order.billNo !== billNo)
    view.value = 'list'
    activeOrder.value = null
    toast.add({ title: '出库成功', description: `${billNo} 已同步金蝶并完成审核`, color: 'success' })
    playTone(900, 140)
  } catch (error) {
    toast.add({
      title: '出库失败',
      description: error?.data?.msg || error?.message || '请检查金蝶单据状态后重试',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

function playTone(frequency, duration) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.12, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration / 1000)
    oscillator.start()
    oscillator.stop(context.currentTime + duration / 1000)
    oscillator.addEventListener('ended', () => context.close())
  } catch {}
}

onMounted(loadOrders)
</script>
