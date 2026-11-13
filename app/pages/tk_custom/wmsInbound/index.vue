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
          <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
            <UIcon name="i-lucide-package-plus" class="size-5" />
          </div>
          <div class="min-w-0">
            <h1 class="truncate text-base font-bold sm:text-lg">采购入库处理</h1>
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
        <section class="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-5 text-slate-950 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950 dark:to-slate-950 dark:text-white sm:px-7 sm:py-6">
          <div class="absolute -right-12 -top-16 size-48 rounded-full bg-emerald-500/10 blur-2xl dark:bg-emerald-500/20" />
          <div class="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
            <div class="min-w-0">
              <p class="mb-2 text-xs font-bold tracking-[0.18em] text-emerald-600 dark:text-emerald-300">仓库入库作业</p>
              <h2 class="text-2xl font-black tracking-tight sm:text-3xl">
                {{ isHistory ? '入库历史' : '待入库采购订单' }}
              </h2>
              <p class="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ isHistory
                  ? '已审核的金蝶采购入库单，按审核时间从近到远排列（默认近 90 天）。'
                  : '以下为金蝶已审核且仍有可入库数量的采购订单。核对供应商与明细后，可一键下推并审核入库。' }}
              </p>
            </div>
            <div class="grid grid-cols-2 divide-x divide-slate-200 rounded-xl bg-white/70 py-2 text-center ring-1 ring-slate-200/70 dark:divide-white/15 dark:bg-white/5 dark:ring-white/5">
              <div class="px-2">
                <div class="text-3xl font-black tabular-nums">{{ orders.length }}</div>
                <div class="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                  {{ isHistory ? '已入库单据' : '待入库订单' }}
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
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            @click="switchListMode('pending')"
          >
            待入库
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition"
            :class="listMode === 'history'
              ? 'bg-emerald-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'"
            @click="switchListMode('history')"
          >
            入库历史
          </button>
        </div>

        <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              size="lg"
              class="min-w-0 flex-1"
              :placeholder="isHistory ? '搜索入库单号、采购订单、供应商、物料' : '搜索采购订单号、供应商、物料编码'"
            />
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
              v-model="supplierFilter"
              :items="supplierOptions"
              value-key="value"
              label-key="label"
              icon="i-lucide-building-2"
              size="md"
              aria-label="按供应商筛选"
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
                ? `显示 ${filteredOrders.length} 张已审核采购入库单（按审核时间倒序，近 90 天）`
                : `显示 ${filteredOrders.length} 张金蝶已审核、仍有可入库数量的采购订单` }}
            </span>
            <span v-if="lastSyncedAt">更新于 {{ lastSyncedAt }}</span>
            <span v-if="resultTruncated" class="font-bold text-amber-600 dark:text-amber-300">
              仅加载前 {{ totalLineCount }} 行，共约 {{ resultTotal }} 行，请加筛选条件缩小范围
            </span>
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

        <section
          v-else-if="filteredOrders.length && isHistory"
          class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th class="whitespace-nowrap px-4 py-3">审核时间</th>
                  <th class="whitespace-nowrap px-4 py-3">入库单号</th>
                  <th class="whitespace-nowrap px-4 py-3">采购订单</th>
                  <th class="whitespace-nowrap px-4 py-3">供应商</th>
                  <th class="whitespace-nowrap px-4 py-3">仓库</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">物料数</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">实收数量</th>
                  <th class="whitespace-nowrap px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr
                  v-for="order in filteredOrders"
                  :key="order.billNo"
                  class="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  @click="openOrder(order)"
                >
                  <td class="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {{ order.approveDate }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {{ order.billNo }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 font-mono text-xs">{{ order.purchaseOrderNo || '-' }}</td>
                  <td class="max-w-[12rem] truncate px-4 py-3 font-medium" :title="order.supplierName">
                    {{ order.supplierName }}
                  </td>
                  <td class="max-w-[10rem] truncate px-4 py-3 text-slate-500 dark:text-slate-400" :title="order.stockNames.join('、')">
                    {{ order.stockNames.join('、') || '-' }}
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">{{ order.items.length }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{{ formatQty(order.totalQty) }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-right">
                    <div class="flex justify-end gap-2">
                      <UButton
                        size="xs"
                        color="primary"
                        variant="soft"
                        icon="i-lucide-printer"
                        @click.stop="printInspectionReports(null, order)"
                      >
                        打印报告
                      </UButton>
                      <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-eye" @click.stop="openOrder(order)">
                        明细
                      </UButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="filteredOrders.length" class="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="order in filteredOrders"
            :key="order.billNo"
            type="button"
            class="group w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700 sm:p-4"
            @click="openOrder(order)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{{ order.billNo }}</div>
                <h3 class="mt-1 line-clamp-1 text-sm font-bold leading-5 sm:text-base">{{ order.supplierName }}</h3>
              </div>
              <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                待入库
              </span>
            </div>

            <div class="my-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-2 text-center dark:divide-slate-800 dark:bg-slate-950/60">
              <div>
                <div class="text-base font-black tabular-nums">{{ order.items.length }}</div>
                <div class="text-[10px] text-slate-500">物料</div>
              </div>
              <div>
                <div class="text-base font-black tabular-nums">{{ formatQty(order.totalRemainQty) }}</div>
                <div class="text-[10px] text-slate-500">可入库</div>
              </div>
              <div>
                <div class="text-xs font-bold leading-6">{{ order.deliveryDate }}</div>
                <div class="text-[10px] text-slate-500">单据日期</div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 text-xs">
              <span class="truncate text-slate-500 dark:text-slate-400">
                订货 {{ formatQty(order.totalQty) }}
              </span>
              <span class="flex shrink-0 items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
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
          <h3 class="mt-4 text-lg font-bold">{{ emptyTitle }}</h3>
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
            : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-slate-950 dark:border-emerald-900/50 dark:from-emerald-950 dark:to-slate-950 dark:text-white'"
        >
          <div class="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-black text-white">
                  {{ isHistory ? '已入库' : '待入库' }}
                </span>
                <span class="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 font-mono text-sm font-black tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-slate-950/70 dark:text-emerald-200">
                  {{ isHistory ? '入库单' : '采购订单' }} {{ activeOrder.billNo }}
                </span>
              </div>
              <h2 class="mt-3 text-xl font-black leading-tight sm:text-2xl">{{ activeOrder.supplierName }}</h2>
              <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                <span><UIcon name="i-lucide-calendar-days" class="mr-1 inline size-4 align-[-2px]" />单据 {{ activeOrder.deliveryDate }}</span>
                <span v-if="isHistory && activeOrder.approveDate">
                  <UIcon name="i-lucide-badge-check" class="mr-1 inline size-4 align-[-2px]" />审核 {{ activeOrder.approveDate }}
                </span>
                <span v-if="isHistory && activeOrder.purchaseOrderNo">
                  <UIcon name="i-lucide-file-text" class="mr-1 inline size-4 align-[-2px]" />来源 {{ activeOrder.purchaseOrderNo }}
                </span>
                <span v-if="isHistory">
                  <UIcon name="i-lucide-warehouse" class="mr-1 inline size-4 align-[-2px]" />{{ activeOrder.stockNames.join('、') || '未指定仓库' }}
                </span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:min-w-64">
              <UButton
                v-if="isHistory"
                color="primary"
                variant="solid"
                icon="i-lucide-printer"
                class="col-span-2 justify-center"
                @click="printInspectionReports()"
              >
                打印来料检验报告（{{ activeOrder.items.length }} 页）
              </UButton>
              <div class="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/5">
                <div class="text-2xl font-black tabular-nums">{{ activeOrder.items.length }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">物料明细</div>
              </div>
              <div class="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-slate-200/70 dark:bg-white/10 dark:ring-white/5">
                <div class="text-2xl font-black tabular-nums">
                  {{ formatQty(isHistory ? activeOrder.totalQty : activeOrder.totalRemainQty) }}
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ isHistory ? '实收总数' : '可入库总数' }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="mt-4 min-w-0" :class="isHistory ? 'pb-6' : 'pb-24'">
          <div class="mb-3 flex items-end justify-between gap-3 px-1">
            <div>
              <h3 class="font-bold">{{ isHistory ? '入库明细' : '采购明细' }}</h3>
              <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {{ isHistory ? '数据来源：金蝶已审核采购入库单' : '数据来源：金蝶已审核采购订单（可入库数量 > 0）' }}
              </p>
            </div>
          </div>

          <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <tr>
                    <th class="w-12 whitespace-nowrap px-4 py-3">#</th>
                    <th class="whitespace-nowrap px-4 py-3">物料编码</th>
                    <th class="whitespace-nowrap px-4 py-3">物料名称</th>
                    <th class="whitespace-nowrap px-4 py-3">规格型号</th>
                    <th v-if="isHistory" class="whitespace-nowrap px-4 py-3">仓库</th>
                    <th class="whitespace-nowrap px-4 py-3 text-right">{{ isHistory ? '实收数量' : '订货数量' }}</th>
                    <th v-if="!isHistory" class="whitespace-nowrap px-4 py-3 text-right">可入库</th>
                    <th v-if="isHistory" class="whitespace-nowrap px-4 py-3 text-right">检验报告</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr
                    v-for="(item, index) in activeOrder.items"
                    :key="item.entryId"
                    class="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td class="whitespace-nowrap px-4 py-3 tabular-nums text-slate-400">{{ index + 1 }}</td>
                    <td class="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-950 dark:text-white">
                      {{ item.materialNumber }}
                    </td>
                    <td class="max-w-[14rem] truncate px-4 py-3 font-medium" :title="item.materialName">
                      {{ item.materialName }}
                    </td>
                    <td class="max-w-[12rem] truncate px-4 py-3 text-slate-500 dark:text-slate-400" :title="item.specification || ''">
                      {{ item.specification || '-' }}
                    </td>
                    <td v-if="isHistory" class="max-w-[10rem] truncate px-4 py-3 text-slate-500 dark:text-slate-400">
                      {{ item.stockName || '-' }}
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums">
                      {{ formatQty(item.planQty) }}
                    </td>
                    <td v-if="!isHistory" class="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {{ formatQty(item.remainQty) }}
                    </td>
                    <td v-if="isHistory" class="whitespace-nowrap px-4 py-3 text-right">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        icon="i-lucide-printer"
                        @click="printInspectionReports(item)"
                      >
                        打印
                      </UButton>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div
          v-if="!isHistory"
          class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.1)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        >
          <div class="mx-auto flex max-w-lg items-center gap-3">
            <div class="min-w-20">
              <div class="text-sm font-black">{{ activeOrder.items.length }} 项明细</div>
              <div class="text-xs text-slate-500">待入库</div>
            </div>
            <UButton
              color="primary"
              size="xl"
              icon="i-lucide-package-plus"
              class="flex-1 justify-center font-bold"
              @click="confirmOpen = true"
            >
              确认入库
            </UButton>
          </div>
        </div>
      </template>
    </main>

    <UModal v-model:open="confirmOpen" title="确认完成入库">
      <template #body>
        <div v-if="activeOrder" class="space-y-4">
          <div class="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            确认后将把采购订单 <strong class="font-mono">{{ activeOrder.billNo }}</strong>
            下推为采购入库单，并在金蝶提交、审核（正式增加库存）。
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            整单按可入库数量全量下推，不支持按行或按数量部分入库；入库仓库按金蝶下推规则确定，完成后请到“入库历史”核对仓库与数量。
          </div>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">物料明细</dt>
              <dd class="mt-1 text-xl font-black">{{ activeOrder.items.length }} 项</dd>
            </div>
            <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <dt class="text-slate-500">可入库总数</dt>
              <dd class="mt-1 text-xl font-black">{{ formatQty(activeOrder.totalRemainQty) }}</dd>
            </div>
          </dl>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="submitting" @click="confirmOpen = false">取消</UButton>
          <UButton color="primary" icon="i-lucide-check" :loading="submitting" @click="completeInbound">确认入库</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  completePurchaseInbound,
  listPurchaseInbound,
  listPurchaseOrder
} from '@/api/tk_custom/stockDocument'
import { buildIncomingInspectionReportDocument } from '@ctk-system/shared'

const toast = useToast()
const view = ref('list')
/** pending | history */
const listMode = ref('pending')
const orders = ref([])
const activeOrder = ref(null)
const searchQuery = ref('')
const supplierFilter = ref('__all__')
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
const resultTotal = ref(0)
const resultTruncated = ref(false)

const isHistory = computed(() => listMode.value === 'history')
const totalLineCount = computed(() => orders.value.reduce((sum, order) => sum + order.items.length, 0))
const supplierOptions = computed(() => [
  { label: '全部供应商', value: '__all__' },
  ...[...new Set(orders.value.map(order => order.supplierName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map(name => ({ label: name, value: name }))
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
    if (supplierFilter.value !== '__all__' && order.supplierName !== supplierFilter.value) return false
    if (dateFilter.value) {
      const day = isHistory.value
        ? String(order.approveDate || '').slice(0, 10)
        : order.deliveryDate
      if (day !== dateFilter.value) return false
    }
    if (!keyword) return true
    return [
      order.billNo,
      order.purchaseOrderNo,
      order.supplierName,
      ...order.items.flatMap(item => [item.materialNumber, item.materialName, item.specification])
    ].some(value => String(value || '').toLowerCase().includes(keyword))
  })
})
const hasActiveFilters = computed(() => Boolean(searchQuery.value || supplierFilter.value !== '__all__' || dateFilter.value))
const headerSubtitle = computed(() => {
  if (view.value === 'detail') return activeOrder.value?.billNo || ''
  return isHistory.value ? '金蝶已审核采购入库单' : '金蝶已审核采购订单'
})
const emptyTitle = computed(() => {
  if (searchQuery.value || dateFilter.value || supplierFilter.value !== '__all__') {
    return isHistory.value ? '未找到匹配的采购入库单' : '未找到匹配的采购订单'
  }
  return isHistory.value ? '暂无入库历史' : '暂无待入库采购订单'
})
const emptyDescription = computed(() => {
  if (searchQuery.value || dateFilter.value || supplierFilter.value !== '__all__') {
    return '请调整单号、供应商、物料或日期后重新查询。'
  }
  return isHistory.value
    ? '近 90 天内没有已审核的采购入库单。'
    : '金蝶连接正常，当前没有可入库数量大于 0 的已审核采购订单。'
})

function formatQty(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function formatApproveDate(value) {
  const text = String(value || '').trim()
  if (!text) return '-'
  const normalized = text.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized.slice(0, 10)
}

function historyBeginDate() {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clearFilters() {
  searchQuery.value = ''
  supplierFilter.value = '__all__'
  dateFilter.value = ''
}

function switchListMode(mode) {
  if (listMode.value === mode) return
  listMode.value = mode
  clearFilters()
  view.value = 'list'
  activeOrder.value = null
  loadOrders()
}

function groupPurchaseOrders(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.billNo)) {
      grouped.set(row.billNo, {
        id: row.id,
        billNo: row.billNo,
        supplierName: row.relatedName || row.relatedNumber || '未填写供应商',
        deliveryDate: String(row.date || '').slice(0, 10) || '-',
        approveDate: formatApproveDate(row.approveDate),
        stockNames: [],
        purchaseOrderNo: '',
        totalQty: 0,
        totalRemainQty: 0,
        items: []
      })
    }
    const order = grouped.get(row.billNo)
    const planQty = Number(row.qty || 0)
    const remainQty = Number(row.remainQty || 0)
    order.totalQty += planQty
    order.totalRemainQty += remainQty
    order.items.push({
      entryId: String(row.entryId),
      materialNumber: row.materialNumber || '-',
      materialName: row.materialName || '未填写物料名称',
      specification: row.specification || '',
      stockName: '',
      planQty,
      remainQty
    })
  }
  return [...grouped.values()]
}

function groupInboundRows(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.billNo)) {
      grouped.set(row.billNo, {
        id: row.id,
        billNo: row.billNo,
        supplierName: row.relatedName || row.relatedNumber || '未填写供应商',
        deliveryDate: String(row.date || '').slice(0, 10) || '-',
        approveDate: formatApproveDate(row.approveDate),
        approveDateRaw: String(row.approveDate || ''),
        purchaseOrderNo: row.purchaseOrderNo || '',
        purchaseOrderNos: [],
        stockNames: [],
        totalQty: 0,
        totalRemainQty: 0,
        items: []
      })
    }
    const order = grouped.get(row.billNo)
    const stockName = row.stockName || row.stockNumber || ''
    if (stockName && !order.stockNames.includes(stockName)) order.stockNames.push(stockName)
    if (row.purchaseOrderNo && !order.purchaseOrderNos.includes(row.purchaseOrderNo)) order.purchaseOrderNos.push(row.purchaseOrderNo)
    order.purchaseOrderNo = order.purchaseOrderNos.join('、')
    const planQty = Number(row.qty || 0)
    order.totalQty += planQty
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
      remainQty: planQty
    })
  }
  return [...grouped.values()].sort((a, b) =>
    String(b.approveDateRaw || '').localeCompare(String(a.approveDateRaw || ''))
  )
}

async function loadOrders() {
  loading.value = true
  errorMessage.value = ''
  try {
    if (isHistory.value) {
      const response = await listPurchaseInbound({
        pageNum: 1,
        pageSize: 1000,
        documentStatus: 'C',
        beginApproveDate: historyBeginDate()
      })
      if (response?.code !== 200) throw new Error(response?.msg || '金蝶查询返回异常')
      const rows = Array.isArray(response?.data?.rows) ? response.data.rows : []
      resultTotal.value = Number(response?.data?.total ?? rows.length) || rows.length
      resultTruncated.value = Boolean(response?.data?.truncated)
      orders.value = groupInboundRows(rows)
    } else {
      const response = await listPurchaseOrder({
        pageNum: 1,
        pageSize: 1000,
        documentStatus: 'C',
        remainOnly: true
      })
      if (response?.code !== 200) throw new Error(response?.msg || '金蝶查询返回异常')
      const rows = Array.isArray(response?.data?.rows) ? response.data.rows : []
      resultTotal.value = Number(response?.data?.total ?? rows.length) || rows.length
      resultTruncated.value = Boolean(response?.data?.truncated)
      orders.value = groupPurchaseOrders(rows)
    }
    lastSyncedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    orders.value = []
    resultTotal.value = 0
    resultTruncated.value = false
    errorMessage.value = error?.data?.msg || error?.message || '请检查金蝶连接后重试'
  } finally {
    loading.value = false
  }
}

function openOrder(order) {
  activeOrder.value = order
  view.value = 'detail'
}

function backToList() {
  view.value = 'list'
  activeOrder.value = null
  confirmOpen.value = false
}

function printInspectionReports(item, order = activeOrder.value) {
  if (!order) return
  if (!isHistory.value) {
    toast.add({ title: '仅入库历史支持打印检验报告', color: 'warning' })
    return
  }
  try {
    const html = buildIncomingInspectionReportDocument(
      order,
      item ? [item] : order.items
    )
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', '来料检验报告打印')
    iframe.setAttribute('aria-hidden', 'true')
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      opacity: '0',
      pointerEvents: 'none'
    })
    document.body.appendChild(iframe)
    const frameWindow = iframe.contentWindow
    const frameDocument = frameWindow?.document
    if (!frameWindow || !frameDocument) throw new Error('浏览器不支持内嵌打印')

    frameDocument.open()
    frameDocument.write(html)
    frameDocument.close()

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      frameWindow.removeEventListener('afterprint', cleanup)
      iframe.remove()
    }
    frameWindow.addEventListener('afterprint', cleanup)
    setTimeout(() => {
      try {
        frameWindow.focus()
        frameWindow.print()
      } catch (error) {
        cleanup()
        toast.add({ title: '打印失败', description: error?.message || '请重试', color: 'error' })
      }
    }, 200)
    setTimeout(cleanup, 60_000)
  } catch (error) {
    toast.add({ title: '打印失败', description: error?.message || '没有可打印的入库明细', color: 'error' })
  }
}

async function completeInbound() {
  if (!activeOrder.value || isHistory.value) return
  submitting.value = true
  try {
    const billNo = activeOrder.value.billNo
    const response = await completePurchaseInbound({
      billNo,
      autoAudit: true
    })
    if (response?.code !== 200) throw new Error(response?.msg || '金蝶入库返回异常')
    const inboundBillNo = response?.data?.inboundBillNo || ''
    confirmOpen.value = false
    view.value = 'list'
    activeOrder.value = null
    toast.add({
      title: '入库成功',
      description: inboundBillNo
        ? `${billNo} 已下推并审核为 ${inboundBillNo}`
        : `${billNo} 已完成入库`,
      color: 'success'
    })
    playTone(900, 140)
    await loadOrders()
  } catch (error) {
    toast.add({
      title: '入库失败',
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
