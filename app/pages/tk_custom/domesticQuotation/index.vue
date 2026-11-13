<template>
  <div class="absolute inset-0 flex flex-col overflow-hidden bg-default text-default">
    <div class="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <!-- 紧凑型顶栏：标题 + 中性分段切换 + 右侧单主次操作按钮（与外贸报价单对齐） -->
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-file-spreadsheet" class="h-4 w-4" />
            </span>
            <h1 class="text-lg font-bold tracking-tight text-highlighted sm:text-xl">内贸销售报价单</h1>
          </div>

          <nav class="inline-flex items-center gap-0.5 rounded-lg border border-muted bg-muted/50 p-0.5" aria-label="内贸报价单功能">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-files"
              size="xs"
              class="rounded-md px-3 py-1 font-medium transition"
              :class="activeTab === 'list' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-default font-semibold' : 'text-muted hover:text-default'"
              @click="activeTab = 'list'"
            >
              报价单列表
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-chart-no-axes-combined"
              size="xs"
              class="rounded-md px-3 py-1 font-medium transition"
              :class="activeTab === 'analysis' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-default font-semibold' : 'text-muted hover:text-default'"
              @click="activeTab = 'analysis'"
            >
              销售汇总分析
            </UButton>
          </nav>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton v-if="canAnalysis" color="neutral" variant="outline" icon="i-lucide-calendar-check-2" size="sm" @click="openMonthlyReport">月结财务汇总</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" size="sm" @click="downloadTemplate">下载内贸模板</UButton>
          <UButton v-if="canUpload" color="primary" icon="i-lucide-plus" size="sm" @click="openUpload(null, 'form')">新建内贸报价单</UButton>
        </div>
      </header>

      <template v-if="activeTab === 'list'">
        <!-- Nuxt UI 一体化高密度工作台卡片：Toolbar + 内部滚动表格 + 底部分页条 -->
        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-muted bg-elevated/30 shadow-xs">
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-muted bg-elevated/60 px-3 py-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <UInput
                v-model="queryParams.keyword"
                size="sm"
                icon="i-lucide-search"
                placeholder="搜索报价单号、客户或文件名"
                class="w-full sm:w-60 lg:w-72"
                @keydown.enter="handleQuery"
              />
              <USelect
                :model-value="queryParams.status || 'ALL'"
                size="sm"
                :items="statusFilterOptions"
                value-key="value"
                label-key="label"
                placeholder="全部状态"
                class="w-32"
                @update:model-value="(val) => { queryParams.status = val === 'ALL' ? '' : val }"
              />
              <UPopover v-model:open="listDateRangeOpen" :content="{ align: 'start' }">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-calendar"
                  trailing-icon="i-lucide-chevron-down"
                  class="w-full justify-between font-normal sm:w-56"
                >
                  <span :class="listDateRange?.length === 2 ? 'text-highlighted' : 'text-muted'" class="truncate">{{ rangeDisplayText(listDateRange) || '提交日期范围' }}</span>
                </UButton>
                <template #content>
                  <div class="flex items-stretch divide-x divide-muted">
                    <div class="hidden sm:flex flex-col justify-center py-2">
                      <UButton
                        v-for="p in DATE_RANGE_PRESETS"
                        :key="p.label"
                        :label="p.label"
                        color="neutral"
                        variant="ghost"
                        class="rounded-none px-4"
                        :class="isPresetSelected(listDateRange, p, 'date') ? 'bg-elevated font-medium' : 'hover:bg-elevated/50'"
                        truncate
                        @click="applyListDateRangePreset(p)"
                      />
                      <UButton
                        v-if="listDateRange?.length"
                        label="清除"
                        color="neutral"
                        variant="ghost"
                        class="rounded-none px-4 text-error hover:bg-elevated/50"
                        truncate
                        @click="clearListDateRange"
                      />
                    </div>
                    <UCalendar
                      :default-value="rangeArrayToCalendar(listDateRange)"
                      range
                      :number-of-months="calendarMonths"
                      locale="zh-CN"
                      class="p-2"
                      @update:model-value="onListDateRangePick"
                    />
                  </div>
                </template>
              </UPopover>
              <div class="flex items-center gap-1.5">
                <UButton color="primary" variant="soft" size="sm" icon="i-lucide-search" @click="handleQuery">查询</UButton>
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="resetFilters">重置</UButton>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center gap-0.5 rounded-lg border border-muted bg-muted/50 p-0.5" role="group" aria-label="列表展示方式">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-folder-kanban"
                  class="rounded-md px-2.5 py-1 font-medium transition"
                  :class="listViewMode === 'customer' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-default font-semibold' : 'text-muted hover:text-default'"
                  @click="switchListViewMode('customer')"
                >按客户收录</UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-list"
                  class="rounded-md px-2.5 py-1 font-medium transition"
                  :class="listViewMode === 'flat' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-default font-semibold' : 'text-muted hover:text-default'"
                  @click="switchListViewMode('flat')"
                >按单据平铺</UButton>
              </div>
              <UButton
                v-if="listViewMode === 'customer' && customerGroups.length"
                size="xs"
                color="neutral"
                variant="outline"
                :icon="allCustomerGroupsExpanded ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
                @click="toggleAllCustomerGroups"
              >{{ allCustomerGroupsExpanded ? '全部收起' : '全部展开' }}</UButton>
              <UBadge v-if="listViewMode === 'customer'" color="neutral" variant="subtle" size="sm">共 {{ total }} 家客户 · {{ quoteTotalCount }} 份报价</UBadge>
              <UBadge v-else color="neutral" variant="subtle" size="sm">共 {{ total }} 条</UBadge>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                size="xs"
                :loading="loading"
                title="刷新列表"
                aria-label="刷新列表"
                @click="getList()"
              />
            </div>
          </div>

          <div v-if="error" class="shrink-0 border-b border-error/30 bg-error/5 px-4 py-2.5 text-xs text-error">{{ error }}</div>

          <div v-if="loading" class="min-h-0 flex-1 space-y-2.5 overflow-hidden p-4">
            <USkeleton v-for="item in 6" :key="item" class="h-11 w-full" />
          </div>

          <div v-else class="min-h-0 flex-1 overflow-auto">
            <template v-if="listViewMode === 'customer'">
              <div v-if="!customerGroups.length" class="flex flex-col items-center justify-center py-14 text-center">
                <div class="flex size-12 items-center justify-center rounded-2xl border border-muted bg-muted/40 text-muted">
                  <UIcon name="i-lucide-file-spreadsheet" class="size-6" />
                </div>
                <h3 class="mt-3 text-sm font-semibold text-highlighted">暂无内贸报价单</h3>
                <p class="mt-1 max-w-sm text-xs text-muted">可点击右上角新建在线填表，也可以下载内贸标准模板填写后导入。</p>
                <div class="mt-4 flex gap-2">
                  <UButton v-if="canUpload" color="primary" icon="i-lucide-plus" size="sm" @click="openUpload(null, 'form')">新建第一份报价单</UButton>
                  <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" size="sm" @click="downloadTemplate">下载空白模板</UButton>
                </div>
              </div>
              <table v-else class="w-full min-w-[1080px] table-fixed text-sm">
                <thead class="sticky top-0 z-10 bg-elevated shadow-[0_1px_0_0_var(--ui-border-muted)]">
                  <tr class="bg-muted/40 text-left text-xs font-semibold text-muted">
                    <th class="w-[23%] px-4 py-2.5">客户 / 报价单号</th>
                    <th class="w-[19%] px-4 py-2.5">收录统计 / 提交信息</th>
                    <th class="w-[9%] px-4 py-2.5">业务员</th>
                    <th class="w-[7%] px-4 py-2.5">明细</th>
                    <th class="w-[9%] px-4 py-2.5">状态</th>
                    <th class="w-[14%] px-4 py-2.5">最近更新</th>
                    <th class="w-[19%] min-w-[190px] px-3 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-muted">
                  <template v-for="group in customerGroups" :key="group.customerKey">
                    <tr
                      class="cursor-pointer transition-colors hover:bg-elevated/60"
                      :class="isCustomerGroupExpanded(group) ? 'bg-elevated/40' : ''"
                      :aria-expanded="isCustomerGroupExpanded(group)"
                      data-customer-group-row
                      @click="toggleCustomerGroup(group)"
                    >
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <div class="flex min-w-0 items-center gap-2">
                          <span class="flex size-5 shrink-0 items-center justify-center rounded-md border border-muted bg-default text-muted">
                            <UIcon
                              :name="isCustomerGroupExpanded(group) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                              class="size-3.5 transition-transform"
                            />
                          </span>
                          <UIcon name="i-lucide-building-2" class="size-4 shrink-0 text-primary" />
                          <span class="truncate font-semibold text-highlighted" :title="group.customerName">{{ group.customerName }}</span>
                        </div>
                      </td>
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <UBadge color="primary" variant="subtle" size="xs">收录 {{ group.quoteCount }} 单</UBadge>
                          <UBadge v-if="group.reviewableCount" color="warning" variant="solid" size="xs">{{ group.reviewableCount }} 单待您审核</UBadge>
                          <span v-else-if="group.latestQuoteNo" class="truncate font-mono text-xs text-muted" :title="`最新单号 ${group.latestQuoteNo}`">最新 {{ group.latestQuoteNo }}</span>
                        </div>
                      </td>
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <span class="truncate whitespace-nowrap text-default" :title="group.salespersonNames.join('、')">{{ group.salespersonNames.join('、') || '-' }}</span>
                      </td>
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <span class="whitespace-nowrap font-mono text-xs tabular-nums text-muted">共 {{ group.totalLineCount }} 行</span>
                      </td>
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <div class="flex flex-wrap items-center gap-1">
                          <UBadge :color="statusColor(group.latestStatus)" variant="soft" size="sm">{{ group.latestStatusLabel }}</UBadge>
                          <UBadge
                            v-if="group.pendingCount > 0 && !String(group.latestStatus || '').startsWith('PENDING_')"
                            color="warning"
                            variant="subtle"
                            size="xs"
                          >含待审 {{ group.pendingCount }}</UBadge>
                        </div>
                      </td>
                      <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                        <span class="whitespace-nowrap font-mono text-xs text-muted">{{ group.latestUpdateTime || '-' }}</span>
                      </td>
                      <td class="overflow-visible px-3 py-2.5 align-middle whitespace-nowrap" @click.stop>
                        <div class="flex flex-nowrap items-center justify-end gap-1">
                          <UButton
                            v-if="canReviewRow(group.latestQuotation)"
                            size="xs"
                            color="primary"
                            icon="i-lucide-clipboard-check"
                            @click="openReview(group.latestQuotation)"
                          >审核</UButton>
                          <UButton
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            :icon="isCustomerGroupExpanded(group) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                            @click="toggleCustomerGroup(group)"
                          >{{ isCustomerGroupExpanded(group) ? '收起' : `展开 (${group.quoteCount})` }}</UButton>
                        </div>
                      </td>
                    </tr>
                    <template v-if="isCustomerGroupExpanded(group)">
                      <tr
                        v-for="(item, itemIndex) in group.quotations"
                        :key="item.id || item.quoteNo"
                        class="cursor-pointer bg-default/60 transition-colors hover:bg-elevated/40"
                        data-customer-quote-row
                        @dblclick="handleRowOpen(item)"
                      >
                        <td class="overflow-hidden text-ellipsis py-2.5 pr-4 pl-9 align-middle">
                          <div class="flex items-center gap-2 border-l-2 border-primary/30 pl-3 leading-tight">
                            <button
                              type="button"
                              class="font-mono text-sm font-semibold text-primary hover:underline"
                              :aria-label="`查看报价单 ${item.quoteNo}`"
                              @click="openRecord(item)"
                            >{{ item.quoteNo }}</button>
                            <UBadge v-if="itemIndex === 0 && group.quoteCount > 1" color="primary" variant="subtle" size="xs">最新</UBadge>
                          </div>
                        </td>
                        <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                          <div
                            class="truncate text-[11px] text-muted"
                            :title="`提交 ${item.createTime || '-'} · ${item.originalName || '-'}`"
                          >{{ item.createTime || '-' }} · {{ item.originalName || '-' }}</div>
                        </td>
                        <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                          <span class="whitespace-nowrap text-default">{{ item.salespersonName || '-' }}</span>
                        </td>
                        <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                          <span class="whitespace-nowrap font-mono text-xs tabular-nums text-muted">{{ item.lineCount }} 行</span>
                        </td>
                        <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                          <UBadge :color="statusColor(item.status)" variant="soft" size="sm">{{ item.statusLabel }}</UBadge>
                        </td>
                        <td class="overflow-hidden text-ellipsis px-4 py-2.5 align-middle">
                          <span class="whitespace-nowrap font-mono text-xs text-muted">{{ item.updateTime || item.createTime || '-' }}</span>
                        </td>
                        <td class="overflow-visible px-3 py-2.5 align-middle whitespace-nowrap" @dblclick.stop>
                          <div class="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap" data-row-interaction="ignore">
                            <UButton
                              v-if="canReviewRow(item)"
                              size="xs"
                              color="primary"
                              variant="solid"
                              icon="i-lucide-clipboard-check"
                              @click="openReview(item)"
                            >审核</UButton>
                            <template v-else-if="item.canEditDraft">
                              <UButton
                                size="xs"
                                color="primary"
                                variant="soft"
                                icon="i-lucide-send"
                                @click="submitDraft(item)"
                              >{{ item.status === 'RETURNED' ? '重提' : '提交' }}</UButton>
                              <UButton
                                size="xs"
                                color="neutral"
                                variant="outline"
                                icon="i-lucide-square-pen"
                                @click="openUpload(item, 'form')"
                              >{{ item.status === 'RETURNED' ? '修改' : '编辑' }}</UButton>
                            </template>
                            <UButton
                              v-else-if="item.canDownload"
                              size="xs"
                              color="success"
                              variant="soft"
                              icon="i-lucide-download"
                              @click="downloadQuote(item.id)"
                            >下载</UButton>

                            <TkQuotationRemindButton business-type="DOMESTIC" :quotation="item" />

                            <UButton
                              size="xs"
                              color="neutral"
                              variant="ghost"
                              icon="i-lucide-eye"
                              @click="openRecord(item)"
                            >查看</UButton>

                            <UDropdownMenu v-if="rowMenuItems(item).length" :items="rowMenuItems(item)" :content="{ align: 'end' }">
                              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" aria-label="更多操作" />
                            </UDropdownMenu>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </template>

            <UTable
              v-else
              :data="list"
              :columns="columns"
              sticky
              :ui="listTableUi"
              class="w-full min-w-[1080px]"
              @dblclick="handleFlatTableDblclick"
            >
              <template #quoteNo-cell="{ row }">
                <div class="leading-tight">
                  <button
                    type="button"
                    class="font-mono text-sm font-semibold text-primary hover:underline"
                    :aria-label="`查看报价单 ${row.original.quoteNo}`"
                    @click="openRecord(row.original)"
                  >{{ row.original.quoteNo }}</button>
                  <div
                    class="mt-0.5 truncate text-[11px] text-muted"
                    :title="`提交 ${row.original.createTime || '-'} · ${row.original.originalName || '-'}`"
                  >{{ row.original.createTime || '-' }} · {{ row.original.originalName || '-' }}</div>
                </div>
              </template>
              <template #customerName-cell="{ row }">
                <div class="truncate font-medium text-highlighted" :title="row.original.customerName">{{ row.original.customerName || '未填写' }}</div>
              </template>
              <template #salespersonName-cell="{ row }">
                <span class="whitespace-nowrap text-default">{{ row.original.salespersonName || '-' }}</span>
              </template>
              <template #lineCount-cell="{ row }">
                <span class="whitespace-nowrap font-mono text-xs tabular-nums text-muted">{{ row.original.lineCount }} 行</span>
              </template>
              <template #status-cell="{ row }">
                <UBadge :color="statusColor(row.original.status)" variant="soft" size="sm">{{ row.original.statusLabel }}</UBadge>
              </template>
              <template #updateTime-cell="{ row }">
                <span class="whitespace-nowrap font-mono text-xs text-muted">{{ row.original.updateTime || row.original.createTime || '-' }}</span>
              </template>
              <template #actions-header>
                <div class="w-full text-right">操作</div>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap" data-row-interaction="ignore" @dblclick.stop>
                  <UButton
                    v-if="canReviewRow(row.original)"
                    size="xs"
                    color="primary"
                    variant="solid"
                    icon="i-lucide-clipboard-check"
                    @click="openReview(row.original)"
                  >审核</UButton>
                  <template v-else-if="row.original.canEditDraft">
                    <UButton
                      size="xs"
                      color="primary"
                      variant="soft"
                      icon="i-lucide-send"
                      @click="submitDraft(row.original)"
                    >{{ row.original.status === 'RETURNED' ? '重提' : '提交' }}</UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-square-pen"
                      @click="openUpload(row.original, 'form')"
                    >{{ row.original.status === 'RETURNED' ? '修改' : '编辑' }}</UButton>
                  </template>
                  <UButton
                    v-else-if="row.original.canDownload"
                    size="xs"
                    color="success"
                    variant="soft"
                    icon="i-lucide-download"
                    @click="downloadQuote(row.original.id)"
                  >下载</UButton>

                  <TkQuotationRemindButton business-type="DOMESTIC" :quotation="row.original" />

                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-eye"
                    @click="openRecord(row.original)"
                  >查看</UButton>

                  <UDropdownMenu v-if="rowMenuItems(row.original).length" :items="rowMenuItems(row.original)" :content="{ align: 'end' }">
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-ellipsis" aria-label="更多操作" />
                  </UDropdownMenu>
                </div>
              </template>
              <template #empty>
                <div class="flex flex-col items-center justify-center py-14 text-center">
                  <div class="flex size-12 items-center justify-center rounded-2xl border border-muted bg-muted/40 text-muted">
                    <UIcon name="i-lucide-file-spreadsheet" class="size-6" />
                  </div>
                  <h3 class="mt-3 text-sm font-semibold text-highlighted">暂无内贸报价单</h3>
                  <p class="mt-1 max-w-sm text-xs text-muted">可点击右上角新建在线填表，也可以下载内贸标准模板填写后导入。</p>
                </div>
              </template>
            </UTable>
          </div>

          <div v-if="total" class="shrink-0 border-t border-muted bg-elevated/40 px-3 py-1.5">
            <pagination
              v-model:page="queryParams.pageNum"
              v-model:limit="queryParams.pageSize"
              :total="total"
              :auto-scroll="false"
              @pagination="getList"
            />
          </div>
        </section>
      </template>

      <TkDomesticQuotationAnalysis v-else ref="analysisView" :can-export="canAnalysis" class="min-h-0 flex-1 overflow-y-auto pr-0.5" />
    </div>

    <UModal v-model:open="monthlyReportOpen" title="月结内贸报价财务汇总">
      <template #body>
        <div class="space-y-3 text-sm">
          <div class="rounded-lg border border-muted bg-muted/20 p-3 text-xs leading-relaxed text-muted">
            每月 20 日 08:00，系统自动通过企业微信应用推送上月 20 日至本月 19 日终审通过的月结报价单汇总。
          </div>
          <p v-if="monthlyReportLoading" class="text-muted">正在读取发送设置…</p>
          <UAlert v-if="monthlyReportError" color="error" variant="soft" :title="monthlyReportError" />
          <div v-if="monthlyReportInfo" class="grid grid-cols-1 gap-2 rounded-lg border border-muted bg-elevated/40 p-3 text-xs sm:grid-cols-2">
            <div><span class="text-muted">统计周期：</span><span class="font-mono text-highlighted">{{ monthlyReportInfo.period.from }} ~ {{ monthlyReportInfo.period.to }}</span></div>
            <div><span class="text-muted">自动推送：</span><span class="font-medium text-highlighted">{{ monthlyReportInfo.enabled ? '已启用' : '未启用' }} · {{ monthlyReportInfo.recipientName || '未配置接收人' }}</span></div>
            <div v-if="monthlyReportInfo.lastRun" class="sm:col-span-2"><span class="text-muted">最近一期：</span><span class="font-mono text-highlighted">{{ monthlyReportInfo.lastRun.report_month }}</span> · {{ monthlyRunStatus(monthlyReportInfo.lastRun.status) }}</div>
            <div v-if="monthlyReportInfo.lastRun?.error_message" class="text-error sm:col-span-2">{{ monthlyReportInfo.lastRun.error_message }}</div>
          </div>
          <p class="text-xs text-muted">按终审通过时间筛选。仅为报价参考数据，不代表实际应收或回款；本期未结束时导出截至当前已通过记录。</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" size="sm" @click="monthlyReportOpen = false">关闭</UButton>
          <UButton color="primary" size="sm" icon="i-lucide-download" @click="downloadMonthlyReport">下载本期 XLSX</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="uploadOpen" :title="entryModalTitle" :ui="entryModalUi">
      <template #body>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto bg-muted/20 p-2.5 sm:overflow-hidden sm:p-3">
          <div class="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-default bg-elevated px-3 py-1.5 shadow-xs">
            <div class="flex items-center gap-0.5 rounded-lg border border-default/40 bg-muted/70 p-0.5">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-table-2"
                class="rounded-md px-2.5 py-1 transition"
                :class="inputMode === 'form' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-border/50 font-semibold' : 'text-muted hover:text-default'"
                @click="switchInputMode('form')"
              >在线表格录入</UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-file-up"
                class="rounded-md px-2.5 py-1 transition"
                :class="inputMode === 'upload' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-border/50 font-semibold' : 'text-muted hover:text-default'"
                @click="switchInputMode('upload')"
              >导入 Excel 模板</UButton>
            </div>
            <div class="hidden items-center gap-2 text-xs text-muted sm:flex">
              <UBadge v-if="inputMode === 'upload'" color="neutral" variant="subtle" size="xs">内贸标准模板</UBadge>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-info" class="size-3.5 text-primary" />
                {{ inputMode === 'form' ? '支持从 Excel 整块复制粘贴，明细行自动扩展' : '上传填好的 .xlsx 标准模板，抬头与明细自动入库' }}
              </span>
            </div>
          </div>

          <template v-if="inputMode === 'form'">
            <!-- 对齐 4 列 × 2 行紧凑抬头卡片 -->
            <div class="grid shrink-0 grid-cols-1 gap-x-3 gap-y-2 rounded-xl border border-muted bg-elevated p-3 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
              <UFormField label="客户名称" required size="xs">
                <UInput v-model="formData.customerName" size="sm" placeholder="填写客户名称" class="w-full" />
              </UFormField>
              <UFormField label="客户性质" required size="xs">
                <USelect v-model="formData.customerStyle" size="sm" :items="QUOTATION_CUSTOMER_STYLE_OPTIONS" class="w-full" />
              </UFormField>
              <UFormField label="客户收款方式" size="xs">
                <UInput v-model="formData.paymentTerm" size="sm" placeholder="默认现金，可修改" class="w-full" />
              </UFormField>
              <UFormField label="报价日期" size="xs">
                <UPopover v-model:open="quoteDateOpen" :content="{ align: 'start' }">
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-calendar"
                    trailing-icon="i-lucide-chevron-down"
                    class="w-full justify-between font-normal"
                  >
                    <span :class="formData.quoteDate ? 'font-mono text-highlighted' : 'text-muted'">{{ formData.quoteDate || '选择报价日期' }}</span>
                  </UButton>
                  <template #content>
                    <UCalendar
                      :model-value="dateStringToCalendar(formData.quoteDate)"
                      locale="zh-CN"
                      class="p-2"
                      @update:model-value="onQuoteDatePick"
                    />
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="客户应用" size="xs">
                <UInput v-model="formData.customerApplication" size="sm" placeholder="如电源、家电、汽车电子" class="w-full" />
              </UFormField>
              <UFormField label="联系人" size="xs">
                <UInput v-model="formData.contactText" size="sm" placeholder="客户方联系人（选填）" class="w-full" />
              </UFormField>
              <UFormField label="客户电话" size="xs">
                <UInput v-model="formData.customerPhone" size="sm" placeholder="选填" class="w-full" />
              </UFormField>
              <UFormField label="客户地址" size="xs">
                <UInput v-model="formData.customerAddress" size="sm" placeholder="选填，与模板地址一致" class="w-full" />
              </UFormField>
            </div>
            <TkQuotationLowPriceNotice business-type="DOMESTIC" :customer-name="formData.customerName" :lines="formData.lines" :id="editingId || 0" />
            <div class="min-h-[20rem] shrink-0 sm:min-h-0 sm:flex-1">
              <TkDomesticQuotationGrid
                ref="domesticGridRef"
                v-model="formData.lines"
                :can-undo="domesticGridCanUndo"
                :can-redo="domesticGridCanRedo"
                @edit="recordDomesticGridEdit"
                @history="applyDomesticGridHistory"
                @row-action="handleDomesticGridRowAction"
              />
            </div>
          </template>

          <div v-else class="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto">
            <input ref="uploadFileInput" type="file" accept=".xlsx" class="hidden" @change="selectFile">

            <!-- 已选文件卡片 -->
            <div
              v-if="selectedFile"
              class="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-primary/30 bg-elevated p-6 text-center shadow-xs"
            >
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
                <UIcon name="i-lucide-file-check-2" class="h-6 w-6" />
              </div>
              <div class="space-y-1">
                <p class="break-all text-sm font-semibold text-highlighted sm:text-base">{{ selectedFile.name }}</p>
                <p class="font-mono text-xs text-muted">{{ formatFileSize(selectedFile.size) }} · 已就绪，可点击右下角保存草稿或导入提交初审</p>
              </div>
              <div class="flex items-center gap-2">
                <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-refresh-cw" @click="triggerUploadSelect">更换文件</UButton>
                <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="clearSelectedFile">移除</UButton>
              </div>
            </div>

            <!-- 未选文件拖拽区 -->
            <div
              v-else
              class="group relative flex min-h-[240px] w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-elevated/80 p-6 text-center shadow-xs transition-all duration-150 hover:border-primary/60 hover:bg-primary/[0.02]"
              :class="{ 'border-primary bg-primary/10 ring-4 ring-primary/10': isDraggingUpload }"
              @click="triggerUploadSelect"
              @dragover.prevent="isDraggingUpload = true"
              @dragleave.prevent="isDraggingUpload = false"
              @drop.prevent="handleUploadDrop"
            >
              <div class="pointer-events-none flex max-w-md flex-col items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-4 ring-primary/5 transition-transform duration-150 group-hover:scale-105">
                  <UIcon name="i-lucide-upload-cloud" class="h-6 w-6" />
                </div>
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-highlighted sm:text-base">
                    点击选择本地文件，或将填好的内贸 Excel 拖入此处
                  </p>
                  <p class="text-xs text-muted">
                    支持内贸标准 .xlsx 报价单 · 单文件上限 20MB · 明细行可动态扩展
                  </p>
                </div>
                <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 pt-1" @click.stop>
                  <UButton color="primary" icon="i-lucide-folder-open" size="sm" @click="triggerUploadSelect">选择本地 Excel 文件</UButton>
                  <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-download" @click="downloadTemplate">下载内贸模板 (.xlsx)</UButton>
                </div>
              </div>
            </div>

            <div class="shrink-0 rounded-xl border border-muted bg-elevated px-4 py-2.5 shadow-xs">
              <div class="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                <div class="flex items-start gap-2">
                  <UIcon name="i-lucide-columns-3" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <div class="font-medium text-highlighted">抬头自动提取</div>
                    <div class="mt-0.5 text-[11px] text-muted">客户名称、客户性质、收款方式与客户应用自动从模板抬头读取。</div>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <UIcon name="i-lucide-coins" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <div class="font-medium text-highlighted">含税单价统一口径</div>
                    <div class="mt-0.5 text-[11px] text-muted">系统按元/PCS 标准化展示与审核比价，自动检测历史最低价预警。</div>
                  </div>
                </div>
                <div class="flex items-start gap-2">
                  <UIcon name="i-lucide-refresh-cw" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <div class="font-medium text-highlighted">三级审批流转</div>
                    <div class="mt-0.5 text-[11px] text-muted">提交后按初审 → 二审 → 终审流转，已退回单据重新导入将整单覆盖。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <UAlert v-if="uploadError" color="error" variant="soft" icon="i-lucide-circle-alert" :title="uploadError" class="shrink-0" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <span class="hidden text-xs text-muted sm:block">保存草稿仅本人可见；提交后按初审 → 二审 → 终审流转</span>
          <div class="ml-auto flex flex-wrap justify-end gap-2">
            <UButton color="neutral" variant="outline" size="sm" :disabled="uploading" @click="requestCloseUpload">取消</UButton>
            <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-save" :loading="uploading" :disabled="inputMode === 'upload' && !selectedFile" @click="submitCurrent('save')">保存草稿</UButton>
            <UButton color="primary" size="sm" icon="i-lucide-send" :loading="uploading" :disabled="inputMode === 'upload' && !selectedFile" @click="submitCurrent('submit')">{{ inputMode === 'form' ? (editingId ? '修改并提交初审' : '提交初审') : (editingId ? '修改并提交初审' : '导入并提交初审') }}</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="detailOpen"
      :title="reviewStage ? `${reviewStageLabel}内贸报价单` : '内贸报价单详情'"
      :ui="{
        content: 'w-[96vw] max-w-7xl max-h-[92dvh] flex flex-col max-sm:w-screen max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none',
        header: 'shrink-0 border-b border-muted bg-elevated px-4 py-2.5',
        body: 'min-h-0 flex-1 overflow-y-auto p-3 sm:p-4',
        footer: 'shrink-0 border-t border-muted bg-elevated px-3 py-2.5 sm:px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))]',
      }"
    >
      <template #body>
        <div v-if="detail" class="space-y-3">
          <!-- 抬头信息区 -->
          <div class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <div class="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
                  <UIcon name="i-lucide-building-2" class="h-3.5 w-3.5" />
                </div>
                <h3 class="min-w-0 break-words text-base font-bold text-highlighted sm:text-lg">{{ detail.customerName || '-' }}</h3>
                <UBadge :color="statusColor(detail.status)" variant="soft" size="sm">{{ detail.statusLabel }}</UBadge>
                <span class="hidden font-mono text-xs text-muted sm:inline">单号：{{ detail.quoteNo }}</span>
                <UBadge color="neutral" variant="subtle" size="xs">{{ detail.lineCount }} 项物料</UBadge>
              </div>
              <UButton
                v-if="detail.canDownload && !reviewStage"
                color="success"
                variant="soft"
                size="xs"
                icon="i-lucide-download"
                class="hidden sm:inline-flex"
                @click="downloadQuote(detail.id)"
              >下载已审核 Excel</UButton>
            </div>

            <!-- 手机端折叠摘要 -->
            <div class="space-y-2 sm:hidden">
              <p class="break-all font-mono text-xs text-muted">{{ detail.quoteNo }}</p>
              <details class="rounded-lg border border-muted bg-elevated/30">
                <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-muted">客户与单据信息</summary>
                <dl class="grid grid-cols-2 gap-3 px-3 pb-3 text-xs">
                  <div v-for="field in phoneDetailFields" :key="field.label" class="min-w-0">
                    <dt class="text-muted">{{ field.label }}</dt>
                    <dd class="mt-1 break-words text-highlighted">{{ field.value || '—' }}</dd>
                  </div>
                </dl>
              </details>
            </div>

            <!-- 桌面端整齐 4 列卡片 -->
            <dl class="hidden grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-muted/80 bg-muted/20 px-4 py-2.5 text-xs sm:grid lg:grid-cols-4">
              <div class="min-w-0"><dt class="text-muted">业务员 / 联系人</dt><dd class="mt-0.5 truncate font-medium text-highlighted">{{ detail.salespersonName || '-' }} / {{ detail.contactText || '-' }}</dd></div>
              <div><dt class="text-muted">客户性质 / 收款方式</dt><dd class="mt-0.5 font-medium text-highlighted">{{ detail.customerStyle || '-' }} · {{ detail.paymentTerm || '-' }}</dd></div>
              <div><dt class="text-muted">客户应用</dt><dd class="mt-0.5 truncate text-highlighted" :title="detail.customerApplication">{{ detail.customerApplication || '-' }}</dd></div>
              <div><dt class="text-muted">报价日期 / 最近更新</dt><dd class="mt-0.5 font-mono tabular-nums text-highlighted">{{ detail.quoteDate || '-' }} · {{ detail.updateTime || '-' }}</dd></div>
              <div class="sm:col-span-2 lg:col-span-3"><dt class="text-muted">客户地址</dt><dd class="mt-0.5 break-words text-highlighted">{{ detail.customerAddress || '-' }}</dd></div>
              <div><dt class="text-muted">客户电话</dt><dd class="mt-0.5 font-mono text-highlighted">{{ detail.customerPhone || '-' }}</dd></div>
            </dl>

            <!-- 历史各级审核意见条 -->
            <div v-if="detail.initialComment || detail.secondComment || detail.finalComment" class="flex flex-wrap items-center gap-1.5 text-xs">
              <span v-if="detail.initialComment" class="max-w-md truncate rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary" :title="detail.initialComment">初审意见: {{ detail.initialComment }}</span>
              <span v-if="detail.secondComment" class="max-w-md truncate rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary" :title="detail.secondComment">二审意见: {{ detail.secondComment }}</span>
              <span v-if="detail.finalComment" class="max-w-md truncate rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning" :title="detail.finalComment">终审意见: {{ detail.finalComment }}</span>
            </div>
          </div>

          <!-- 审核态顶部提示条 -->
          <div v-if="reviewStage" class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
            <span class="flex items-center gap-1.5 font-medium text-highlighted">
              <UIcon name="i-lucide-clipboard-pen-line" class="size-4 text-primary" />
              正在进行{{ reviewStageLabel }}：可直接修改下方「本次审核价（元/PCS）」，核对无误后在底部提交结果。
            </span>
          </div>

          <!-- 明细表格卡片 -->
          <section class="overflow-hidden rounded-xl border border-muted bg-elevated/20 shadow-xs">
            <div class="flex items-center justify-between border-b border-muted bg-elevated/60 px-3.5 py-2 text-xs font-semibold text-highlighted">
              <span>报价明细（{{ detailLines.length }} 行）</span>
              <span class="font-normal text-muted">单价单位：含税 元/PCS</span>
            </div>
            <TkQuotationLowPriceNotice v-if="detail.status !== 'APPROVED'" business-type="DOMESTIC" :lines="detailLines" :id="detail.id" />
            <TkDomesticQuotationLineCards class="sm:hidden" :lines="detailLines" :review-stage="reviewStage" :format-price="formatPrice" @review-price="updatePhoneReviewPrice" />
            <div class="hidden overflow-x-auto sm:block">
              <table class="w-full min-w-[760px] table-fixed text-sm">
                <thead class="bg-muted/40 text-left text-xs font-semibold text-muted">
                  <tr>
                    <th class="w-12 whitespace-nowrap px-3 py-2.5">序号</th>
                    <th
                      v-for="column in domesticColumns"
                      :key="column.key"
                      class="px-3 py-2.5"
                      :style="{ width: detailColumnWidths[column.key] }"
                      :class="['originalPriceRmb', 'minPackCount'].includes(column.key) ? 'text-right' : ''"
                    >{{ column.key === 'originalPriceRmb' && reviewStage ? '本次审核价（元/PCS）' : column.label }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-muted">
                  <tr v-for="line in detailLines" :key="line.id || line.lineNo" class="hover:bg-elevated/40">
                    <td class="px-3 py-2.5 align-top font-mono text-xs tabular-nums text-muted">{{ line.lineNo }}</td>
                    <td
                      v-for="column in domesticColumns"
                      :key="column.key"
                      class="break-words px-3 py-2.5 align-top"
                      :class="[column.key === 'ctkMpn' ? 'font-medium text-highlighted' : '', ['originalPriceRmb', 'minPackCount'].includes(column.key) ? 'text-right tabular-nums' : '']"
                    >
                      <template v-if="column.key === 'originalPriceRmb'">
                        <div v-if="!domesticQuotationUnit(line.unit)" class="text-xs text-warning">单位待核对（原值）</div>
                        <div v-if="reviewStage" class="space-y-1.5">
                          <UInput
                            v-model="line.reviewPriceRmb"
                            :disabled="!domesticQuotationUnit(line.unit)"
                            type="number"
                            min="0.00001"
                            step="0.00001"
                            size="sm"
                            class="w-full"
                            :ui="{ base: 'text-right font-mono tabular-nums' }"
                            :aria-label="`第${line.lineNo}行本次审核价`"
                          />
                          <div class="space-y-0.5 text-[11px] text-muted">
                            <div>原报价 ¥{{ formatPrice(line.originalPriceRmb) }}</div>
                            <div v-if="reviewStage !== 'initial'">审核前 ¥{{ formatPrice(line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb) }}</div>
                            <div v-if="reviewPriceDifference(line) !== null && reviewPriceDifference(line) !== 0" class="font-medium text-primary">
                              较审核前 {{ reviewPriceDifference(line) > 0 ? '+' : '' }}{{ formatPrice(reviewPriceDifference(line)) }} 元
                            </div>
                          </div>
                        </div>
                        <span v-else class="font-mono font-medium tabular-nums text-highlighted">￥{{ formatPrice(line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb) }}</span>
                      </template>
                      <span v-else>{{ line[column.key] || '-' }}<span v-if="column.key === 'minPackCount' && !domesticQuotationUnit(line.unit)" class="ml-1 text-xs text-warning">（单位待核对，原值）</span></span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- 审批记录折叠区 -->
          <details v-if="detail.revisions?.length" class="group rounded-xl border border-muted bg-elevated/20">
            <summary class="flex cursor-pointer items-center gap-2 px-3.5 py-2 text-xs font-semibold text-highlighted">
              <UIcon name="i-lucide-history" class="size-3.5 text-primary" />
              <span>审批记录</span>
              <span class="font-normal text-muted">（{{ detail.revisions.length }} 条）</span>
            </summary>
            <ol class="divide-y divide-muted border-t border-muted">
              <li v-for="revision in detail.revisions" :key="revision.id" class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3.5 py-2 text-xs">
                <div>
                  <span class="font-medium text-highlighted">{{ revision.actionLabel || revision.action }}</span>
                  <span class="ml-2 text-muted">{{ revision.operatorName }}</span>
                  <p v-if="revision.comment" class="mt-0.5 whitespace-pre-wrap text-muted">{{ revision.comment }}</p>
                </div>
                <time class="font-mono text-muted">{{ revision.createTime }}</time>
              </li>
            </ol>
          </details>
        </div>
        <div v-else class="py-12 text-center text-sm text-muted">正在加载报价单...</div>
      </template>

      <template #footer>
        <!-- 审核态固定底部工作台：审核意见 + 退出/退回/通过同屏置底，无需滚到底找输入框 -->
        <div v-if="reviewStage" class="flex w-full flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0 flex-1">
            <UTextarea
              v-model="reviewComment"
              :rows="2"
              autoresize
              size="sm"
              class="w-full"
              placeholder="填写审核说明（选填；退回修改时必填原因）"
            />
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <UButton color="neutral" variant="ghost" size="sm" :disabled="reviewing" @click="reviewStage = ''">退出审核</UButton>
            <UButton color="error" variant="soft" size="sm" icon="i-lucide-undo-2" :loading="reviewing" @click="submitReview('return')">退回修改</UButton>
            <UButton color="primary" size="sm" icon="i-lucide-check" :loading="reviewing" @click="submitReview('approve')">{{ reviewStageLabel }}通过</UButton>
          </div>
        </div>

        <!-- 查看态底部：左辅助/逆向动作，右常规关闭与单一主行动点 -->
        <div v-else class="flex w-full flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <UButton v-if="detail?.canDeleteDraft" color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="handleDeleteFromDetail(detail)">删除草稿</UButton>
            <UButton v-if="detail?.canWithdraw" color="warning" variant="soft" size="sm" icon="i-lucide-undo-2" @click="handleWithdrawFromDetail(detail)">撤回为草稿</UButton>
            <UButton v-if="detail?.canUndoReview" color="warning" variant="soft" size="sm" icon="i-lucide-undo-2" @click="undoApproval(detail)">撤销通过</UButton>
            <TkQuotationRemindButton business-type="DOMESTIC" :quotation="detail" size="sm" variant="soft" />
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton color="neutral" variant="outline" size="sm" @click="closeDetail">关闭</UButton>
            <UButton v-if="detail?.canDownload" color="success" variant="soft" size="sm" icon="i-lucide-download" @click="downloadQuote(detail.id)">下载已审核报价单</UButton>
            <UButton v-if="detail?.canEditDraft" color="neutral" variant="outline" size="sm" icon="i-lucide-square-pen" @click="openEditFromDetail(detail)">{{ detail?.status === 'RETURNED' ? '修改报价单' : '编辑草稿' }}</UButton>
            <UButton v-if="detail?.canEditDraft" color="primary" size="sm" icon="i-lucide-send" @click="handleSubmitFromDetail(detail)">{{ detail?.status === 'RETURNED' ? '重新提交初审' : '提交初审' }}</UButton>
            <UButton v-if="canReviewRow(detail)" color="primary" size="sm" icon="i-lucide-clipboard-check" @click="startReview">{{ reviewBeginLabel }}</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import TkQuotationRemindButton from '@/packages/ui/TkQuotationRemindButton.vue'
import TkQuotationLowPriceNotice from '@/packages/ui/TkQuotationLowPriceNotice.vue'
import { confirmQuotationLowPrices } from '@/utils/quotationLowPrice'
import { computed, onMounted, ref, watch } from 'vue'
import useUserStore from '@/store/modules/user'
import { useTkListQuery } from '@/packages/composables/useTkListQuery.js'
import { useTkAutoRefresh } from '@/packages/composables/useTkAutoRefresh.js'
import { createQuotationPasteHistory, formatQuotationDate } from '@ctk-system/shared'
import { resolveRowFromDoubleClick } from '@ctk-system/ui'
import {
  DATE_RANGE_PRESETS,
  calendarToArray,
  calendarToDateString,
  dateStringToCalendar,
  isPresetSelected,
  presetToArray,
  rangeArrayToCalendar,
  rangeDisplayText,
  useCalendarMonths,
} from '@/packages/shared/dateRange'
import {
  getDomesticQuotationMonthlyReport,
  getDomesticQuotationMonthlyExportUrl,
  deleteDomesticQuotation,
  createDomesticQuotation,
  getDomesticQuotation,
  getDomesticQuotationDownloadUrl,
  getDomesticQuotationTemplateUrl,
  listDomesticQuotations,
  reviewDomesticQuotation,
  submitDomesticQuotation,
  updateDomesticQuotationDraft,
  uploadDomesticQuotation,
  withdrawDomesticQuotation,
} from '@/api/tk_custom/domesticQuotation'
import TkDomesticQuotationGrid from '@/packages/ui/TkDomesticQuotationGrid.vue'
import TkDomesticQuotationLineCards from '@/packages/ui/TkDomesticQuotationLineCards.vue'
import { domesticLineToPcs, domesticQuotationUnit, domesticReviewPriceToStored } from '@/packages/shared/domesticQuotationUnits.js'
import { QUOTATION_CUSTOMER_STYLE_OPTIONS } from '@/packages/shared/quotationOptions.js'
import TkDomesticQuotationAnalysis from '@/packages/ui/TkDomesticQuotationAnalysis.vue'
import {
  blankDomesticQuotationLine,
  DOMESTIC_QUOTATION_COLUMNS,
  DOMESTIC_QUOTATION_INITIAL_LINES,
  groupDomesticQuotationsByCustomer,
  hasDomesticQuotationLineData,
} from '@/packages/ui/domesticQuotationGrid.js'

definePageMeta({ title: '内贸销售报价单', permission: 'tk_custom:domesticQuotation:list' })

const toast = useToast()
const userStore = useUserStore()
const activeTab = ref('list')
const analysisView = ref(null)
const queryParams = ref({ pageNum: 1, pageSize: 50, keyword: '', status: '' })
const listDateRange = ref([])
const listDateRangeOpen = ref(false)
const quoteDateOpen = ref(false)
const calendarMonths = useCalendarMonths()

function onListDateRangePick(range) {
  if (!range?.start || !range?.end) return
  listDateRange.value = calendarToArray(range, 'date')
  listDateRangeOpen.value = false
}
function applyListDateRangePreset(preset) {
  listDateRange.value = presetToArray(preset, 'date')
  listDateRangeOpen.value = false
}
function clearListDateRange() {
  listDateRange.value = []
  listDateRangeOpen.value = false
}
function onQuoteDatePick(day) {
  formData.value.quoteDate = day ? calendarToDateString(day) : ''
  quoteDateOpen.value = false
}

const {
  loading,
  list,
  total,
  error,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: async () => {
    const dateFilter = listDateRange.value?.length === 2
      ? { from: listDateRange.value[0], to: listDateRange.value[1] }
      : {}
    const params = listViewMode.value === 'customer'
      ? { ...queryParams.value, ...dateFilter, groupBy: 'customer' }
      : { ...queryParams.value, ...dateFilter }
    const response = await listDomesticQuotations(params)
    if (response?.code === 200) {
      quoteTotal.value = Number(response.quoteTotal ?? response.total ?? (response.rows?.length || 0))
    }
    return response
  },
})

const listViewMode = ref('customer')
const quoteTotal = ref(0)
const expandedCustomerMap = ref({})
const customerGroups = computed(() => groupDomesticQuotationsByCustomer(list.value))
const quoteTotalCount = computed(() => quoteTotal.value || list.value.length)

function isCustomerGroupExpanded(group) {
  const key = group?.customerKey
  if (!key) return false
  if (Object.prototype.hasOwnProperty.call(expandedCustomerMap.value, key)) {
    return Boolean(expandedCustomerMap.value[key])
  }
  if (group.reviewableCount > 0) return true
  if (String(queryParams.value.keyword || '').trim() && customerGroups.value.length <= 5) return true
  return false
}

function toggleCustomerGroup(group) {
  const key = group?.customerKey
  if (!key) return
  expandedCustomerMap.value = {
    ...expandedCustomerMap.value,
    [key]: !isCustomerGroupExpanded(group),
  }
}

const allCustomerGroupsExpanded = computed(() =>
  customerGroups.value.length > 0 && customerGroups.value.every((group) => isCustomerGroupExpanded(group)),
)

function toggleAllCustomerGroups() {
  const target = !allCustomerGroupsExpanded.value
  const nextMap = { ...expandedCustomerMap.value }
  for (const group of customerGroups.value) {
    nextMap[group.customerKey] = target
  }
  expandedCustomerMap.value = nextMap
}

function switchListViewMode(mode) {
  if (listViewMode.value === mode) return
  listViewMode.value = mode
  queryParams.value.pageNum = 1
  void getList()
}

const statusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待初审', value: 'PENDING_INITIAL' },
  { label: '待二审', value: 'PENDING_SECOND' },
  { label: '待终审', value: 'PENDING_FINAL' },
  { label: '已退回', value: 'RETURNED' },
  { label: '已通过', value: 'APPROVED' },
]
const statusFilterOptions = [
  { label: '全部状态', value: 'ALL' },
  ...statusOptions,
]
const columns = [
  { id: 'quoteNo', header: '报价单号 / 提交时间', meta: { class: { th: 'w-[21%]' } } },
  { id: 'customerName', header: '客户', meta: { class: { th: 'w-[21%]' } } },
  { id: 'salespersonName', header: '业务员', meta: { class: { th: 'w-[9%]' } } },
  { id: 'lineCount', header: '明细', meta: { class: { th: 'w-[7%]' } } },
  { id: 'status', header: '状态', meta: { class: { th: 'w-[9%]' } } },
  { id: 'updateTime', header: '最近更新', meta: { class: { th: 'w-[14%]' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-[19%] min-w-[190px]', td: 'overflow-visible px-3 whitespace-nowrap' } } },
]
const listTableUi = {
  base: 'w-full min-w-[1080px] table-fixed',
  th: 'bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted',
  td: 'overflow-hidden text-ellipsis px-4 py-2.5 align-middle text-sm',
  tr: 'cursor-pointer transition-colors hover:bg-elevated/40',
}
const can = (permission) => Number(userStore.id) === 1
  || userStore.permissions?.includes(permission)
  || userStore.permissions?.includes('*:*:*')
  || userStore.permissions?.includes('tk_custom:domesticQuotation:*')
const canUpload = computed(() => can('tk_custom:domesticQuotation:upload'))
const canAnalysis = computed(() => can('tk_custom:domesticQuotation:analysis'))
const domesticColumns = DOMESTIC_QUOTATION_COLUMNS
const detailColumnWidths = { ctkMpn: '20%', customerMaterialName: '30%', packageName: '10%', minPackCount: '10%', originalPriceRmb: '18%', remark: '12%' }

function reviewPriceDifference(line) {
  const value = line.reviewPriceRmb
  if (value == null || String(value).trim() === '') return null
  const current = Number(value)
  const previous = Number(line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb)
  return Number.isFinite(current) && Number.isFinite(previous) ? Math.round((current - previous) * 1e8) / 1e8 : null
}

watch(error, (message) => {
  if (message) toast.add({ title: '内贸报价单列表加载失败', description: message, color: 'error' })
})

function resetFilters() {
  expandedCustomerMap.value = {}
  listDateRange.value = []
  Object.assign(queryParams.value, { pageNum: 1, keyword: '', status: '' })
  resetQuery()
}

function handleRowOpen(row) {
  if (!row) return
  if (row.canEditDraft) {
    openUpload(row, 'form')
    return
  }
  openRecord(row)
}

function handleFlatTableDblclick(event) {
  const row = resolveRowFromDoubleClick(event, list.value)
  if (!row) return
  handleRowOpen(row)
}

function statusColor(status) {
  return ({ DRAFT: 'neutral', PENDING_INITIAL: 'warning', PENDING_SECOND: 'info', PENDING_FINAL: 'primary', RETURNED: 'error', APPROVED: 'success' })[status] || 'neutral'
}

async function undoApproval(record) {
  if (!record?.canUndoReview || !window.confirm(`确定撤销报价单【${record.quoteNo}】最近一次审核通过吗？\n将恢复审核前价格，回到本级待审核。`)) return
  try {
    const response = await reviewDomesticQuotation({ id: record.id, stage: record.undoReviewStage, action: 'undo' })
    if (response?.code !== 200) throw new Error(response?.msg || '撤销失败')
    toast.add({ title: '已撤销通过', color: 'success' })
    const refreshed = await getDomesticQuotation(record.id)
    if (refreshed?.code === 200) detail.value = refreshed.data
    await getList()
  } catch (error) { toast.add({ title: error?.message || '撤销失败', color: 'error' }) }
}

function canReviewRow(row) {
  return Boolean(row?.canInitialReview || row?.canSecondReview || row?.canFinalReview)
}

const uploadOpen = ref(false)
const uploadError = ref('')
const uploadFileInput = ref(null)
const selectedFile = ref(null)
const isDraggingUpload = ref(false)
const editingId = ref(null)
const editingQuoteNo = ref('')
const uploading = ref(false)
const inputMode = ref('form')
const domesticGridRef = ref(null)
const formData = ref(blankDomesticQuotationForm())
const domesticGridHistoryLimit = 50
const domesticGridHistory = createQuotationPasteHistory(domesticGridHistoryLimit)
const domesticGridUndoDepth = ref(0)
const domesticGridRedoDepth = ref(0)
const domesticGridCanUndo = computed(() => domesticGridUndoDepth.value > 0)
const domesticGridCanRedo = computed(() => domesticGridRedoDepth.value > 0)
const formSnapshot = ref('')
const formDirty = computed(() => serializeDomesticForm(formData.value) !== formSnapshot.value)
const entryDirty = computed(() => formDirty.value || Boolean(selectedFile.value))
const entryModalTitle = computed(() => editingId.value ? `编辑内贸报价单 · ${editingQuoteNo.value}` : '新建内贸报价单')
const entryModalUi = {
  content: 'quotation-upload-modal-content flex h-[92vh] w-[96vw] supports-[height:100dvh]:h-[92dvh] max-w-[96vw] flex-col overflow-hidden',
  body: 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden',
  header: 'shrink-0 border-b border-muted bg-elevated px-4 py-2',
  footer: 'shrink-0 border-t border-muted bg-elevated px-4 py-2',
}

function blankDomesticQuotationForm() {
  return {
    customerName: '',
    customerAddress: '',
    customerPhone: '',
    paymentTerm: '现金',
    customerApplication: '',
    customerStyle: '终端',
    contactText: '',
    quoteDate: '',
    lines: Array.from({ length: DOMESTIC_QUOTATION_INITIAL_LINES }, (_, index) => blankDomesticQuotationLine(index + 1)),
  }
}

function serializeDomesticForm(form) {
  return JSON.stringify({
    customerName: String(form?.customerName || '').trim(),
    customerStyle: form?.customerStyle || '终端',
    customerAddress: form?.customerAddress || '',
    customerPhone: form?.customerPhone || '',
    paymentTerm: form?.paymentTerm || '现金',
    customerApplication: form?.customerApplication || '',
    contactText: String(form?.contactText || '').trim(),
    quoteDate: String(form?.quoteDate || '').trim(),
    lines: (form?.lines || []).filter(hasDomesticQuotationLineData).map((line) => Object.fromEntries(
      DOMESTIC_QUOTATION_COLUMNS.map(({ key }) => [key, String(line?.[key] ?? '').trim()]),
    )),
  })
}

function cloneDomesticGridLines(lines = formData.value.lines) {
  return Array.from({ length: Math.max(DOMESTIC_QUOTATION_INITIAL_LINES, lines?.length || 0) }, (_, index) => ({
    ...blankDomesticQuotationLine(index + 1),
    ...(lines?.[index] || {}),
    lineNo: index + 1,
  }))
}

function resetDomesticGridHistory() {
  domesticGridHistory.clear()
  domesticGridUndoDepth.value = 0
  domesticGridRedoDepth.value = 0
}

function recordDomesticGridEdit({ previousLines } = {}) {
  if (!Array.isArray(previousLines)) return
  domesticGridHistory.record({ lines: cloneDomesticGridLines(previousLines) })
  domesticGridUndoDepth.value = Math.min(domesticGridUndoDepth.value + 1, domesticGridHistoryLimit)
  domesticGridRedoDepth.value = 0
}

function applyDomesticGridHistory(action) {
  const current = { lines: cloneDomesticGridLines() }
  if (action === 'redo') {
    const next = domesticGridHistory.redo(current)
    if (!next) return
    domesticGridUndoDepth.value = Math.min(domesticGridUndoDepth.value + 1, domesticGridHistoryLimit)
    domesticGridRedoDepth.value = Math.max(0, domesticGridRedoDepth.value - 1)
    formData.value.lines = cloneDomesticGridLines(next.lines)
    return
  }

  const previous = domesticGridHistory.undo(current)
  if (!previous) return
  domesticGridUndoDepth.value = Math.max(0, domesticGridUndoDepth.value - 1)
  domesticGridRedoDepth.value += 1
  formData.value.lines = cloneDomesticGridLines(previous.lines)
}

function handleDomesticGridRowAction({ action, rowIndex } = {}) {
  const rowNumber = Number(rowIndex) + 1
  if (action === 'delete-empty') {
    toast.add({ title: `第 ${rowNumber} 行为空，明细没有变化`, color: 'neutral' })
    return
  }
  const title = action === 'insert'
    ? `已在第 ${rowNumber} 行前插入一行`
    : action === 'delete'
      ? `已删除第 ${rowNumber} 行`
      : `已定位到第 ${rowNumber} 行`
  toast.add({ title, color: 'success' })
}

function resetEntryData(quoteDate = '') {
  selectedFile.value = null
  uploadError.value = ''
  if (uploadFileInput.value) uploadFileInput.value.value = ''
  editingId.value = null
  editingQuoteNo.value = ''
  inputMode.value = 'form'
  resetDomesticGridHistory()
  domesticGridRef.value?.clearActiveRow?.()
  formData.value = blankDomesticQuotationForm()
  formData.value.quoteDate = quoteDate
  formSnapshot.value = serializeDomesticForm(formData.value)
}

async function openUpload(row = null, mode = 'form') {
  resetEntryData(row?.id ? '' : formatQuotationDate(new Date()))
  inputMode.value = mode
  if (row?.id) {
    try {
      const response = await getDomesticQuotation(row.id)
      if (response?.code !== 200) throw new Error(response?.msg || '报价单详情加载失败')
      const data = response.data || {}
      if (data.canEditDraft === false) throw new Error('只有本人创建的草稿或已退回的报价单可以修改')
      const lines = Array.isArray(data.lines) ? data.lines.map(domesticLineToPcs) : []
      formData.value = {
        customerName: data.customerName || '',
        customerAddress: data.customerAddress || '',
        customerPhone: data.customerPhone || '',
        paymentTerm: data.paymentTerm || '现金',
        customerApplication: data.customerApplication || '',
        customerStyle: data.customerStyle || '终端',
        contactText: data.contactText || '',
        quoteDate: data.quoteDate || '',
        lines: Array.from({ length: Math.max(DOMESTIC_QUOTATION_INITIAL_LINES, lines?.length || 0) }, (_, index) => ({
          ...blankDomesticQuotationLine(index + 1),
          ...(lines[index] || {}),
          originalPriceRmb: lines[index]?.originalPriceRmb ?? '',
          lineNo: index + 1,
        })),
      }
      editingId.value = data.id
      editingQuoteNo.value = data.quoteNo || row.quoteNo || ''
      formSnapshot.value = serializeDomesticForm(formData.value)
    } catch (err) {
      toast.add({ title: err?.message || '报价单详情加载失败', color: 'error' })
      return
    }
  }
  uploadOpen.value = true
}

function switchInputMode(mode) {
  inputMode.value = mode
  uploadError.value = ''
}

function selectFile(event) {
  const file = event.target.files?.[0] || null
  selectedFile.value = file
  uploadError.value = file && !/\.xlsx$/iu.test(file.name) ? '只支持 .xlsx 文件' : ''
}

function triggerUploadSelect() {
  uploadFileInput.value?.click?.()
}

function clearSelectedFile() {
  selectedFile.value = null
  uploadError.value = ''
  if (uploadFileInput.value) uploadFileInput.value.value = ''
}

function handleUploadDrop(event) {
  isDraggingUpload.value = false
  const file = event.dataTransfer?.files?.[0] || null
  if (!file) return
  selectedFile.value = file
  uploadError.value = !/\.xlsx$/iu.test(file.name) ? '只支持 .xlsx 文件' : ''
}

function formatFileSize(size) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function uploadFile(action) {
  if (!selectedFile.value) return
  if (!/\.xlsx$/iu.test(selectedFile.value.name)) {
    uploadError.value = '只支持 .xlsx 文件'
    return
  }
  if (selectedFile.value.size > 20 * 1024 * 1024) {
    uploadError.value = '文件不能超过20MB'
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    if (action === 'submit' && !await confirmQuotationLowPrices({ businessType: 'DOMESTIC', file: selectedFile.value, id: editingId.value || 0 })) return
    const data = new FormData()
    data.append('file', selectedFile.value)
    data.append('action', action)
    data.append('requestId', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    if (editingId.value) data.append('id', String(editingId.value))
    const response = await uploadDomesticQuotation(data)
    if (response?.code !== 200) throw new Error(response?.msg || '内贸报价单上传失败')
    toast.add({ title: action === 'save' ? '草稿已保存' : '内贸报价单已提交初审', description: `单号：${response.data?.quoteNo || ''}`, color: 'success' })
    if (response.data?.notify?.status === 'failed' || response.data?.notify?.status === 'skipped') {
      toast.add({ title: '审核提醒未发送', description: response.data.notify.message || '请手工通知审核人', color: 'warning' })
    }
    closeUpload()
    await getList()
  } catch (err) {
    uploadError.value = err?.message || '内贸报价单上传失败'
  } finally {
    uploading.value = false
    if (uploadFileInput.value) uploadFileInput.value.value = ''
  }
}

function closeUpload() {
  resetEntryData()
  uploadOpen.value = false
}

function requestCloseUpload() {
  uploadOpen.value = false
}

watch(uploadOpen, (open, wasOpen) => {
  if (open || !wasOpen || !entryDirty.value) return
  if (window.confirm('报价单还有未保存的内容，确定关闭并丢弃吗？')) {
    closeUpload()
    return
  }
  uploadOpen.value = true
})

function validateDomesticForm(lines) {
  if (!String(formData.value.customerName || '').trim()) return '请填写客户名称'
  if (!lines.length) return '至少填写一行报价明细'
  for (const [index, line] of lines.entries()) {
    if (!String(line.ctkMpn || '').trim()) return `第${index + 1}行必须填写CTK物料名称`
    const price = Number(String(line.originalPriceRmb ?? '').replace(/,/gu, '').trim())
    if (!Number.isFinite(price) || price <= 0) return `第${index + 1}行必须填写大于0的含税单价`
  }
  return ''
}

async function submitOnlineForm(action) {
  if (uploading.value) return
  const lines = (formData.value.lines || []).filter(hasDomesticQuotationLineData)
  const validationError = validateDomesticForm(lines)
  if (validationError) {
    toast.add({ title: validationError, color: 'warning' })
    return
  }
  uploading.value = true
  try {
    if (action === 'submit' && !await confirmQuotationLowPrices({ businessType: 'DOMESTIC', customerName: formData.value.customerName, lines, id: editingId.value || 0 })) return
    const payload = {
      action,
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerName: String(formData.value.customerName || '').trim(),
      customerStyle: formData.value.customerStyle,
      customerAddress: formData.value.customerAddress,
      customerPhone: formData.value.customerPhone,
      paymentTerm: formData.value.paymentTerm,
      customerApplication: formData.value.customerApplication,
      contactText: String(formData.value.contactText || '').trim(),
      quoteDate: String(formData.value.quoteDate || '').trim() || undefined,
      lines: lines.map((line) => ({
        application: String(line.application || '').trim(),
        materialCode: String(line.materialCode || '').trim(),
        manufacturer: String(line.manufacturer || '').trim(),
        customerMaterialName: String(line.customerMaterialName || '').trim(),
        minPackCount: line.minPackCount === '' ? null : line.minPackCount,
        ctkMpn: String(line.ctkMpn || '').trim(),
        packageName: String(line.packageName || '').trim(),
        unit: String(line.unit || '').trim(),
        originalPriceRmb: Number(String(line.originalPriceRmb).replace(/,/gu, '').trim()),
        remark: String(line.remark || '').trim(),
      })),
    }
    const response = editingId.value
      ? await updateDomesticQuotationDraft(editingId.value, payload)
      : await createDomesticQuotation(payload)
    if (response?.code !== 200) throw new Error(response?.msg || '内贸报价单保存失败')
    toast.add({ title: action === 'save' ? '内贸报价单草稿已保存' : '内贸报价单已提交初审', description: `单号：${response.data?.quoteNo || editingQuoteNo.value || ''}`, color: 'success' })
    if (response.data?.notify?.status === 'failed' || response.data?.notify?.status === 'skipped') {
      toast.add({ title: '审核提醒未发送', description: response.data.notify.message || '请手工通知审核人', color: 'warning' })
    }
    closeUpload()
    await getList()
  } catch (err) {
    toast.add({ title: err?.message || '内贸报价单保存失败', color: 'error' })
  } finally {
    uploading.value = false
  }
}

function submitCurrent(action) {
  return inputMode.value === 'form' ? submitOnlineForm(action) : uploadFile(action)
}

const detailOpen = ref(false)
const detail = ref(null)
const detailLines = ref([])
const phoneDetailFields = computed(() => [
  { label: '业务员 / 联系人', value: `${detail.value?.salespersonName || '—'} / ${detail.value?.contactText || '—'}` },
  { label: '报价日期', value: detail.value?.quoteDate },
  { label: '客户性质', value: detail.value?.customerStyle },
  { label: '客户收款方式', value: detail.value?.paymentTerm },
  { label: '客户电话', value: detail.value?.customerPhone },
  { label: '客户地址', value: detail.value?.customerAddress },
  { label: '客户应用', value: detail.value?.customerApplication },
  { label: '最近更新', value: detail.value?.updateTime },
])
function updatePhoneReviewPrice(id, value) {
  const line = detailLines.value.find(line => line.id === id)
  if (line) line.reviewPriceRmb = value
}
const detailLoading = ref(false)
const reviewStage = ref('')
const reviewComment = ref('')
const reviewing = ref(false)
const reviewStageLabel = computed(() => ({ initial: '初审', second: '二审', final: '终审' })[reviewStage.value] || '')
const reviewBeginLabel = computed(() => {
  if (detail.value?.canFinalReview) return '开始终审'
  if (detail.value?.canSecondReview) return '开始二审'
  return '开始初审'
})

async function openRecord(row) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  detailLines.value = []
  reviewStage.value = ''
  try {
    const response = await getDomesticQuotation(row.id)
    if (response?.code !== 200) throw new Error(response?.msg || '报价单详情加载失败')
    detail.value = response.data
    detailLines.value = (response.data.lines || []).map((storedLine) => {
      const line = domesticLineToPcs(storedLine)
      return { ...line, reviewPriceRmb: line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb }
    })
  } catch (err) {
    detailOpen.value = false
    toast.add({ title: err?.message || '报价单详情加载失败', color: 'error' })
  } finally {
    detailLoading.value = false
  }
}

async function openReview(row) {
  await openRecord(row)
  if (!detail.value) return
  reviewStage.value = reviewStageFor(detail.value)
  reviewComment.value = ''
}

function reviewStageFor(row) {
  if (row?.canFinalReview) return 'final'
  if (row?.canSecondReview) return 'second'
  if (row?.canInitialReview) return 'initial'
  return ''
}

async function startReview() {
  if (!canReviewRow(detail.value)) return
  reviewStage.value = reviewStageFor(detail.value)
  reviewComment.value = ''
}

function formatPrice(value) {
  if (value == null || value === '') return '-'
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(8).replace(/(\.\d*?[1-9])0+$|\.0+$/u, '$1') : '-'
}

async function submitReview(action) {
  if (!detail.value || !reviewStage.value || reviewing.value) return
  if (action === 'return' && !reviewComment.value.trim()) {
    toast.add({ title: '退回时必须填写审核意见', color: 'warning' })
    return
  }
  const priceChanges = action === 'approve' ? detailLines.value.flatMap((line) => {
    const current = Number(line.reviewPriceRmb)
    const original = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
    if (!Number.isFinite(current) || current <= 0) return [{ id: line.id, priceRmb: null }]
    if (!domesticQuotationUnit(line.sourceUnit)) return [{ id: line.id, priceRmb: null }]
    const storedPrice = domesticReviewPriceToStored(current, line.sourceUnit)
    return Number(original) === current ? [] : [{ id: line.id, priceRmb: storedPrice }]
  }) : []
  if (priceChanges.some((change) => change.priceRmb == null)) {
    toast.add({ title: '含税单价必须大于0，历史未知单位需先核对后改价', color: 'warning' })
    return
  }
  reviewing.value = true
  try {
    if (action === 'approve' && !await confirmQuotationLowPrices({ businessType: 'DOMESTIC', id: detail.value.id, lines: detailLines.value })) return
    const response = await reviewDomesticQuotation({
      id: detail.value.id,
      stage: reviewStage.value,
      action,
      comment: reviewComment.value.trim(),
      priceChanges,
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    })
    if (response?.code !== 200) throw new Error(response?.msg || '审核提交失败')
    toast.add({ title: action === 'return' ? '报价单已退回' : '审核已保存', color: 'success' })
    if (response.data?.notify?.status === 'failed' || response.data?.notify?.status === 'skipped') {
      toast.add({ title: '审核提醒未发送', description: response.data.notify.message || '请手工通知审核人', color: 'warning' })
    }
    reviewStage.value = ''
    detailOpen.value = false
    await getList()
  } catch (err) {
    toast.add({ title: err?.message || '审核提交失败', color: 'error' })
  } finally {
    reviewing.value = false
  }
}

function downloadTemplate() {
  window.open(getDomesticQuotationTemplateUrl(), '_blank')
}

const monthlyReportOpen = ref(false)
const monthlyReportLoading = ref(false)
const monthlyReportError = ref('')
const monthlyReportInfo = ref(null)
const monthlyRunStatus = status => ({ preparing: '准备中，若中断需人工核对', sending: '发送中，若中断需人工核对', sent: '发送成功', failed: '准备失败', uncertain: '发送结果待核对，禁止直接重发' })[status] || status

async function openMonthlyReport() {
  monthlyReportOpen.value = true
  monthlyReportLoading.value = true
  monthlyReportError.value = ''
  monthlyReportInfo.value = null
  try {
    const response = await getDomesticQuotationMonthlyReport()
    if (response?.code !== 200) throw new Error(response?.msg || '读取月结汇总设置失败')
    monthlyReportInfo.value = response.data
  } catch (error) { monthlyReportError.value = error?.message || '读取月结汇总设置失败' }
  finally { monthlyReportLoading.value = false }
}

function downloadMonthlyReport() {
  window.open(getDomesticQuotationMonthlyExportUrl(), '_blank')
}

function downloadQuote(id) {
  window.open(getDomesticQuotationDownloadUrl(id), '_blank')
}

async function submitDraft(row) {
  try {
    if (!await confirmQuotationLowPrices({ businessType: 'DOMESTIC', id: row.id })) return
    const response = await submitDomesticQuotation(row.id)
    if (response?.code !== 200) throw new Error(response?.msg || '提交失败')
    toast.add({ title: '内贸报价单已提交初审', color: 'success' })
    await getList()
  } catch (err) {
    toast.add({ title: err?.message || '提交失败', color: 'error' })
  }
}

async function withdrawQuote(row) {
  try {
    const response = await withdrawDomesticQuotation(row.id)
    if (response?.code !== 200) throw new Error(response?.msg || '撤回失败')
    toast.add({ title: '报价单已撤回为草稿', color: 'success' })
    await getList()
  } catch (err) {
    toast.add({ title: err?.message || '撤回失败', color: 'error' })
  }
}

async function deleteDraft(row) {
  if (!window.confirm(`确定删除草稿 ${row.quoteNo} 吗？`)) return
  try {
    const response = await deleteDomesticQuotation(row.id)
    if (response?.code !== 200) throw new Error(response?.msg || '删除失败')
    toast.add({ title: '报价单草稿已删除', color: 'success' })
    await getList()
  } catch (err) {
    toast.add({ title: err?.message || '删除失败', color: 'error' })
  }
}

function rowMenuItems(row) {
  const items = []
  if (canReviewRow(row) && row?.canDownload) {
    items.push({ label: '下载已审核', icon: 'i-lucide-download', onSelect: () => downloadQuote(row.id) })
  }
  if (row?.canWithdraw) items.push({ label: '撤回为草稿', icon: 'i-lucide-undo-2', onSelect: () => withdrawQuote(row) })
  if (row?.canDeleteDraft) items.push({ label: '删除草稿', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deleteDraft(row) })
  return items
}

function openEditFromDetail(record) {
  if (!record) return
  closeDetail()
  void openUpload(record, 'form')
}

async function handleSubmitFromDetail(record) {
  if (!record) return
  closeDetail()
  await submitDraft(record)
}

async function handleWithdrawFromDetail(record) {
  if (!record) return
  await withdrawQuote(record)
  closeDetail()
}

async function handleDeleteFromDetail(record) {
  if (!record) return
  await deleteDraft(record)
  closeDetail()
}

function closeDetail() {
  detailOpen.value = false
  reviewStage.value = ''
}

function hasPendingQuotations() {
  return list.value.some((row) => String(row.status || '').startsWith('PENDING_'))
}

function canAutoRefresh() {
  return activeTab.value === 'list' && !uploadOpen.value && !detailOpen.value
}

useTkAutoRefresh({
  onRefresh: () => getList({ silent: true }),
  enabled: canAutoRefresh,
  pollWhen: hasPendingQuotations,
  intervalMs: 30_000,
  cooldownMs: 15_000,
})

watch(detailOpen, (open, wasOpen) => {
  if (!open && wasOpen && activeTab.value === 'list' && !uploadOpen.value) {
    void getList({ silent: true })
  }
})

watch(activeTab, (tab, prevTab) => {
  if (tab === 'list' && prevTab !== 'list') {
    void getList({ silent: true })
  }
})

onMounted(getList)
</script>
