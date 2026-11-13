<template>
  <div class="absolute inset-0 flex flex-col overflow-hidden bg-default text-default">
    <div class="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <!-- 紧凑型顶栏：标题 + 中性分段切换 + 右侧单主次操作按钮 -->
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-badge-dollar-sign" class="h-4 w-4" />
            </div>
            <h1 class="text-lg font-bold tracking-tight text-highlighted sm:text-xl">外贸销售报价单</h1>
          </div>

          <nav class="inline-flex items-center gap-0.5 rounded-lg border border-muted bg-muted/50 p-0.5" aria-label="报价单功能">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-files"
              size="xs"
              class="rounded-md px-3 py-1 font-medium transition"
              :class="activeTab === 'list' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-default font-semibold' : 'text-muted hover:text-default'"
              @click="switchTab('list')"
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
              @click="switchTab('analysis')"
            >
              价格汇总分析
            </UButton>
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" size="sm" @click="downloadTemplate">下载外贸模板</UButton>
          <UButton v-if="canUpload" color="primary" icon="i-lucide-plus" size="sm" @click="openUpload">新建外贸报价单</UButton>
        </div>
      </header>

      <template v-if="activeTab === 'list'">
        <!-- Nuxt UI 一体化高密度工作台卡片：Toolbar + 内部滚动表格 + 底部分页条 -->
        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-muted bg-elevated/30 shadow-xs">
          <!-- 紧凑单行内联筛选与操作条 -->
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-muted bg-elevated/60 px-3 py-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <UInput
                v-model="listQuery.keyword"
                size="sm"
                icon="i-lucide-search"
                placeholder="搜索报价单号、客户或文件名"
                class="w-full sm:w-60 lg:w-72"
                @keydown.enter="searchList"
              />
              <USelect
                :model-value="listQuery.status || 'ALL'"
                size="sm"
                :items="statusFilterOptions"
                value-key="value"
                label-key="label"
                placeholder="全部状态"
                class="w-32"
                @update:model-value="(val) => { listQuery.status = val === 'ALL' ? '' : val }"
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
                        @click="applylistDateRangePreset(p)"
                      />
                      <UButton
                        v-if="listDateRange?.length"
                        label="清除"
                        color="neutral"
                        variant="ghost"
                        class="rounded-none px-4 text-error hover:bg-elevated/50"
                        truncate
                        @click="clearlistDateRange"
                      />
                    </div>
                    <UCalendar
                      :default-value="rangeArrayToCalendar(listDateRange)"
                      range
                      :number-of-months="calendarMonths"
                      locale="zh-CN"
                      class="p-2"
                      @update:model-value="onlistDateRangePick"
                    />
                  </div>
                </template>
              </UPopover>
              <div class="flex items-center gap-1.5">
                <UButton color="primary" variant="soft" size="sm" icon="i-lucide-search" @click="searchList">查询</UButton>
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-rotate-ccw" @click="resetList">重置</UButton>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <span class="hidden text-xs text-muted 2xl:inline" title="普通业务员仅展示本人创建的记录；初审人、二审人和终审人员可查看与审批全部记录。">业务员仅看本人 · 审核人看全部</span>
              <UBadge color="neutral" variant="subtle" size="sm">共 {{ total }} 条</UBadge>
              <UButton
                icon="i-lucide-refresh-cw"
                :loading="loading"
                size="xs"
                color="neutral"
                variant="ghost"
                title="刷新列表"
                aria-label="刷新列表"
                @click="loadList"
              />
            </div>
          </div>
          <div v-if="loading" class="min-h-0 flex-1 space-y-2.5 overflow-hidden p-4">
            <USkeleton v-for="item in 6" :key="item" class="h-11 w-full" />
          </div>
          <!-- 桌面：Nuxt UI 原生 UTable（表头吸顶 + 内部滚动 + 单击选中/再击取消/双击打开）；手机：卡片列表 -->
          <div v-else class="hidden min-h-0 flex-1 overflow-auto sm:block">
            <UTable
              :data="rows"
              :columns="listColumns"
              sticky
              :ui="listTableUi"
              v-model:row-selection="listRowSelection"
              :on-select="handleListSelect"
              @dblclick="handleListDblclick"
            >
              <template #quoteNo-cell="{ row }">
                <div class="leading-tight">
                  <button type="button" class="font-mono font-semibold text-primary hover:underline" @click="openRecord(row.original)">{{ row.original.quoteNo }}</button>
                  <div class="mt-0.5 truncate text-[11px] text-muted" :title="`提交 ${row.original.createTime || '-'} · ${row.original.originalName || '-'}`">{{ row.original.createTime || '-' }} · {{ row.original.originalName || '-' }}</div>
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
                    title="开始审核报价单"
                    aria-label="审核报价单"
                    @click="openReview(row.original)"
                  >
                    审核
                  </UButton>
                  <template v-else-if="row.original.canEditDraft">
                    <UButton
                      size="xs"
                      color="primary"
                      variant="soft"
                      icon="i-lucide-send"
                      :title="row.original.status === 'RETURNED' ? '重新提交初审' : '提交初审'"
                      :aria-label="row.original.status === 'RETURNED' ? '重新提交初审' : '提交初审'"
                      @click="handleSubmitDraft(row.original)"
                    >
                      {{ row.original.status === 'RETURNED' ? '重提' : '提交' }}
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-square-pen"
                      :title="row.original.status === 'RETURNED' ? '修改已退回的报价单（重新提交会从初审重跑）' : '编辑草稿（也可双击整行打开）'"
                      :aria-label="row.original.status === 'RETURNED' ? '修改已退回的报价单' : '编辑草稿'"
                      @click="openEdit(row.original)"
                    >
                      {{ row.original.status === 'RETURNED' ? '修改' : '编辑' }}
                    </UButton>
                  </template>
                  <UButton
                    v-else-if="canDownloadRow(row.original)"
                    size="xs"
                    color="success"
                    variant="soft"
                    icon="i-lucide-download"
                    title="下载已审核 Excel"
                    aria-label="下载已审核报价单"
                    @click="download(row.original.id)"
                  >
                    下载
                  </UButton>

                  <TkQuotationRemindButton :quotation="row.original" />

                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-eye"
                    title="查看报价单详情"
                    aria-label="查看报价单"
                    @click="openRecord(row.original)"
                  >
                    查看
                  </UButton>

                  <UDropdownMenu v-if="desktopRowMenuItems(row.original).length" :items="desktopRowMenuItems(row.original)" :content="{ align: 'end' }">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-ellipsis"
                      title="更多操作"
                      aria-label="更多操作"
                    />
                  </UDropdownMenu>
                </div>
              </template>
              <template #empty>
                <div class="flex flex-col items-center justify-center py-14 text-center">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-muted bg-muted/40 text-muted">
                    <UIcon name="i-lucide-file-spreadsheet" class="h-6 w-6" />
                  </div>
                  <h3 class="mt-3 text-sm font-semibold text-highlighted">暂无报价单记录</h3>
                  <p class="mt-1 max-w-sm text-xs text-muted">普通业务员仅展示本人创建的记录。可点击右上角新建在线录入，或下载模板填好后导入。</p>
                  <div class="mt-4 flex gap-2">
                    <UButton v-if="canUpload" color="primary" icon="i-lucide-plus" size="sm" @click="openUpload">新建第一份报价单</UButton>
                    <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" size="sm" @click="downloadTemplate">下载空白模板</UButton>
                  </div>
                </div>
              </template>
            </UTable>
          </div>

          <!-- 手机卡片列表：单击打开（手机没有双击），主操作随单据状态给，其余收进「⋯」 -->
          <div v-if="!loading" class="min-h-0 flex-1 overflow-y-auto sm:hidden">
            <div v-if="!rows.length" class="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-muted bg-muted/40 text-muted">
                <UIcon name="i-lucide-file-spreadsheet" class="h-6 w-6" />
              </div>
              <h3 class="mt-3 text-sm font-semibold text-highlighted">暂无报价单记录</h3>
              <p class="mt-1 max-w-sm text-xs text-muted">普通业务员仅展示本人创建的记录。可在弹窗里直接在线录入，或下载模板填好后上传。</p>
              <div class="mt-4 flex gap-2">
                <UButton v-if="canUpload" color="primary" icon="i-lucide-plus" size="sm" @click="openUpload">新建第一份报价单</UButton>
                <UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" size="sm" @click="downloadTemplate">下载空白模板</UButton>
              </div>
            </div>
            <ul v-else class="divide-y divide-muted">
              <li
                v-for="row in rows"
                :key="row.id"
                class="cursor-pointer px-4 py-3.5 transition active:bg-muted/40"
                @click="openRecord(row)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="break-all font-mono text-sm font-semibold text-primary">{{ row.quoteNo }}</div>
                    <div class="mt-1 truncate text-sm font-medium text-highlighted">{{ row.customerName || '未填写' }}</div>
                  </div>
                  <UBadge :color="statusColor(row.status)" variant="soft" class="shrink-0">{{ row.statusLabel }}</UBadge>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{{ row.salespersonName || '-' }}</span>
                  <span class="tabular-nums">{{ row.lineCount }} 行</span>
                  <span class="font-mono">{{ row.updateTime || row.createTime || '-' }}</span>
                </div>
                <div class="mt-2.5 flex flex-wrap items-center gap-2" data-row-interaction="ignore" @click.stop>
                  <TkQuotationRemindButton :quotation="row" />
                  <UButton
                    v-if="canReviewRow(row)"
                    color="primary"
                    size="sm"
                    class="min-h-10"
                    icon="i-lucide-clipboard-check"
                    @click="openReview(row)"
                  >
                    审核
                  </UButton>
                  <UButton v-if="row.canEditDraft" color="warning" size="sm" class="min-h-10" icon="i-lucide-send" :loading="draftSubmitting" @click="handleSubmitDraft(row)">{{ row.status === 'RETURNED' ? '重新提交初审' : '提交初审' }}</UButton>
                  <UButton v-if="row.canEditDraft" color="neutral" variant="outline" size="sm" class="min-h-10" icon="i-lucide-square-pen" @click="openEdit(row)">{{ row.status === 'RETURNED' ? '修改重提' : '编辑' }}</UButton>
                  <UButton v-else-if="!canReviewRow(row)" color="neutral" variant="outline" size="sm" class="min-h-10" icon="i-lucide-eye" @click="openRecord(row)">查看</UButton>
                  <UDropdownMenu v-if="phoneCardMenuItems(row).length" :items="phoneCardMenuItems(row)" :content="{ align: 'end' }">
                    <UButton color="neutral" variant="ghost" size="sm" class="min-h-10" icon="i-lucide-ellipsis-vertical" aria-label="更多操作" />
                  </UDropdownMenu>
                </div>
              </li>
            </ul>
          </div>

          <div v-if="total > 0" class="shrink-0 border-t border-muted bg-elevated/40 px-3 py-1.5">
            <pagination v-model:page="listQuery.pageNum" v-model:limit="listQuery.pageSize" :total="total" :auto-scroll="false" @pagination="loadList" />
          </div>
        </section>
      </template>

      <TkQuotationAnalysis v-else ref="analysisView" :can-export="canAnalysis" class="min-h-0 flex-1 overflow-y-auto pr-0.5" />
    </div>

    <!-- 新建报价单：表格录入 / Excel 模板上传 -->
    <UModal v-model:open="uploadOpen" :title="uploadModalTitle" :ui="uploadModalUi">
      <template #body>
        <div class="quotation-entry-body flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto bg-muted/20 p-2.5 sm:overflow-hidden sm:p-3">
          <!-- 录入方式切换与说明 -->
          <div class="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-default bg-elevated px-3 py-1.5 shadow-xs">
            <div class="flex items-center gap-1 rounded-lg bg-muted/70 p-0.5 border border-default/40">
              <UButton
                size="xs"
                color="neutral"
                :variant="inputMode === 'form' ? 'subtle' : 'ghost'"
                class="transition-all"
                :class="inputMode === 'form' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-border/50 font-semibold' : 'text-muted hover:text-default'"
                icon="i-lucide-table-2"
                @click="switchInputMode('form')"
              >
                在线表格录入
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                :variant="inputMode === 'upload' ? 'subtle' : 'ghost'"
                class="transition-all"
                :class="inputMode === 'upload' ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-border/50 font-semibold' : 'text-muted hover:text-default'"
                icon="i-lucide-file-up"
                @click="switchInputMode('upload')"
              >
                导入 Excel 模板
              </UButton>
            </div>
            <div class="hidden sm:flex items-center gap-2 text-xs text-muted">
              <UBadge v-if="inputMode === 'upload'" color="neutral" variant="subtle" size="xs">标准 16 列模板</UBadge>
              <div class="flex items-center gap-1.5 truncate">
                <UIcon name="i-lucide-info" class="size-3.5 text-primary shrink-0" />
                <span class="truncate">{{ inputModeHint }}</span>
              </div>
            </div>
          </div>

          <!-- ① 在线表格录入：高密度布局，在 150% 缩放下保证明细表格充足可见 -->
          <template v-if="inputMode === 'form'">
            <!-- 单据条款内联栏：统一 6 列响应式网格，上下严格对齐，彻底消除留白与错位 -->
            <div class="shrink-0 rounded-lg border border-default/60 bg-elevated px-3 py-2 shadow-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <!-- 第 1 行：客户、国家与城市等单头信息 -->
                <UFormField label="客户名称" required class="text-xs">
                  <UInputMenu
                    v-model="formData.customerName"
                    v-model:search-term="customerSearchTerm"
                    :items="customerOptions"
                    :loading="customerOptionsLoading"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="搜索或输入客户名称"
                    class="w-full"
                    size="xs"
                    :open="optionMenuOpen.customer"
                    @update:open="handleOptionMenuOpen('customer', $event)"
                    @create="handleOptionMenuCreate('customer')"
                  />
                </UFormField>
                <UFormField label="终端客户" required class="text-xs">
                  <UInputMenu
                    v-model="formData.endUser"
                    :items="customerOptions"
                    :loading="customerOptionsLoading"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="搜索或输入终端客户"
                    class="w-full"
                    size="xs"
                  />
                  <div
                    v-if="formEndUserConflict.hasConflict"
                    class="mt-1 flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning"
                    role="status"
                    aria-live="polite"
                  >
                    <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0" />
                    <span class="truncate" :title="`检测到已有其他业务员报过该终端客户（匹配：${formEndUserConflict.matchedEndUsers.join('、') || formData.endUser}）`">
                      已有其他业务员报过该终端客户
                    </span>
                  </div>
                </UFormField>
                <UFormField label="国家 / Country" class="text-xs">
                  <UInputMenu
                    v-model="formData.country"
                    v-model:search-term="optionSearchTerms.country"
                    :items="QUOTATION_COUNTRY_MENU_OPTIONS"
                    value-key="value"
                    label-key="label"
                    :filter-fields="['label']"
                    mode="combobox"
                    open-on-focus
                    placeholder="搜索国家 / Search country"
                    icon="i-lucide-globe"
                    class="w-full"
                    size="xs"
                    :open="optionMenuOpen.country"
                    @update:open="handleOptionMenuOpen('country', $event)"
                  />
                </UFormField>
                <UFormField label="城市 / City" class="text-xs">
                  <UInput v-model="formData.city" placeholder="请输入城市 / City" :maxlength="128" class="w-full" size="xs" />
                </UFormField>
                <UFormField label="客户性质" class="text-xs">
                  <USelect
                    v-model="formData.customerStyle"
                    :items="QUOTATION_CUSTOMER_STYLE_OPTIONS"
                    placeholder="选择客户性质"
                    class="w-full"
                    size="xs"
                  />
                </UFormField>
                <UFormField label="基准汇率" hint="USD→RMB" required class="text-xs">
                  <UInput
                    v-model.number="formData.rate"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="如 6.7000"
                    icon="i-lucide-badge-percent"
                    class="w-full"
                    size="xs"
                    title="美元兑人民币汇率（USD→RMB）：美元单价 = 人民币单价 ÷ 汇率"
                  />
                </UFormField>

                <!-- 第 2 行：商务条款，付款方式占后三列 -->
                <UFormField label="报价日期" class="text-xs">
                  <UInput
                    v-model="formData.quoteDate"
                    placeholder="YYYY-MM-DD"
                    icon="i-lucide-calendar"
                    class="w-full"
                    size="xs"
                  />
                </UFormField>
                <UFormField label="贸易条款" class="text-xs">
                  <UInputMenu
                    v-model="formData.deliveryTerms"
                    v-model:search-term="optionSearchTerms.deliveryTerms"
                    :items="deliveryTermOptions"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="请选择或输入贸易条款"
                    class="w-full"
                    size="xs"
                    :open="optionMenuOpen.deliveryTerms"
                    @update:open="handleOptionMenuOpen('deliveryTerms', $event)"
                    @create="handleOptionMenuCreate('deliveryTerms')"
                  />
                </UFormField>
                <UFormField label="有效期" class="text-xs">
                  <UInputMenu
                    v-model="formData.validity"
                    v-model:search-term="optionSearchTerms.validity"
                    :items="validityOptions"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="如 30days"
                    class="w-full"
                    size="xs"
                    :open="optionMenuOpen.validity"
                    @update:open="handleOptionMenuOpen('validity', $event)"
                    @create="handleOptionMenuCreate('validity')"
                  />
                </UFormField>
                <UFormField label="付款方式" class="sm:col-span-2 lg:col-span-3 text-xs">
                  <UInputMenu
                    v-model="formData.paymentTerm"
                    v-model:search-term="optionSearchTerms.paymentTerm"
                    :items="paymentTermOptions"
                    :loading="paymentTermOptionsLoading"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="请选择或输入付款方式"
                    class="w-full"
                    size="xs"
                    :open="optionMenuOpen.paymentTerm"
                    @update:open="handleOptionMenuOpen('paymentTerm', $event)"
                    @create="handleOptionMenuCreate('paymentTerm')"
                  />
                </UFormField>
              </div>
            </div>

            <!-- 报价明细表格区：顶满剩余高度 -->
            <div class="quotation-entry-lines flex h-[24rem] min-h-[24rem] shrink-0 flex-col overflow-hidden rounded-lg border border-muted bg-elevated shadow-xs sm:h-auto sm:min-h-0 sm:flex-1">
              <!-- 紧凑单行明细工具栏：说明文字放入 title，按钮严格同一行，高度仅 36px -->
              <div class="flex shrink-0 items-center justify-between gap-2 border-b border-muted bg-muted/20 px-3 py-1.5">
                <div class="flex items-center gap-1.5 min-w-0">
                  <h3 class="font-semibold text-xs text-highlighted shrink-0">报价明细</h3>
                  <span class="rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted shrink-0">{{ formFilledLineCount }} 项</span>
                  <div class="flex items-center gap-1 text-[11px] text-muted truncate cursor-help" title="列序与模板 A..P 一致；报价日期统一按 YYYY-MM-DD；交期日期按模板 01-Dec-26（也可填文本如 30days）；美元两列按「人民币单价 ÷ 汇率」自动算；支持从 Excel 复制整块 Ctrl+V 粘贴">
                    <UIcon name="i-lucide-info" class="h-3.5 w-3.5 text-primary shrink-0" />
                    <span class="hidden lg:inline truncate">支持从 Excel 复制单元格后 Ctrl+V 粘贴</span>
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <UBadge v-if="formBadDateLines.length" color="warning" variant="soft" size="xs" icon="i-lucide-calendar-x" :title="`${formBadDateHint} 不是日期格式，请按 YYYY-MM-DD 填（如 2026-09-18）`">{{ formBadDateLines.length }} 行日期异常</UBadge>
                  <UBadge v-if="formZeroPriceCount" color="warning" variant="soft" size="xs" icon="i-lucide-triangle-alert" :title="`${formZeroPriceCount} 行单价为 0，请确认是否已核价`">{{ formZeroPriceCount }} 行 0 价</UBadge>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" title="撤销（Ctrl+Z）" :disabled="!formCanUndo" @click="undoFormEdit">撤销</UButton>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-redo-2" title="重做（Ctrl+Y）" :disabled="!formCanRedo" @click="redoFormEdit">重做</UButton>
                  <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-rows-2" title="在当前指针所在行（或选中行）之前插入一行" @click="insertFormLine">插入行</UButton>
                  <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-trash-2" title="删除当前指针所在的那一行（或选中行）" @click="removeSelectedFormLines">删除行</UButton>
                  <UButton size="xs" color="primary" icon="i-lucide-plus" @click="addFormLine">新增行</UButton>
                </div>
              </div>

              <!-- 明细输入表格交给 RevoGrid 自己渲染 -->
              <TkQuotationLowPriceNotice :customer-name="formData.customerName" :lines="formData.lines" :id="editingId || 0" />
              <div class="min-h-0 flex-1 overflow-hidden">
                <TkQuotationGrid
                  ref="formGridRef"
                  :lines="formData.lines"
                  :rate="formData.rate"
                  :column-order="QUOTATION_GRID_DISPLAY_COLUMN_PROPS"
                  :option-picker="false"
                  :dropdown-append-to="'.quotation-upload-modal-content'"
                  :material-options="materialOptions"
                  @update:lines="handleFormGridUpdate"
                  @edit="handleFormGridEdit"
                  @history="handleFormGridHistory"
                  @before-paste="handleFormPaste"
                />
              </div>
            </div>
          </template>

          <template v-else>
            <!-- 正在改单提示条（仅编辑已有单据时显示） -->
            <div v-if="editingId" class="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs">
              <div class="flex items-center gap-2 text-default">
                <UIcon name="i-lucide-info" class="size-4 shrink-0 text-primary" />
                <span>正在改单据 <b class="font-mono text-highlighted">{{ editingQuoteNo }}</b>：重新上传填好的 Excel 会整单覆盖已有明细，并在提交后重新从初审开始。</span>
              </div>
              <UBadge color="primary" variant="subtle" size="xs">覆盖改单模式</UBadge>
            </div>

            <!-- 文件选择隐藏 input -->
            <input ref="fileInputRef" type="file" accept=".xlsx" class="hidden" @change="handleFileChange" />

            <!-- 解析失败报错 -->
            <div v-if="parseError" class="shrink-0 rounded-xl border border-error/30 bg-error/10 p-3.5 text-xs text-error">
              <div class="flex items-start gap-2.5">
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
                <div>
                  <div class="font-semibold text-highlighted">文件读取失败</div>
                  <div class="mt-0.5 text-xs">{{ parseError }}</div>
                </div>
              </div>
            </div>

            <!-- 解析中状态提示 -->
            <div v-if="uploadParsing" class="flex flex-1 flex-col items-center justify-center gap-3.5 rounded-2xl border border-default bg-elevated p-8 shadow-xs">
              <UIcon name="i-lucide-loader-circle" class="size-9 animate-spin text-primary" />
              <div class="text-center">
                <p class="text-sm font-semibold text-highlighted">正在解析 Excel 报价单数据…</p>
                <p class="mt-1 text-xs text-muted">正在智能提取表头商务条款与物料明细，请稍候</p>
              </div>
            </div>

            <!-- 已选文件：压成一行状态条 -->
            <div
              v-else-if="selectedFile"
              class="relative flex w-full shrink-0 cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-default hover:border-primary bg-elevated px-3.5 py-2 transition-colors shadow-xs"
              :class="{ 'border-primary bg-primary/5': isDragging }"
              @click="triggerSelectFile"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UIcon name="i-lucide-file-spreadsheet" class="h-5 w-5" />
                </div>
                <div class="min-w-0 text-left">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-semibold text-highlighted">{{ selectedFile.name }}</span>
                    <UBadge v-if="parsedData" color="success" variant="subtle" size="xs">读取完成</UBadge>
                  </div>
                  <div class="text-xs text-muted">{{ formatFileSize(selectedFile.size) }} · 已完成数据读取</div>
                </div>
              </div>
              <UButton color="neutral" variant="outline" size="xs" icon="i-lucide-refresh-cw" @click.stop="triggerSelectFile">更换文件</UButton>
            </div>

            <!-- 未选文件：完整拖拽区 -->
            <div
              v-else-if="!parsedData"
              class="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto"
            >
              <!-- 核心拖拽与文件选择区域 -->
              <div
                class="group relative flex min-h-[240px] w-full flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-elevated/80 p-6 text-center shadow-xs transition-all duration-150 hover:border-primary/60 hover:bg-primary/[0.02] cursor-pointer"
                :class="{ 'border-primary bg-primary/10 ring-4 ring-primary/10': isDragging }"
                @click="triggerSelectFile"
                @dragover.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop.prevent="handleDrop"
              >
                <div class="pointer-events-none flex max-w-md flex-col items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-4 ring-primary/5 transition-transform duration-150 group-hover:scale-105">
                    <UIcon name="i-lucide-upload-cloud" class="h-6 w-6" />
                  </div>
                  <div class="space-y-1">
                    <p class="text-sm font-semibold text-highlighted sm:text-base">
                      点击选择本地文件，或将填好的 Excel 拖入此处
                    </p>
                    <p class="text-xs text-muted">
                      支持外贸标准 16 列 .xlsx 报价单 · 单文件上限 20MB · 明细行动态扩展
                    </p>
                  </div>
                  <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 pt-1" @click.stop>
                    <UButton color="primary" icon="i-lucide-folder-open" size="sm" @click="triggerSelectFile">选择本地 Excel 文件</UButton>
                    <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-download" @click="downloadTemplate">下载标准模板 (.xlsx)</UButton>
                  </div>
                </div>
              </div>

              <!-- 底部：精简三栏导入约束说明 -->
              <div class="shrink-0 rounded-xl border border-muted bg-elevated px-4 py-2.5 shadow-xs">
                <div class="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                  <div class="flex items-start gap-2">
                    <UIcon name="i-lucide-columns-3" class="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div class="font-medium text-highlighted">抬头与条款自动识别</div>
                      <div class="mt-0.5 text-[11px] text-muted">自动读取客户、终端客户、国家、贸易条款、有效期与付款方式。</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-2">
                    <UIcon name="i-lucide-calculator" class="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div class="font-medium text-highlighted">单价与汇率自动验算</div>
                      <div class="mt-0.5 text-[11px] text-muted">按人民币单价与基准汇率自动折算千只美元（USD/KPCS）与只美元（USD/PC）。</div>
                    </div>
                  </div>
                  <div class="flex items-start gap-2">
                    <UIcon name="i-lucide-refresh-cw" class="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div class="font-medium text-highlighted">草稿与退回单覆盖</div>
                      <div class="mt-0.5 text-[11px] text-muted">编辑草稿或已退回报价单时重新导入将整单覆盖，核对预览后提交初审。</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <template v-if="parsedData && !uploadParsing">
              <!-- 表头信息卡片（压扁：明细表要占弹窗主要面积） -->
              <div class="shrink-0 rounded-xl border border-default bg-elevated p-3 shadow-xs">
                <div class="flex items-center justify-between border-b border-muted pb-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-circle-check" class="h-4 w-4 text-emerald-500" />
                    <span class="font-semibold text-sm text-highlighted">已提取的单据基础信息</span>
                  </div>
                  <UBadge color="primary" variant="subtle" size="sm">{{ parsedData.lines.length }} 项产品明细</UBadge>
                </div>
                <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 xl:grid-cols-5">
                  <div><span class="text-muted">客户名称：</span><span class="font-semibold text-highlighted ml-1">{{ parsedData.customerName || '未识别' }}</span></div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-muted">终端客户：</span>
                    <span class="text-default">{{ parsedData.endUser || '-' }}</span>
                    <UBadge
                      v-if="uploadEndUserConflict.hasConflict"
                      color="warning"
                      variant="soft"
                      size="xs"
                      icon="i-lucide-triangle-alert"
                      :title="`检测到已有其他业务员报过该终端客户（匹配：${uploadEndUserConflict.matchedEndUsers.join('、') || parsedData.endUser}）`"
                    >
                      已有其他业务员报过该终端客户
                    </UBadge>
                  </div>
                  <div><span class="text-muted">城市 / City：</span><span class="text-default ml-1">{{ parsedData.city || '-' }}</span></div>
                  <div><span class="text-muted">国家：</span><span class="text-default ml-1">{{ parsedData.country || '-' }}</span></div>
                  <div><span class="text-muted">客户性质：</span><span class="text-default ml-1">{{ parsedData.customerStyle || '-' }}</span></div>
                  <div><span class="text-muted">基准汇率：</span><span class="text-default ml-1 font-semibold">{{ parsedData.rate != null ? parsedData.rate : '-' }}</span></div>
                  <div><span class="text-muted">报价日期：</span><span class="text-default ml-1 font-mono">{{ parsedData.quoteDate || '-' }}</span></div>
                  <div><span class="text-muted">贸易条款：</span><span class="text-default ml-1">{{ parsedData.deliveryTerms || '-' }}</span></div>
                  <div><span class="text-muted">有效期：</span><span class="text-default ml-1">{{ parsedData.validity || '-' }}</span></div>
                  <div><span class="text-muted">付款方式：</span><span class="text-default ml-1">{{ parsedData.paymentTerm || '-' }}</span></div>
                  <div><span class="text-muted">联系人：</span><span class="text-default ml-1">{{ parsedData.contact || '-' }}</span></div>
                </div>
              </div>

              <!-- 产品明细预览列表：占满弹窗剩余高度（唯一纵向滚动区） -->
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-muted bg-elevated shadow-xs">
                <div class="shrink-0 border-b border-muted px-4 py-2 bg-muted/20 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-sm text-highlighted">物料明细预览（共 {{ parsedData.lines.length }} 行，全部可滚动查看）</h3>
                    <UBadge color="neutral" variant="subtle" size="xs">{{ parsedData.lines.length }} 行</UBadge>
                  </div>
                  <span class="text-xs text-muted">待审价格将在提交后由审核人核定</span>
                </div>
                <div class="min-h-0 flex-1 overflow-auto">
                  <table class="min-w-[1600px] w-full text-left text-xs">
                    <thead class="sticky top-0 bg-elevated/95 backdrop-blur text-muted z-10 border-b border-muted">
                      <tr>
                        <th class="px-3 py-2.5 font-medium w-12 text-center">#</th>
                        <th class="px-3 py-2.5 font-medium">物料编码</th>
                        <th class="px-3 py-2.5 font-medium">物料名称</th>
                        <th class="px-3 py-2.5 font-medium">封装</th>
                        <th class="px-3 py-2.5 font-medium">芯片大小</th>
                        <th class="px-3 py-2.5 font-medium">单价（元）</th>
                        <th class="px-3 py-2.5 font-medium">应用</th>
                        <th class="px-3 py-2.5 font-medium">友商</th>
                        <th class="px-3 py-2.5 font-medium">友商型号</th>
                        <th class="px-3 py-2.5 font-medium">数量</th>
                        <th class="px-3 py-2.5 font-medium">SPQ / Reel</th>
                        <th class="px-3 py-2.5 font-medium">千只单价（美元）</th>
                        <th class="px-3 py-2.5 font-medium">1只单价（美元）</th>
                        <th class="px-3 py-2.5 font-medium">交期</th>
                        <th class="px-3 py-2.5 font-medium">规格书</th>
                        <th class="px-3 py-2.5 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-muted">
                      <tr v-for="line in parsedData.lines" :key="line.lineNo" class="hover:bg-muted/30 transition-colors">
                        <td class="px-3 py-2 text-center text-muted font-mono">{{ line.lineNo }}</td>
                        <td class="px-3 py-2 font-mono">{{ line.materialCode || '-' }}</td>
                        <td class="px-3 py-2 font-mono font-semibold text-primary">{{ line.ctkMpn || '-' }}</td>
                        <td class="px-3 py-2 font-mono">{{ line.packageName || '-' }}</td>
                        <td class="px-3 py-2 font-mono">{{ line.dieSize || '-' }}</td>
                        <td class="px-3 py-2 font-mono">
                          <span v-if="isZeroPrice(line.originalPriceRmb)" class="rounded bg-warning-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning" title="单价为 0，请确认是否已核价">0 价</span>
                          <span v-else-if="line.originalPriceRmb != null" class="font-semibold text-highlighted">{{ formatPrice(line.originalPriceRmb, '￥') }}</span>
                          <span v-else class="text-muted bg-muted/40 px-1.5 py-0.5 rounded text-[11px]">待核价</span>
                        </td>
                        <td class="px-3 py-2">{{ line.application || '-' }}</td>
                        <td class="px-3 py-2">{{ line.manufacturer || '-' }}</td>
                        <td class="px-3 py-2 font-mono text-muted">{{ line.manufacturerMpn || '-' }}</td>
                        <td class="px-3 py-2 font-mono tabular-nums">{{ line.qty ? `${line.qty} ${line.unit || ''}` : '-' }}</td>
                        <td class="px-3 py-2 font-mono tabular-nums">{{ line.spqReel || '-' }}</td>
                        <td class="px-3 py-2 font-mono">
                          <span v-if="lineUsdKpcs(line) != null" class="font-semibold text-emerald-600 dark:text-emerald-400">{{ formatPrice(lineUsdKpcs(line), '$') }}</span>
                          <span v-else class="text-muted bg-muted/40 px-1.5 py-0.5 rounded text-[11px]">待算</span>
                        </td>
                        <td class="px-3 py-2 font-mono">
                          <span v-if="lineUsdPc(line) != null" class="text-emerald-600 dark:text-emerald-400">{{ formatQuotationUsdPc(lineUsdPc(line)) }}</span>
                          <span v-else class="text-muted bg-muted/40 px-1.5 py-0.5 rounded text-[11px]">待算</span>
                        </td>
                        <td class="px-3 py-2">{{ formatQuotationLeadTime(line.leadTime) || '-' }}</td>
                        <td class="px-3 py-2 font-mono">{{ line.datasheet || '-' }}</td>
                        <td class="px-3 py-2">{{ line.remark || '-' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 px-1 text-xs text-muted">
            <UIcon name="i-lucide-info" class="size-3.5 text-primary shrink-0" />
            <span>{{ footerHint }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="outline" @click="requestCloseUpload">取消</UButton>
            <UButton v-if="canSaveDraft" color="neutral" variant="outline" icon="i-lucide-save" :loading="uploadSubmitting" @click="submitCurrent('save')">{{ editingId ? '更新草稿' : '保存草稿' }}</UButton>
            <UButton v-if="canSubmitNow" color="primary" icon="i-lucide-send" :loading="uploadSubmitting" @click="submitCurrent('submit')">{{ editingId ? '重新提交初审' : '确认并提交初审' }}</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 报价单详情与审核弹窗（与新建报价统一 Excel 风格表格） -->
    <UModal v-model:open="detailOpen" :title="detailModalTitle" :ui="detailModalUi">
      <template #body>
        <div v-if="detailLoading" class="flex flex-1 items-center justify-center"><UProgress animation="carousel" class="w-64" /></div>
        <div v-else-if="detail" class="quotation-detail-layout flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/20">
          <!-- 顶部高密度内联状态栏：高仅 ~55px，释放 80%+ 面积给物料明细表 -->
          <div class="shrink-0 border-b border-muted bg-elevated px-3 py-2 sm:px-4 shadow-xs space-y-1.5">
            <!-- 手机端专用折叠条：保持紧凑单行与展开菜单（兼容手机端审核与测试） -->
            <div v-if="isPhone" class="space-y-2">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UIcon name="i-lucide-building-2" class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-sm font-bold text-highlighted">{{ detail.customerName || '未指定客户' }}</span>
                    <UBadge :color="statusColor(detail.status)" variant="soft" size="xs">{{ detail.statusLabel }}</UBadge>
                  </div>
                  <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span class="truncate font-mono">{{ detail.quoteNo }}</span>
                    <span class="shrink-0 font-mono">{{ phoneShortTime(detail.createTime) }}</span>
                  </div>
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  class="min-h-9 shrink-0"
                  :icon="phoneInfoOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  @click="phoneInfoOpen = !phoneInfoOpen"
                >
                  {{ phoneInfoOpen ? '收起' : '条款与信息' }}
                </UButton>
              </div>

              <div v-if="phoneInfoOpen" class="space-y-2 rounded-lg border border-muted bg-muted/20 p-2.5 text-xs">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-muted">业务员：<span class="font-medium text-highlighted">{{ detail.salespersonName || '未填' }}</span></span>
                  <UButton v-if="detail.canDownload" color="success" size="xs" variant="soft" icon="i-lucide-download" @click="download(detail.id)">下载 Excel</UButton>
                </div>
                <div class="grid grid-cols-2 gap-1.5 text-muted text-[11px]">
                  <div class="col-span-2 flex flex-wrap items-center gap-1.5 truncate">
                    <span>终端客户：<b class="text-highlighted font-normal">{{ detail.endUser || '-' }}</b></span>
                    <UBadge v-if="detail.endUserConflictCount > 0" color="warning" variant="soft" size="xs" icon="i-lucide-triangle-alert">
                      终端客户冲突 ({{ detail.endUserConflictCount }})
                    </UBadge>
                  </div>
                  <div>城市 / City：<b class="text-highlighted font-normal">{{ detail.city || '-' }}</b></div>
                  <div>国家：<b class="text-highlighted font-normal">{{ detail.country || '-' }}</b></div>
                  <div>客户性质：<b class="text-highlighted font-normal">{{ detail.customerStyle || '-' }}</b></div>
                  <div>报价日期：<b class="text-highlighted font-normal">{{ detail.quoteDate || '-' }}</b></div>
                  <div>基准汇率：<b class="text-highlighted font-normal">{{ detail.rate ?? '-' }}</b></div>
                  <div>贸易条款：<b class="text-highlighted font-normal">{{ detail.deliveryTerms || '-' }}</b></div>
                  <div>有效期：<b class="text-highlighted font-normal">{{ detail.validity || '-' }}</b></div>
                  <div class="col-span-2 truncate">付款方式：<b class="text-highlighted font-normal">{{ detail.paymentTerm || '-' }}</b></div>
                  <div class="col-span-2">联系人：<b class="text-highlighted font-normal">{{ detail.contactText || '-' }}</b></div>
                </div>
                <div v-if="detail.initialComment || detail.secondComment || detail.finalComment" class="border-t border-muted pt-1.5 space-y-1 text-[11px]">
                  <div v-if="detail.initialComment" class="text-primary truncate">初审：{{ detail.initialComment }}</div>
                  <div v-if="detail.secondComment" class="text-primary truncate">二审：{{ detail.secondComment }}</div>
                  <div v-if="detail.finalComment" class="text-amber-500 truncate">终审：{{ detail.finalComment }}</div>
                </div>
              </div>

              <!-- 手机端搜索条 -->
              <div class="flex items-center justify-between gap-2 pt-1 border-t border-muted">
                <span class="text-xs font-semibold text-highlighted">明细 ({{ editableLines.length }}项)</span>
                <div class="flex items-center gap-1.5">
                  <UButton
                    v-if="!phoneSearchOpen"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-search"
                    aria-label="筛选明细"
                    @click="openPhoneSearch"
                  />
                  <template v-else>
                    <UInput ref="detailSearchRef" v-model="detailSearch" icon="i-lucide-search" size="xs" placeholder="快速筛选型号、封装、描述…" class="w-full" />
                    <UButton size="xs" color="neutral" variant="ghost" class="shrink-0" icon="i-lucide-x" aria-label="收起筛选" @click="closePhoneSearch" />
                  </template>
                </div>
              </div>
            </div>

            <!-- 桌面端紧凑高密度抬头区：第一行核心状态与筛选，第二行整齐 5 列商务条款网格 -->
            <div v-else class="space-y-1.5">
              <!-- 行 1：客户 + 单号 + 状态 + 业务员 + 搜索 + 导出 -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UIcon name="i-lucide-building-2" class="h-3.5 w-3.5" />
                  </div>
                  <span class="truncate text-sm font-bold text-highlighted" :title="detail.customerName">{{ detail.customerName || '未指定客户' }}</span>
                  <UBadge :color="statusColor(detail.status)" variant="soft" size="xs">{{ detail.statusLabel }}</UBadge>
                  <span class="font-mono text-xs text-muted" :title="detail.quoteNo">单号：{{ detail.quoteNo }}</span>
                  <span class="text-xs text-muted">业务员：<span class="font-medium text-highlighted">{{ detail.salespersonName || '-' }}</span></span>
                  <span class="hidden text-xs text-muted lg:inline">提交时间：<span class="font-mono text-highlighted">{{ detail.createTime || '-' }}</span></span>
                  <UBadge color="neutral" variant="subtle" size="xs">{{ editableLines.length }} 项产品</UBadge>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <UBadge v-if="zeroPriceLineCount" color="warning" variant="soft" size="xs" icon="i-lucide-triangle-alert">{{ zeroPriceLineCount }} 行单价为 0</UBadge>
                  <UInput ref="detailSearchRef" v-model="detailSearch" icon="i-lucide-search" size="xs" placeholder="快速筛选型号、封装、描述…" class="w-48" />
                  <UButton v-if="detail.canDownload" color="success" size="xs" variant="soft" icon="i-lucide-download" @click="download(detail.id)">下载已审核 Excel</UButton>
                </div>
              </div>

              <!-- 行 2：对齐 5 列商务与客户信息网格（2 行 × 5 列） -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-muted/70 bg-muted/20 px-3 py-1.5 text-xs text-muted sm:grid-cols-3 lg:grid-cols-5">
                <div class="flex min-w-0 items-center gap-1" :title="detail.endUser">
                  <span class="truncate">终端客户：<b class="text-highlighted font-normal">{{ detail.endUser || '-' }}</b></span>
                  <UBadge v-if="detail.endUserConflictCount > 0" color="warning" variant="soft" size="2xs" icon="i-lucide-triangle-alert" class="shrink-0">
                    冲突 {{ detail.endUserConflictCount }}
                  </UBadge>
                </div>
                <div class="truncate">国家：<b class="text-highlighted font-normal">{{ detail.country || '-' }}</b></div>
                <div class="truncate">城市 / City：<b class="text-highlighted font-normal">{{ detail.city || '-' }}</b></div>
                <div class="truncate">客户性质：<b class="text-highlighted font-normal">{{ detail.customerStyle || '-' }}</b></div>
                <div class="truncate" :title="detail.contactText">联系人：<b class="text-highlighted font-normal">{{ detail.contactText || '-' }}</b></div>
                <div class="truncate font-mono">报价日期：<b class="text-highlighted font-normal">{{ detail.quoteDate || '-' }}</b></div>
                <div class="truncate font-mono">基准汇率：<b class="text-highlighted font-normal">{{ detail.rate ?? '-' }}</b></div>
                <div class="truncate">贸易条款：<b class="text-highlighted font-normal">{{ detail.deliveryTerms || '-' }}</b></div>
                <div class="truncate">有效期：<b class="text-highlighted font-normal">{{ detail.validity || '-' }}</b></div>
                <div class="truncate" :title="detail.paymentTerm">付款方式：<b class="text-highlighted font-normal">{{ detail.paymentTerm || '-' }}</b></div>
              </div>

              <div v-if="detail.initialComment || detail.secondComment || detail.finalComment" class="flex flex-wrap items-center gap-1.5 text-xs">
                <span v-if="detail.initialComment" class="max-w-md truncate rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary" :title="detail.initialComment">初审意见: {{ detail.initialComment }}</span>
                <span v-if="detail.secondComment" class="max-w-md truncate rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-primary" :title="detail.secondComment">二审意见: {{ detail.secondComment }}</span>
                <span v-if="detail.finalComment" class="max-w-md truncate rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning" :title="detail.finalComment">终审意见: {{ detail.finalComment }}</span>
              </div>

              <!-- 审批留痕：默认收起成一行，展开后显示轮次 -->
              <div v-if="detail?.revisions?.length" class="rounded border border-muted/60 bg-muted/20">
                <button type="button" class="flex w-full items-center gap-2 px-2.5 py-1 text-left text-xs text-muted hover:bg-muted/40 transition" @click="revisionOpen = !revisionOpen">
                  <UIcon name="i-lucide-history" class="h-3 w-3 text-primary shrink-0" />
                  <span class="font-semibold text-highlighted shrink-0">审批留痕</span>
                  <span class="shrink-0">共 {{ revisionRounds }} 轮</span>
                  <span v-if="latestRevision" class="truncate text-[11px]">最新：{{ latestRevision.actionLabel }}（{{ latestRevision.operatorName }} · {{ (latestRevision.createTime || '').slice(5, 16) }}）</span>
                  <UIcon :name="revisionOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ml-auto h-3 w-3 shrink-0" />
                </button>
                <ol v-if="revisionOpen" class="space-y-1 border-t border-muted/60 px-2.5 py-1.5 text-xs">
                  <li v-for="(item, index) in detail.revisions" :key="item.id" class="flex flex-wrap items-center gap-1.5">
                    <UBadge v-if="index === 0 || item.round !== detail.revisions[index - 1].round" color="neutral" variant="soft" size="xs">第 {{ item.round }} 轮</UBadge>
                    <span class="font-mono text-muted">{{ (item.createTime || '').slice(5, 16) }}</span>
                    <span class="font-medium text-highlighted">{{ item.operatorName }}</span>
                    <span>{{ item.actionLabel }}</span>
                    <span v-if="item.comment" class="text-muted">· {{ item.comment }}</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <!-- 审核态专属指引横幅：突出可改单价的视觉示能与改动统计 -->
          <div
            v-if="reviewStage"
            class="shrink-0 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs transition-all"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <UBadge color="primary" variant="subtle" size="xs" class="font-medium">
                  <UIcon :name="reviewStage === 'final' ? 'i-lucide-badge-check' : 'i-lucide-clipboard-pen-line'" class="size-3.5 mr-1" />
                  {{ reviewStageText }}
                </UBadge>
                <span class="font-medium text-highlighted">
                  审核指引：下表中<span class="text-primary font-bold">【单价(人民币/千只)】</span>列可调整人民币单价；其他明细和条款保持只读。
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="modifiedReviewLineCount === 0" class="text-muted flex items-center gap-1">
                  <UIcon name="i-lucide-mouse-pointer-click" class="size-3.5 text-primary/70" />
                  点击单价输入框直接调价，美元单价自动联动
                </span>
                <template v-else>
                  <UBadge color="amber" variant="subtle" size="xs" class="font-medium">
                    <UIcon name="i-lucide-pencil" class="size-3 mr-1" />
                    已调整 {{ modifiedReviewLineCount }} 项产品单价
                  </UBadge>
                  <UButton
                    size="2xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-undo-2"
                    title="将所有已修改单价恢复为进入审核时的单价"
                    @click="resetAllReviewPrices"
                  >
                    全部恢复原价
                  </UButton>
                </template>
              </div>
            </div>
          </div>

          <!-- 终端客户冲突提示横幅：在二审、终审等审核视角展示具体冲突单据，业务员视角仅提示存在其他业务员报价 -->
          <div
            v-if="detail && detail.endUserConflictCount > 0"
            class="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs"
            role="status"
            aria-live="polite"
          >
            <div class="flex flex-wrap items-start gap-2">
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
              <div class="min-w-0 flex-1 space-y-1">
                <div class="font-semibold text-warning">
                  终端客户冲突提醒：检测到终端客户「{{ detail.endUser }}」已有其他业务员报过价（共 {{ detail.endUserConflictCount }} 份报价单）
                </div>
                <ul v-if="detail.endUserConflicts?.length" class="max-h-24 space-y-0.5 overflow-y-auto text-default">
                  <li v-for="item in detail.endUserConflicts.slice(0, 8)" :key="item.id" class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>业务员：<b class="font-semibold text-highlighted">{{ item.salespersonName || '-' }}</b></span>
                    <span>· 终端客户：<b class="font-medium text-highlighted">{{ item.endUser }}</b></span>
                    <span class="font-mono text-muted">· 单号：{{ item.quoteNo }}</span>
                    <span class="font-mono text-muted">· 日期：{{ item.quoteDate || '-' }}</span>
                    <UBadge color="neutral" variant="subtle" size="2xs">{{ item.statusLabel }}</UBadge>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- 中间唯一滚动区：桌面走 RevoGrid 的范围选择与剪贴板；手机没有鼠标语义（双击/框选/Ctrl+V），换成只读卡片 -->
          <TkQuotationLowPriceNotice v-if="detail && detail.status !== 'APPROVED'" :lines="editableLines" :id="detail.id" />
          <div class="quotation-detail-lines min-h-0 flex-1 overflow-hidden">
            <TkQuotationLineCards
              v-if="isPhone"
              :lines="filteredLines"
              empty-text="没有匹配的明细行"
              :review-price-editable="Boolean(reviewStage)"
              @update:review-price="updateReviewPrice"
            />
            <TkQuotationGrid
              v-else
              :lines="filteredLines"
              :rate="Number(detail?.rate) || 6.7"
              :column-order="QUOTATION_GRID_DISPLAY_COLUMN_PROPS"
              dropdown-append-to=".quotation-detail-modal-content"
              :readonly="true"
              :review-price-editable="Boolean(reviewStage)"
              @update:review-price="updateReviewPrice"
              @edit="handleDetailGridEdit"
              @history="handleDetailGridHistory"
              @update:lines="handleDetailGridUpdate"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-col gap-2">
          <!-- 审核态只显示一组操作；确认态在原位置替换，避免右下角出现两排按钮。 -->
          <template v-if="reviewStage">
            <div
              v-if="!pendingReviewAction"
              class="w-full rounded-xl border border-muted/80 bg-surface/40 dark:bg-elevated/30 p-3 space-y-2.5 shadow-2xs"
            >
              <!-- 顶部操作栏：左侧标题与徽章，右侧退出审核 -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UIcon name="i-lucide-clipboard-check" class="size-3.5" />
                  </div>
                  <span class="text-xs font-semibold text-highlighted">审核操作</span>
                  <UBadge color="primary" variant="subtle" size="xs">{{ reviewStageText }}</UBadge>
                  <UBadge
                    v-if="modifiedReviewLineCount > 0"
                    color="amber"
                    variant="subtle"
                    size="xs"
                    class="font-medium"
                  >
                    已调单价 {{ modifiedReviewLineCount }} 项
                  </UBadge>
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-x"
                  :disabled="reviewing"
                  class="text-muted hover:text-highlighted cursor-pointer"
                  @click="cancelReview"
                >
                  退出审核
                </UButton>
              </div>

              <!-- 审核意见输入框 -->
              <div class="space-y-2">
                <UFormField
                  label="审核意见"
                  :hint="reviewCommentError ? undefined : '退回时必填说明，通过时可选填'"
                  :error="reviewCommentError"
                  class="w-full"
                >
                  <UTextarea
                    ref="reviewCommentRef"
                    v-model="reviewComment"
                    :rows="2"
                    size="sm"
                    class="w-full"
                    placeholder="填写审核意见，退回时请说明修改原因…"
                    @focus="handleReviewCommentFocus"
                    @update:model-value="reviewCommentError = ''"
                  />
                </UFormField>

                <!-- 底部动作条：左侧提示，右侧按钮组 -->
                <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div class="flex items-center gap-1.5 text-[11px] text-muted">
                    <UIcon name="i-lucide-shield-alert" class="size-3.5 text-muted/80" />
                    <span>审核意见将完整记入单据审批留痕并同步通知经手人</span>
                  </div>

                  <div class="flex items-center gap-2.5 ml-auto">
                    <UButton
                      color="error"
                      variant="subtle"
                      size="sm"
                      icon="i-lucide-corner-up-left"
                      class="font-medium cursor-pointer"
                      :loading="reviewing"
                      @click="requestReview('return')"
                    >
                      退回业务员
                    </UButton>
                    <UButton
                      color="primary"
                      variant="solid"
                      size="sm"
                      icon="i-lucide-check"
                      class="font-medium shadow-xs cursor-pointer"
                      :loading="reviewing"
                      @click="requestReview('approve')"
                    >
                      <span>通过审核</span>
                      <UBadge
                        v-if="modifiedReviewLineCount > 0"
                        color="neutral"
                        variant="solid"
                        size="2xs"
                        class="ml-1.5 font-mono"
                      >
                        已调价 {{ modifiedReviewLineCount }}
                      </UBadge>
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex w-full flex-col gap-3 rounded-xl border border-muted/80 bg-surface/50 dark:bg-elevated/40 p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-start gap-3">
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-lg shadow-2xs"
                  :class="pendingReviewAction === 'return' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'"
                >
                  <UIcon :name="pendingReviewAction === 'return' ? 'i-lucide-corner-up-left' : 'i-lucide-badge-check'" class="size-4" />
                </span>
                <div class="min-w-0 space-y-0.5">
                  <p class="text-sm font-semibold text-highlighted">{{ pendingReviewConfirmTitle }}</p>
                  <p class="text-xs text-muted">{{ pendingReviewConfirmHint }}</p>
                </div>
              </div>
              <div class="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                <UButton color="neutral" variant="outline" size="sm" class="justify-center font-medium" :disabled="reviewing" @click="cancelPendingReview">返回修改</UButton>
                <UButton
                  :color="pendingReviewAction === 'return' ? 'error' : 'primary'"
                  size="sm"
                  class="justify-center font-medium shadow-xs"
                  :loading="reviewing"
                  :icon="pendingReviewAction === 'return' ? 'i-lucide-corner-up-left' : 'i-lucide-check'"
                  @click="confirmReview"
                >
                  {{ pendingReviewAction === 'return' ? '确认退回' : '确认通过' }}
                </UButton>
              </div>
            </div>
          </template>

          <!-- 手机：只留主操作大按钮 + 「⋯」 —— 原来一排「关闭/撤回为草稿/开始初审」三个按钮抢注意力，
               撤回还是业务员动作，初审人容易误触；关闭交给弹窗右上角的 × -->
          <div v-if="isPhone && !reviewStage" class="flex w-full items-center gap-2">
            <TkQuotationRemindButton :quotation="detail" />
            <UButton
              v-if="phonePrimaryAction"
              :color="phonePrimaryAction.color"
              :icon="phonePrimaryAction.icon"
              size="lg"
              class="min-h-11 flex-1"
              :loading="draftSubmitting"
              @click="phonePrimaryAction.run()"
            >
              {{ phonePrimaryAction.label }}
            </UButton>
            <UButton v-else size="lg" color="neutral" variant="outline" class="min-h-11 flex-1" icon="i-lucide-x" @click="closeDetail">关闭</UButton>
            <UDropdownMenu v-if="phoneDetailMenuItems.length" :items="phoneDetailMenuItems" :content="{ align: 'end' }">
              <UButton size="lg" color="neutral" variant="outline" class="min-h-11" icon="i-lucide-ellipsis-vertical" aria-label="更多操作" />
            </UDropdownMenu>
          </div>

          <div v-if="!isPhone && !reviewStage" class="flex w-full flex-wrap items-center justify-between gap-2">
            <!-- 底部左侧：破坏性 / 逆向流转与提醒辅助动作 -->
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <UButton v-if="detail?.status === 'DRAFT'" color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" :loading="draftSubmitting" @click="handleDeleteDraft(detail)">删除草稿</UButton>
              <UButton v-if="canWithdrawRow(detail)" color="warning" variant="soft" size="sm" icon="i-lucide-undo-2" :loading="draftSubmitting" @click="handleWithdraw(detail)">撤回为草稿</UButton>
              <UButton v-if="detail?.canUndoReview && !reviewStage" color="warning" variant="soft" size="sm" icon="i-lucide-undo-2" @click="undoApproval(detail)">撤销通过</UButton>
              <TkQuotationRemindButton :quotation="detail" size="sm" variant="soft" />
            </div>
            <!-- 底部右侧：常规关闭 + 单一正向主行动点在最右 -->
            <div class="flex flex-wrap items-center gap-2">
              <UButton color="neutral" variant="outline" size="sm" @click="closeDetail">关闭</UButton>
              <UButton v-if="detail?.canEditDraft" color="neutral" variant="outline" size="sm" icon="i-lucide-square-pen" @click="openEdit(detail)">{{ detail?.status === 'RETURNED' ? '修改报价单' : '编辑草稿' }}</UButton>
              <UButton v-if="detail?.canEditDraft" color="primary" size="sm" icon="i-lucide-send" :loading="draftSubmitting" @click="handleSubmitDraft(detail)">{{ detail?.status === 'RETURNED' ? '修改后重新提交初审' : '确认提交初审' }}</UButton>
              <UButton v-if="(detail?.canInitialReview || detail?.canSecondReview || detail?.canFinalReview) && !reviewStage" color="primary" size="sm" icon="i-lucide-clipboard-pen-line" @click="startReview">{{ reviewBeginLabel }}</UButton>
            </div>
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
import TkQuotationAnalysis from '@/packages/ui/TkQuotationAnalysis.vue'
import * as XLSX from 'xlsx/xlsx.mjs'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useDebounceFn, useMediaQuery } from '@vueuse/core'
import useUserStore from '@/store/modules/user'
import {
  applyQuotationPasteGrid,
  cleanQuotationText,
  computeQuotationUsdKpcs,
  computeQuotationUsdPc,
  createQuotationPasteHistory,
  detectQuotationColumnMapping,
  isCurrentQuotationTemplateHeader,
  formatQuotationDate,
  formatQuotationLeadTime,
  formatQuotationOptionViolations,
  formatQuotationUsdPc,
  isQuotationZeroPriceValue,
  normalizeQuotationDate,
  normalizeQuotationLeadTime,
  normalizeQuotationOptionValue,
  normalizeQuotationValidity,
  parseQuotationPasteGrid,
  quotationDateIso,
  quotationOptionViolations,
  DEFAULT_QUOTATION_UNIT,
  QUOTATION_GRID_PASTE_COLUMN_PROPS,
  QUOTATION_GRID_DISPLAY_COLUMN_PROPS,
  QUOTATION_COUNTRY_MENU_OPTIONS,
  QUOTATION_CUSTOMER_STYLE_OPTIONS,
  QUOTATION_VALIDITY_OPTIONS,
  QUOTATION_VALIDITY_PATTERN_SOURCE,
} from '@ctk-system/shared'
import { TkQuotationGrid, TkQuotationLineCards, isRepeatClick, resolveRowFromDoubleClick } from '@ctk-system/ui'
import { useTkAutoRefresh } from '@/packages/composables/useTkAutoRefresh.js'
import {
  checkQuotationEndUserConflict,
  createQuotation,
  deleteQuotation,
  getQuotation,
  getQuotationDownloadUrl,
  listQuotations,
  reviewQuotation,
  searchQuotationOptions,
  submitQuotation,
  updateQuotation,
  uploadQuotation,
  withdrawQuotation,
} from '@/api/tk_custom/quotation'

definePageMeta({ title: '外贸销售报价单', permission: 'tk_custom:quotation:list' })

const toast = useToast()
const userStore = useUserStore()
const activeTab = ref('list')
const loading = ref(false)
const total = ref(0)
const rows = ref([])
const listQuery = reactive({ pageNum: 1, pageSize: 50, keyword: '', status: '' })
// 提交时间范围：日期范围值的唯一真相，请求前再展开成服务端要的 from/to
const listDateRange = ref([])
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const listDateRangeOpen = ref(false)
const calendarMonths = useCalendarMonths();
function onlistDateRangePick(range) {
  if (!range?.start || !range?.end) return
  listDateRange.value = calendarToArray(range, 'date')
  listDateRangeOpen.value = false
}
function applylistDateRangePreset(preset) {
  listDateRange.value = presetToArray(preset, 'date')
  listDateRangeOpen.value = false
}
function clearlistDateRange() {
  listDateRange.value = []
  listDateRangeOpen.value = false
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

// 权限判定
const can = (permission) => Number(userStore.id) === 1 || userStore.permissions.includes(permission) || userStore.permissions.includes('*:*:*') || userStore.permissions.includes('tk_custom:quotation:*')
const canUpload = computed(() => can('tk_custom:quotation:upload'))
const canDownload = computed(() => can('tk_custom:quotation:download'))
const canAnalysis = computed(() => can('tk_custom:quotation:analysis'))

// ── 移动端（2026-09-17）：初审人在手机上审核 ──────────────────────────────
// 640px 是「手机」语义的分界（Tailwind sm）；layout 里的 1024px 是侧边栏模式，两者不要混用。
// 注：曾做过「待我初审/二审/终审」一键入口，2026-09-18 按用户口径删掉 —— 对能审多环的账号
// （超管/总经理/副总经理）它只挑了最高一环，标签还会误导成「待我终审」；现在一律用「状态」下拉筛选，
// 默认进来就是全部单据。
const isPhone = useMediaQuery('(max-width: 639px)')

/** 这一行现在能不能被我审（服务端已把权限算成 canXxxReview） */
async function undoApproval(record) {
  if (!record?.canUndoReview || !window.confirm(`确定撤销报价单【${record.quoteNo}】最近一次审核通过吗？\n将恢复审核前价格，回到本级待审核。`)) return
  try {
    const response = await reviewQuotation({ id: record.id, stage: record.undoReviewStage, action: 'undo' })
    if (response?.code !== 200) throw new Error(response?.msg || '撤销失败')
    toast.add({ title: '已撤销通过', color: 'success' })
    const refreshed = await getQuotation(record.id)
    if (refreshed?.code === 200) detail.value = refreshed.data
    await loadList()
  } catch (error) { toast.add({ title: error?.message || '撤销失败', color: 'error' }) }
}

function canReviewRow(row) {
  return Boolean(row?.canInitialReview || row?.canSecondReview || row?.canFinalReview)
}

/**
 * 手机卡片上的「审核」：打开详情并直接进审核态。
 * 桌面那套是「打开详情 → 再按开始初审」，手机上多点一次就多一次误触机会。
 */
async function openReview(row) {
  await openRecord(row)
  if (reviewStage.value) return
  if (!canReviewRow(detail.value)) return
  startReview()
}

/** 手机卡片上收进「⋯」的次要操作（主操作直接摆在卡片上） */
function phoneCardMenuItems(row) {
  const items = []
  if (canWithdrawRow(row)) items.push({ label: '撤回为草稿', icon: 'i-lucide-undo-2', onSelect: () => handleWithdraw(row) })
  if (row?.canDeleteDraft) items.push({ label: '删除草稿', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => handleDeleteDraft(row) })
  if (canDownloadRow(row)) items.push({ label: '下载已审核', icon: 'i-lucide-download', onSelect: () => download(row.id) })
  return items
}

/** 桌面表格操作列「⋯」次要操作：避免撤回/删除破坏性按钮挤占每行横向空间 */
function desktopRowMenuItems(row) {
  const items = []
  if (canReviewRow(row) && canDownloadRow(row)) {
    items.push({ label: '下载已审核', icon: 'i-lucide-download', onSelect: () => download(row.id) })
  }
  if (canWithdrawRow(row)) {
    items.push({ label: '撤回为草稿', icon: 'i-lucide-undo-2', onSelect: () => handleWithdraw(row) })
  }
  if (row?.canDeleteDraft) {
    items.push({ label: '删除草稿', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => handleDeleteDraft(row) })
  }
  return items
}

// 上传模态框状态
const uploadOpen = ref(false)
const fileInputRef = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const uploadParsing = ref(false)
const uploadSubmitting = ref(false)
const parseError = ref('')
const parsedData = ref(null)
const editingId = ref(null)
const editingQuoteNo = ref('')
const uploadModalTitle = computed(() => (editingId.value ? `编辑外贸报价单 · ${editingQuoteNo.value}` : '新建外贸报价单'))

// 尺寸固定：切换「在线表格录入 / 导入 Excel 模板」两个 tab 时弹窗不许改大小 ——
// 空态（导入 Excel 还没选文件）只是把内容居中，不再把弹窗缩成小卡片
const uploadModalUi = computed(() => ({
  content: 'quotation-upload-modal-content flex h-[92vh] w-[96vw] supports-[height:100dvh]:h-[92dvh] max-w-[96vw] flex-col overflow-hidden',
  body: 'flex-1 min-h-0 flex flex-col p-0 overflow-hidden',
  header: 'shrink-0 border-b border-muted bg-elevated px-4 py-2',
  footer: 'shrink-0 border-t border-muted bg-elevated px-4 py-2',
}))

// 详情/审核弹窗尺寸：桌面维持原样；手机走全屏（quotation-phone-modal 在 global.css 里
// 用 vh → dvh 两行声明做回退，不认 dvh 的浏览器整条丢弃第二条声明，自动退回 vh）。
// 手机标题不带单号：摘要行里已经有，标题再挂一遍就是同一屏出现三次
const detailModalTitle = computed(() => {
  if (!detail.value) return '报价单详情'
  if (reviewStage.value) return isPhone.value ? `${reviewStageText.value}报价单` : `${reviewStageText.value}报价单 · ${detail.value.quoteNo}`
  return isPhone.value ? '报价单详情' : `报价单详情 · ${detail.value.quoteNo}`
})

const detailModalUi = computed(() => ({
  content: isPhone.value
    ? 'quotation-detail-modal-content quotation-phone-modal flex flex-col overflow-hidden'
    : 'quotation-detail-modal-content max-w-[96vw] 2xl:max-w-7xl h-[90vh] flex flex-col overflow-hidden',
  body: 'quotation-detail-body flex-1 min-h-0 flex flex-col p-0 overflow-hidden',
  header: `shrink-0 border-b border-muted bg-elevated py-3 ${isPhone.value ? 'px-4' : 'px-5'}`,
  // 手机上底部操作条要躲开 iPhone 的 home indicator，安全区由 .quotation-phone-footer 兜
  footer: `quotation-detail-footer quotation-phone-footer shrink-0 border-t border-muted bg-default py-3 ${isPhone.value ? 'px-4 pb-2' : 'px-5'}`,
}))
// 切换「表格录入 / 上传 Excel」时暂存手工录的内容，避免误切一次就丢整张表
const deliveryTermBaseOptions = ['FOB Shenzhen', 'EXW Dongguan', 'CIF', 'FCA Shenzhen', 'FOB Hongkong', 'FCA Hongkong']
const leadTimeOptions = ['1-30days']
const warrantyOptions = ['2 years']
// 有效期档位：模板那句只认天数，所以给的都是 <n>days（清单在 shared/quotationValidity.js）
const validityBaseOptions = QUOTATION_VALIDITY_OPTIONS
const paymentTermOptions = ref([])
const paymentTermOptionsLoading = ref(false)
let paymentTermOptionsRequestVersion = 0
const customerOptions = ref([])
const customerSearchTerm = ref('')
const customerOptionsLoading = ref(false)
const materialOptions = ref([])
const materialOptionsLoading = ref(false)

async function fetchMaterialOptions(keyword = '') {
  materialOptionsLoading.value = true
  try {
    const res = await request({
      url: '/tk_custom/material/options',
      method: 'get',
      headers: { silentError: true },
      params: { keyword: String(keyword || '').trim(), limit: 100 },
    })
    const rows = res?.data || res?.rows || []
    if (Array.isArray(rows)) {
      const seen = new Set(materialOptions.value.map((m) => String(m.value || m.number || '').toUpperCase()))
      const next = [...materialOptions.value]
      for (const row of rows) {
        const num = String(row.number || row.value || '').trim()
        if (num && !/^N/i.test(num)) continue
        const key = String(row.value || row.number || '').toUpperCase()
        if (key && !seen.has(key)) {
          seen.add(key)
          next.push(row)
        }
      }
      materialOptions.value = next
    }
  } catch {
    // 接口降级
  } finally {
    materialOptionsLoading.value = false
  }
}
const optionSearchTerms = reactive({ deliveryTerms: '', validity: '', paymentTerm: '', leadTime: '', warranty: '', country: '' })
// 单据条款输入框的下拉开合状态：由组件外持，才能让「创建 X」这一项点了真收起。
// Nuxt UI 的 create-item 会 preventDefault 掉 ComboboxItem 的默认行为（既不落值也不收下拉），
// 所以点「创建」只发 create 事件，这里必须自己接住，否则就是一个点了没反应的死控件。
const optionMenuOpen = reactive({ customer: false, deliveryTerms: false, validity: false, paymentTerm: false, country: false })
let customerOptionsSearchVersion = 0
const cleanOptionText = (value) => String(value || '').replace(/^[\s_]+|[\s_]+$/gu, '').trim()
const uniqueTextOptions = (...groups) => Array.from(new Set(groups.flat().map(cleanOptionText).filter(Boolean)))
const deliveryTermOptions = computed(() => uniqueTextOptions(
  deliveryTermBaseOptions,
  rows.value.map((row) => row.deliveryTerms),
  parsedData.value?.deliveryTerms,
  editableTerms?.deliveryTerms,
  detail.value?.deliveryTerms,
))
const validityOptions = computed(() => uniqueTextOptions(
  validityBaseOptions,
  rows.value.map((row) => row.validity),
  parsedData.value?.validity,
  editableTerms?.validity,
  detail.value?.validity,
))
// 下拉开合：打开选项类字段先把上次的搜索词清掉，让清单从头显示；
// 客户字段打开时按当前输入重拉一次（输入没变时 watch 不会触发，历史客户会漏）。
function handleOptionMenuOpen(field, open) {
  optionMenuOpen[field] = open
  if (!open) return
  if (field === 'customer') {
    void fetchCustomerOptions(customerSearchTerm.value.trim(), ++customerOptionsSearchVersion)
    return
  }
  if (field === 'paymentTerm') {
    void fetchPaymentTermOptions()
  }
  optionSearchTerms[field] = ''
}
// autocomplete 模式下输入即取值，点「创建 X」只需要真正收下拉，给出「已确认」的反馈
function handleOptionMenuCreate(field) {
  optionMenuOpen[field] = false
}
const refreshCustomerOptions = useDebounceFn((keyword, version) => fetchCustomerOptions(keyword, version), 350)
watch(customerSearchTerm, handleCustomerSearchTermChange)
// 粘贴列顺序 = 新模板 A..V 去掉序号后的顺序。美元两列是按「人民币 ÷ 汇率」算出来的只读列，
// 从模板复制整行粘贴时保留这两列的位置，保证不错位，但值一律忽略（不允许手填）。



// 0 是合法数值，却是最常见的「没核价」伪装：单独标出来，别让它看着像已核价
// （口径唯一定义在 @ctk-system/shared 的 isQuotationZeroPriceValue，手机卡片与列表共用）
const isZeroPrice = (value) => isQuotationZeroPriceValue(value)

// 详情与审核弹窗状态
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const editableLines = ref([])
// 详情/审核明细网格的撤销重做（与已移除的录入粘贴历史无关，这里复用同一份历史栈实现）
const detailHistory = createQuotationPasteHistory()
const editableTerms = reactive({
  deliveryTerms: '',
  validity: '',
  paymentTerm: '',
})

function syncEditableTerms(src) {
  editableTerms.deliveryTerms = src?.deliveryTerms || ''
  editableTerms.validity = src?.validity || ''
  editableTerms.paymentTerm = src?.paymentTerm || ''
}

const detailSearch = ref('')
const filteredLines = computed(() => {
  const keyword = detailSearch.value.trim().toLowerCase()
  if (!keyword) return editableLines.value
  return editableLines.value.filter((line) => {
    return [
      line.ctkMpn,
      line.materialCode,
      line.description,
      line.quoteTo,
      line.endUser,
      line.manufacturer,
      line.packageName,
      line.application,
    ].some((val) => String(val || '').toLowerCase().includes(keyword))
  })
})

function lineIdentity(line) {
  return line?.id != null ? `id:${line.id}` : `line:${line?.lineNo}`
}

// 零价校验口径 = 业务员报的人民币单价 + 汇率；成交价在终审通过时才冻结
function effectiveLinePrices(line) {
  return [line?.originalPriceRmb, line?.rate]
}

// 网格/预览共用的美元换算（千只美元价 = 人民币单价 ÷ 汇率）
function lineUsdKpcs(line) {
  const rate = (line?.rate != null && String(line?.rate).trim() !== '') ? line.rate : (parsedData.value?.rate ?? formData.rate ?? detail.value?.rate)
  return computeQuotationUsdKpcs(line?.originalPriceRmb, rate)
}
function lineUsdPc(line) {
  return computeQuotationUsdPc(lineUsdKpcs(line))
}

const zeroPriceLineCount = computed(() => editableLines.value
  .filter((line) => effectiveLinePrices(line).some((value) => isZeroPrice(value)))
  .length)

function handleDetailGridUpdate(lines) {
  const updates = new Map((Array.isArray(lines) ? lines : []).map((line) => [lineIdentity(line), line]))
  editableLines.value = editableLines.value.map((line) => updates.get(lineIdentity(line)) || line)
}

function handleDetailGridEdit({ previousLines }) {
  if (!reviewStage.value || !previousLines?.length) return
  const previousByIdentity = new Map(previousLines.map((line) => [lineIdentity(line), line]))
  const previousFullLines = editableLines.value.map((line) => previousByIdentity.get(lineIdentity(line)) || { ...line })
  detailHistory.record({ lines: previousFullLines })
}

function handleDetailGridHistory(action) {
  if (!reviewStage.value) return
  const snapshot = action === 'undo'
    ? detailHistory.undo({ lines: editableLines.value })
    : action === 'redo'
      ? detailHistory.redo({ lines: editableLines.value })
      : null
  if (snapshot?.lines) editableLines.value = snapshot.lines
}

const reviewStage = ref('')
const reviewAction = ref('approve')
const reviewComment = ref('')
const reviewing = ref(false)
const reviewStageText = computed(() => ({
  initial: '初审中',
  second: '二审中',
  final: '终审中',
}[reviewStage.value] || ''))

/** 处于审核态时，被审核人修改过单价的行列表 */
const modifiedReviewLines = computed(() => {
  if (!reviewStage.value || !Array.isArray(editableLines.value)) return []
  return editableLines.value.filter((line) => {
    const base = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
    return normPrice(line.reviewPriceRmb) !== normPrice(base)
  })
})
const modifiedReviewLineCount = computed(() => modifiedReviewLines.value.length)

/** 一键恢复所有被改动的单价为进入审核时的原价 */
function resetAllReviewPrices() {
  editableLines.value = editableLines.value.map((line) => ({
    ...line,
    reviewPriceRmb: line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb,
  }))
  toast.add({ title: '已将所有单价恢复为进入审核时的初始单价', color: 'neutral' })
}
// 当前用户可以审哪一环，就显示对应的开始按钮
const reviewBeginLabel = computed(() => {
  if (detail.value?.canFinalReview) return '开始终审'
  if (detail.value?.canSecondReview) return '开始二审'
  if (detail.value?.canInitialReview) return '开始初审'
  return '开始审核'
})

// ── 手机端详情弹窗的折叠与操作收口（2026-09-18 UI 优化）────────────────────
// 顶部四个区块全展开在 390×844 上要吃掉约 320px，明细只剩 1.5 张卡；这里把条款/业务员收进折叠，
// 搜索框也收成图标按钮，底部只留一个主操作 + 「⋯」。
const phoneInfoOpen = ref(false)
const phoneSearchOpen = ref(false)
const detailSearchRef = ref(null)

/** 单号旁的短时间：桌面显示完整 2026-09-18 09:08:53，手机只留 09-18 09:08 */
function phoneShortTime(value) {
  const text = String(value || '')
  return text.length >= 16 ? text.slice(5, 16) : (text || '未填')
}

async function openPhoneSearch() {
  phoneSearchOpen.value = true
  await nextTick()
  const root = detailSearchRef.value?.$el
  const input = root?.querySelector?.('input') || root
  if (typeof input?.focus === 'function') input.focus()
}

async function closePhoneSearch() {
  detailSearch.value = ''
  phoneSearchOpen.value = false
}

// 手机底部主操作：能编辑就给提交，能审就给开始审核，都没有就只剩关闭
const phonePrimaryAction = computed(() => {
  const row = detail.value
  if (!row) return null
  if (row.canEditDraft) {
    return {
      label: row.status === 'RETURNED' ? '修改后重新提交初审' : '确认提交初审',
      color: 'warning',
      icon: 'i-lucide-send',
      run: () => handleSubmitDraft(row),
    }
  }
  if (canReviewRow(row)) {
    return { label: reviewBeginLabel.value, color: 'primary', icon: 'i-lucide-clipboard-pen-line', run: startReview }
  }
  return null
})

// 手机底部「⋯」：撤回/编辑/删除/下载都是次要动作，收进菜单避免一排按钮里误触
const phoneDetailMenuItems = computed(() => {
  const row = detail.value
  if (!row) return []
  const items = []
  if (row.canEditDraft) items.push({ label: row.status === 'RETURNED' ? '修改报价单' : '编辑草稿', icon: 'i-lucide-square-pen', onSelect: () => openEdit(row) })
  if (canWithdrawRow(row)) items.push({ label: '撤回为草稿', icon: 'i-lucide-undo-2', onSelect: () => handleWithdraw(row) })
  if (row.canDeleteDraft) items.push({ label: '删除草稿', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => handleDeleteDraft(row) })
  if (row.canDownload) items.push({ label: '下载已审核 Excel', icon: 'i-lucide-download', onSelect: () => download(row.id) })
  return items
})

// ── 审核动作的二次确认（手机误触代价高：退回会把单据打回业务员并通知所有经手人）──
const pendingReviewAction = ref('')
const reviewCommentError = ref('')
const reviewCommentRef = ref(null)
const pendingReviewConfirmTitle = computed(() => {
  const quoteNo = detail.value?.quoteNo || ''
  return pendingReviewAction.value === 'return' ? `确认退回【${quoteNo}】？` : `确认通过【${quoteNo}】？`
})
const pendingReviewConfirmHint = computed(() => {
  if (pendingReviewAction.value === 'return') {
    return '退回后单据落「已退回」，业务员改完重新提交会从初审重跑，并通知所有经手人；你的审核意见会一并带给业务员。'
  }
  const adjustmentNote = modifiedReviewLineCount.value > 0
    ? `本次包含 ${modifiedReviewLineCount.value} 项产品单价调整，将以新价格生效。`
    : ''
  return `${adjustmentNote}${reviewStageText.value || '审核'}通过后流转到下一环节，审核意见会记入审批留痕。`
})

// 点「通过 / 退回」只做校验与二次确认，真正的提交仍在 submitReview（放开这里等于放开接口调用）
function requestReview(action) {
  if (!detail.value || !reviewStage.value) return
  if (action === 'return' && !reviewComment.value.trim()) {
    reviewCommentError.value = '退回必须填写审核原因，业务员要照着改'
    nextTick(focusReviewComment)
    return
  }
  reviewCommentError.value = ''
  pendingReviewAction.value = action
}

function cancelPendingReview() {
  pendingReviewAction.value = ''
}

function confirmReview() {
  const action = pendingReviewAction.value
  pendingReviewAction.value = ''
  return submitReview(action)
}

/**
 * 手机上软键盘会盖住底部操作条，而 iOS Safari 不会缩 viewport —— 只能自己把输入框滚进可视区。
 * UTextarea 的 ref 是组件实例，所以两种形态都试一遍（组件实例 / 原生 textarea）。
 */
function reviewCommentInputElement() {
  const instance = reviewCommentRef.value
  const root = instance?.$el
  if (root && typeof root.querySelector === 'function') return root.querySelector('textarea, input') || root
  return root || null
}

function focusReviewComment() {
  const element = reviewCommentInputElement()
  if (element && typeof element.focus === 'function') element.focus()
  if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center' })
}

function handleReviewCommentFocus() {
  nextTick(() => {
    const element = reviewCommentInputElement()
    if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center' })
  })
}
// 审批留痕轮次数：每一轮从业务员「提交初审」开始
const revisionRounds = computed(() => (detail.value?.revisions || [])
  .reduce((max, item) => Math.max(max, Number(item.round || 1)), 1))
const latestRevision = computed(() => {
  const list = detail.value?.revisions || []
  return list.length ? list[list.length - 1] : null
})
// 留痕默认收起：常驻铺开会挤掉明细表格的可视行数（小屏尤其明显）
const revisionOpen = ref(false)
// 审核打开时的快照：提交时只发送与快照不一致的行价格与条款，未改动的不发送
const detailSnapshot = ref(null)

function snapshotReviewState() {
  detailSnapshot.value = {
    lines: editableLines.value.map((line) => ({
      id: line.id,
      initialPriceRmb: normPrice(line.initialPriceRmb),
      initialPriceUsd: normPrice(line.initialPriceUsd),
      finalPriceRmb: normPrice(line.finalPriceRmb),
      finalPriceUsd: normPrice(line.finalPriceUsd),
    })),
    terms: {
      deliveryTerms: normTerm(editableTerms.deliveryTerms),
      validity: normTerm(editableTerms.validity),
      paymentTerm: normTerm(editableTerms.paymentTerm),
    },
  }
}

const analysisView = ref(null)
function updateReviewPrice({ id, lineNo, priceRmb }) {
  editableLines.value = editableLines.value.map((line) =>
    (id != null ? line.id === id : line.lineNo === lineNo)
      ? { ...line, reviewPriceRmb: priceRmb }
      : line)
}

// 日期范围 → 服务端 from/to（空区间不带条件，服务端按 create_time 的 DATE() 比较）
function withDateRange(base, range) {
  return { ...base, from: range?.[0] || '', to: range?.[1] || '' }
}

async function loadList(options = {}) {
  const silent = Boolean(options?.silent)
  if (!silent) loading.value = true
  try {
    const response = await listQuotations(withDateRange(listQuery, listDateRange.value))
    if (response?.code !== 200) throw new Error(response?.msg || '报价单列表加载失败')
    rows.value = Array.isArray(response.rows) ? response.rows : []
    total.value = Number(response.total || 0)
  } catch (error) {
    if (!silent) toast.add({ title: error?.message || '报价单列表加载失败', color: 'error' })
  } finally {
    if (!silent) loading.value = false
  }
}

function mergeCustomerOptions(values) {
  customerOptions.value = uniqueTextOptions(customerOptions.value, values)
}

function handleCustomerSearchTermChange(value) {
  const query = String(value || '').trim()
  const version = ++customerOptionsSearchVersion
  if (!query) mergeCustomerOptions([])
  refreshCustomerOptions(query, version)
}

async function fetchCustomerOptions(keyword, version) {
  const query = String(keyword || '').trim()
  if (version !== customerOptionsSearchVersion || customerSearchTerm.value.trim() !== query) return
  customerOptionsLoading.value = true
  try {
    const response = await searchQuotationOptions({
      type: 'customer',
      limit: 200,
      ...(query ? { keyword: query } : {}),
    })
    if (response?.code !== 200) throw new Error(response?.msg || '客户列表加载失败')
    if (version !== customerOptionsSearchVersion || customerSearchTerm.value.trim() !== query) return
    const options = Array.isArray(response.data) ? response.data.map((item) => item?.name).filter(Boolean) : []
    mergeCustomerOptions(options)
  } catch (error) {
    if (version === customerOptionsSearchVersion) {
      toast.add({ title: '客户列表加载失败', description: error?.message || '请稍后重试', color: 'error' })
    }
  } finally {
    if (version === customerOptionsSearchVersion) customerOptionsLoading.value = false
  }
}

async function fetchPaymentTermOptions() {
  const version = ++paymentTermOptionsRequestVersion
  paymentTermOptionsLoading.value = true
  try {
    const response = await searchQuotationOptions({ type: 'payment-term', limit: 200 })
    if (response?.code !== 200) throw new Error(response?.msg || '付款方式列表加载失败')
    if (version !== paymentTermOptionsRequestVersion) return
    paymentTermOptions.value = uniqueTextOptions(response.data)
  } catch (error) {
    if (version === paymentTermOptionsRequestVersion) {
      toast.add({ title: '付款方式列表加载失败', description: error?.message || '请稍后重试', color: 'error' })
    }
  } finally {
    if (version === paymentTermOptionsRequestVersion) paymentTermOptionsLoading.value = false
  }
}

function searchList() {
  listQuery.pageNum = 1
  loadList()
}

function resetList() {
  Object.assign(listQuery, { pageNum: 1, keyword: '', status: '' })
  listDateRange.value = []
  loadList()
}

function downloadTemplate() {
  window.open('/prod-api/tk_custom/quotation/template', '_blank')
}

// 新建：默认进「在线表格录入」，也可以切到「导入 Excel 模板」上传建单（两条路都通）
function openUpload() {
  selectedFile.value = null
  parsedData.value = null
  parseError.value = ''
  uploadParsing.value = false
  uploadSubmitting.value = false
  uploadOpen.value = true
  editingId.value = null
  editingQuoteNo.value = ''
  inputMode.value = 'form'
  resetFormData({ quoteDate: formatQuotationDate(new Date()) })
  resetFormHistory()
  void fetchMaterialOptions()
}

// 切换录入方式：两侧内容各自留在内存里，切回来接着编（不互相清空）
function switchInputMode(mode) {
  if (inputMode.value === mode) return
  inputMode.value = mode
  parseError.value = ''
}

// 编辑草稿/已退回：默认把明细回填进在线录入网格直接改；也可切到「导入 Excel」用新 Excel 整单覆盖
async function openEdit(record) {
  if (!record?.id) return
  const response = await getQuotation(record.id)
  if (response?.code !== 200) {
    toast.add({ title: response?.msg || '报价单详情加载失败', color: 'error' })
    return
  }
  const data = response.data || {}
  if (data.canEditDraft === false) {
    toast.add({ title: '只有本人创建的草稿或已退回的报价单可以修改', color: 'warning' })
    return
  }
  if (detailOpen.value) closeDetail()
  parseError.value = ''
  uploadParsing.value = false
  uploadSubmitting.value = false
  void fetchMaterialOptions()
  selectedFile.value = null
  parsedData.value = null
  editingId.value = data.id
  editingQuoteNo.value = data.quoteNo || ''
  const firstLine = (data.lines || [])[0] || {}
  resetFormData({
    customerName: data.customerName || firstLine.quoteTo || '',
    endUser: data.endUser || firstLine.endUser || '',
    country: data.country || firstLine.country || '',
    city: data.city || '',
    customerStyle: data.customerStyle || firstLine.customerStyle || '',
    rate: data.rate ?? firstLine.rate ?? 6.7,
    quoteDate: data.quoteDate || firstLine.quoteDate || '',
    deliveryTerms: data.deliveryTerms,
    validity: data.validity,
    paymentTerm: data.paymentTerm,
    lines: data.lines || [],
  })
  resetFormHistory()
  inputMode.value = 'form'
  uploadOpen.value = true
}

function handleRowDblclick(row) {
  if (row?.canEditDraft) openEdit(row)
}

// ── 列表：原生 UTable 的行交互（单击选中、再击取消、双击打开）────────────────
// TkUTable 的 row-open 换成原生接线：:on-select 收单击、@dblclick 收双击。
// 双击取哪一行仍复用 tkTableInteraction 的同一套算法（记录行优先、DOM 序号兜底），
// 忽略区（按钮/操作列/data-row-interaction=ignore）单击不选中、双击不打开。
const ROW_IGNORE_SELECTOR = 'button, a, input, textarea, select, img, [role="checkbox"], [data-row-interaction="ignore"]'
const listRowSelection = ref({})
let lastListClickedRow = null
let lastListClickedTr = null

function handleListSelect(event, row) {
  // 双击的第二下 click 交给 dblclick：不拦掉会在选中→取消→再选中之间抖动
  if (isRepeatClick(event)) return
  if (event?.target?.closest?.(ROW_IGNORE_SELECTOR)) return
  const rowKey = String(row.id)
  const selectedKeys = Object.keys(listRowSelection.value || {}).filter((key) => listRowSelection.value[key])
  // 再击取消：已选中的就是这一行时清掉；否则单选这一行
  listRowSelection.value = selectedKeys.length === 1 && selectedKeys[0] === rowKey ? {} : { [rowKey]: true }
  lastListClickedRow = row
  lastListClickedTr = event?.currentTarget ?? null
}

function handleListDblclick(event) {
  if (event?.target?.closest?.(ROW_IGNORE_SELECTOR)) return
  const tr = event.target?.closest?.('tbody tr[data-slot="tr"]')
  if (!tr) return
  const row = resolveRowFromDoubleClick({
    recordedRow: lastListClickedRow,
    recordedTr: lastListClickedTr,
    tr,
    rows: rows.value || [],
    domIndex: Array.from(tr.parentElement?.children || [])
      .filter((el) => el.matches?.('tr[data-slot="tr"]'))
      .indexOf(tr),
  })
  if (row) handleRowDblclick(row)
}


function closeUpload() {
  // 先清内容再关：关弹窗的 watcher 用「还有没有内容」判断要不要确认，先清掉就不会重复弹确认
  editingId.value = null
  editingQuoteNo.value = ''
  selectedFile.value = null
  parsedData.value = null
  parseError.value = ''
  formEndUserConflictVersion += 1
  uploadEndUserConflictVersion += 1
  resetEndUserConflict(formEndUserConflict)
  resetEndUserConflict(uploadEndUserConflict)
  resetFormHistory()
  resetFormData()
  uploadOpen.value = false
}

// 关闭确认统一在这里兜底：取消按钮、X、ESC、点遮罩都会把 uploadOpen 置 false，
// 有未提交内容时问一次，用户选“否”就把弹窗拉回来（避免误关丢整张表）
watch(uploadOpen, (open, wasOpen) => {
  if (open || !wasOpen) return
  const dirty = inputMode.value === 'form' ? formDirty.value : uploadDirty.value
  if (!dirty) return
  if (window.confirm('弹窗里还有未提交的内容，确定关闭并丢弃吗？')) {
    closeUpload()
    return
  }
  uploadOpen.value = true
})


// 选项列（国家/客户性质）：交给 RevoGrid 内置的下拉选择框，
// 不再由页面接管——外层再挂一套可搜索下拉时中文输入不可用（已实测反馈）

// ── 在线表格录入（可编辑表格用 RevoGrid；列表用原生 UTable，弹窗只读预览用手写 table）──
const inputMode = ref('form')
const formGridRef = ref(null)
const formHistory = createQuotationPasteHistory()
const formUndoDepth = ref(0)
const formRedoDepth = ref(0)
const FORM_BLANK_ROWS = 12
const formData = reactive({
  customerName: '',
  endUser: '',
  country: '',
  city: '',
  customerStyle: '',
  rate: 6.7,
  quoteDate: '',
  deliveryTerms: 'EXW Dongguan',
  validity: '30days',
  paymentTerm: '',
  lines: [],
})

// 终端客户冲突实时检测（在线录入 & 导入 Excel 预览）：只警告、不拦截提交，普通业务员视角仅提示有其他业务员报过
const formEndUserConflict = reactive({ hasConflict: false, conflictCount: 0, matchedEndUsers: [] })
const uploadEndUserConflict = reactive({ hasConflict: false, conflictCount: 0, matchedEndUsers: [] })
let formEndUserConflictVersion = 0
let uploadEndUserConflictVersion = 0

function resetEndUserConflict(target) {
  target.hasConflict = false
  target.conflictCount = 0
  target.matchedEndUsers = []
}

async function queryEndUserConflict(endUser, target, getVersion) {
  const text = String(endUser || '').trim()
  const currentVersion = getVersion()
  if (!text) {
    resetEndUserConflict(target)
    return
  }
  try {
    const response = await checkQuotationEndUserConflict({
      endUser: text,
      ...(editingId.value ? { excludeId: editingId.value } : {}),
    })
    if (currentVersion !== getVersion()) return
    if (response?.code === 200 && response.data) {
      target.hasConflict = Boolean(response.data.hasConflict)
      target.conflictCount = Number(response.data.conflictCount || 0)
      target.matchedEndUsers = Array.isArray(response.data.matchedEndUsers) ? response.data.matchedEndUsers : []
    } else {
      resetEndUserConflict(target)
    }
  } catch {
    if (currentVersion === getVersion()) resetEndUserConflict(target)
  }
}

const debouncedCheckFormEndUser = useDebounceFn((value) => {
  formEndUserConflictVersion += 1
  const v = formEndUserConflictVersion
  void queryEndUserConflict(value, formEndUserConflict, () => formEndUserConflictVersion === v ? v : -1)
}, 300)

watch(() => formData.endUser, (value) => {
  const text = String(value || '').trim()
  if (!text) {
    formEndUserConflictVersion += 1
    resetEndUserConflict(formEndUserConflict)
    return
  }
  debouncedCheckFormEndUser(text)
})

watch(() => parsedData.value?.endUser, (value) => {
  uploadEndUserConflictVersion += 1
  const text = String(value || '').trim()
  if (!text) {
    resetEndUserConflict(uploadEndUserConflict)
    return
  }
  const v = uploadEndUserConflictVersion
  void queryEndUserConflict(text, uploadEndUserConflict, () => uploadEndUserConflictVersion === v ? v : -1)
})

// 整块粘贴与模板 A..P 同序；美元及系统成交价列只读，粘贴时跳过。
const formPasteColumns = [
  ...QUOTATION_GRID_PASTE_COLUMN_PROPS.map((key) => ({
    key,
    ...(key === 'originalPriceRmb' ? { price: true } : {}),
    ...(['usdKpcs', 'usdPc'].includes(key) ? { readonly: true } : {}),
  })),
  { key: 'displayPriceRmb', readonly: true },
  { key: 'displayPriceUsd', readonly: true },
]

// 空态判定：导入 Excel 但还没选文件/还没解析完 —— 只影响内容要不要居中，不影响弹窗尺寸
const uploadEmptyState = computed(() => inputMode.value === 'upload' && !parsedData.value && !uploadParsing.value)
const inputModeHint = computed(() => (inputMode.value === 'form'
  ? '直接在线填明细，也可以把 Excel 里的一片单元格整块粘进来'
  : '下载模板 → 在 Excel 里填好 → 上传，明细与下拉都按模板读出'))
const footerHint = computed(() => (inputMode.value === 'form'
  ? '美元两列按「人民币单价 ÷ 汇率」自动算；终端客户与应用为必填项'
  : '待审价格将在提交后由审核人核定'))
const formFilledLineCount = computed(() => formData.lines.filter(hasFormLineData).length)
const formZeroPriceCount = computed(() => formData.lines.filter((line) => hasFormLineData(line) && isZeroPrice(line.originalPriceRmb)).length)
// 报价日期是日期列（模板 B 列 / 库里 / 导出都是 YYYY-MM-DD）：填了却认不出是日期的行
// （典型：把序号或天数输进这一列）在工具条直接点名，不用等到提交才被服务端拦下
const formBadDateLines = computed(() => formData.lines
  .map((line, index) => ({ line, label: `第${index + 1}行` }))
  .filter(({ line }) => hasFormLineData(line)
    && String(line.quoteDate ?? '').trim() !== ''
    && !quotationDateIso(line.quoteDate)))
// 徽章 tooltip 里点名「第几行填了什么」，如「第1行「2」」
const formBadDateHint = computed(() => formBadDateLines.value
  .map(({ label, line }) => `${label}「${String(line.quoteDate ?? '').trim()}」`)
  .join('、'))
const formDirty = computed(() => formFilledLineCount.value > 0 || Boolean(String(formData.customerName || '').trim()) || Boolean(String(formData.endUser || '').trim()))
const uploadDirty = computed(() => Boolean(parsedData.value) || Boolean(selectedFile.value))
const canSaveDraft = computed(() => (inputMode.value === 'form' ? formDirty.value : Boolean(parsedData.value)))
const canSubmitNow = computed(() => canSaveDraft.value)
const formCanUndo = computed(() => formUndoDepth.value > 0)
const formCanRedo = computed(() => formRedoDepth.value > 0)

// 列表表格的页面级格式（Nuxt UI 原生 UTable 不再包一层封装，格式就在这页自定义）：
// table-fixed 让列宽按 th 百分比稳定分配；表头浅底小字与内容区隔；行内边距收紧
const listTableUi = {
  base: 'w-full min-w-[1080px] table-fixed',
  th: 'px-4 py-2.5 text-xs font-semibold text-muted bg-muted/40',
  td: 'px-4 py-2.5 align-middle overflow-hidden text-ellipsis text-sm',
  tr: 'cursor-pointer transition-colors hover:bg-elevated/40',
}
// 列表页列定义：列内容都走模板插槽（#<列id>-cell），双击整行走原生 UTable 的 @dblclick → handleListDblclick
// table-fixed 下列宽由表头 th 的百分比决定（合计 100%）
const listColumns = [
  { id: 'quoteNo', header: '报价单号 / 日期', meta: { class: { th: 'w-[21%]' } } },
  { id: 'customerName', header: '客户', meta: { class: { th: 'w-[21%]' } } },
  { id: 'salespersonName', header: '业务员', meta: { class: { th: 'w-[9%]' } } },
  { id: 'lineCount', header: '明细', meta: { class: { th: 'w-[7%]' } } },
  { id: 'status', header: '状态', meta: { class: { th: 'w-[9%]' } } },
  { id: 'updateTime', header: '最近更新', meta: { class: { th: 'w-[14%]' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-[19%] min-w-[190px]', td: 'overflow-visible px-3 whitespace-nowrap' } } },
]





// ── 在线录入：行数据与网格交互 ─────────────────────────────────────────────
function blankFormLine(index = 0) {
  // 单位不出现在模板里（模板已取消单位列），数量一律按 kpcs 计，服务端也会强制
  return {
    lineNo: index + 1,
    quoteDate: '',
    country: '',
    customerStyle: '',
    quoteTo: '',
    application: '',
    manufacturer: '',
    manufacturerMpn: '',
    qty: null,
    unit: DEFAULT_QUOTATION_UNIT,
    ctkMpn: '',
    materialCode: '',
    packageName: '',
    dieSize: '',
    spqReel: '',
    originalPriceRmb: null,
    rate: null,
    leadTime: '',
    datasheet: '',
    remark: '',
  }
}

function blankFormLines(count = FORM_BLANK_ROWS) {
  return Array.from({ length: count }, (_, index) => blankFormLine(index))
}

function hasFormLineData(line) {
  return Boolean(line && [
    line.quoteDate, line.country, line.customerStyle, line.quoteTo,
    line.application, line.manufacturer, line.manufacturerMpn, line.qty, line.ctkMpn, line.materialCode,
    line.packageName, line.dieSize, line.spqReel, line.originalPriceRmb, line.rate,
    line.leadTime, line.datasheet, line.remark,
  ].some((value) => value != null && String(value).trim() !== ''))
}

function cloneFormData() {
  return {
    customerName: formData.customerName,
    endUser: formData.endUser,
    country: formData.country,
    city: formData.city,
    customerStyle: formData.customerStyle,
    rate: formData.rate,
    quoteDate: formData.quoteDate,
    deliveryTerms: formData.deliveryTerms,
    validity: formData.validity,
    paymentTerm: formData.paymentTerm,
    lines: formData.lines.map((line) => ({ ...line })),
  }
}

function applyFormSnapshot(snapshot) {
  if (!snapshot) return
  formData.customerName = snapshot.customerName ?? formData.customerName
  formData.endUser = snapshot.endUser ?? formData.endUser
  formData.city = snapshot.city ?? formData.city
  formData.country = snapshot.country ?? formData.country
  formData.customerStyle = snapshot.customerStyle ?? formData.customerStyle
  formData.rate = snapshot.rate ?? formData.rate
  formData.quoteDate = snapshot.quoteDate ?? formData.quoteDate
  formData.deliveryTerms = snapshot.deliveryTerms ?? formData.deliveryTerms
  formData.validity = snapshot.validity ?? formData.validity
  formData.paymentTerm = snapshot.paymentTerm ?? formData.paymentTerm
  formData.lines = (snapshot.lines || []).map((line, index) => ({ ...blankFormLine(index), ...line }))
}

function resetFormData(source = {}) {
  formData.customerName = source.customerName || ''
  formData.endUser = source.endUser || ''
  formData.city = source.city || ''
  formData.country = source.country || ''
  formData.customerStyle = source.customerStyle || ''
  formData.rate = source.rate ?? 6.7
  formData.quoteDate = source.quoteDate || ''
  formData.deliveryTerms = source.deliveryTerms || 'EXW Dongguan'
  formData.validity = source.validity || '30days'
  formData.paymentTerm = source.paymentTerm || ''
  const lines = Array.isArray(source.lines) ? source.lines : []
  formData.lines = lines.length
    ? lines.map((line, index) => ({ ...blankFormLine(index), ...line }))
    : blankFormLines()
}

function resetFormHistory() {
  formHistory.clear()
  formUndoDepth.value = 0
  formRedoDepth.value = 0
}

function recordFormHistory(snapshot = cloneFormData()) {
  formHistory.record(snapshot)
  formUndoDepth.value += 1
  formRedoDepth.value = 0
}

function undoFormEdit() {
  const previous = formHistory.undo(cloneFormData())
  if (!previous) return
  formUndoDepth.value = Math.max(0, formUndoDepth.value - 1)
  formRedoDepth.value += 1
  applyFormSnapshot(previous)
}

function redoFormEdit() {
  const next = formHistory.redo(cloneFormData())
  if (!next) return
  formUndoDepth.value += 1
  formRedoDepth.value = Math.max(0, formRedoDepth.value - 1)
  applyFormSnapshot(next)
}

function handleFormGridUpdate(lines) {
  if (Array.isArray(lines)) formData.lines = lines
}

// 单元格编辑：把编辑前的明细记进历史栈，Ctrl+Z 才能退回上一个值
function handleFormGridEdit({ previousLines }) {
  if (!Array.isArray(previousLines)) return
  recordFormHistory({ ...cloneFormData(), lines: previousLines.map((line) => ({ ...line })) })
}

function handleFormGridHistory(action) {
  if (action === 'redo') redoFormEdit()
  else undoFormEdit()
}

function addFormLine() {
  recordFormHistory()
  formData.lines.push(blankFormLine(formData.lines.length))
  const at = formData.lines.length - 1
  nextTick(() => formGridRef.value?.focusCell?.({ row: at, column: 0 }))
}

// 在选中行上方插入一个空行（Excel 习惯）；未选中行时提示先选位置，不默默追加到末尾











async function insertFormLine() {
  const indexes = await formGridRef.value?.getSelectedRowIndexes?.()
  let at = indexes?.length ? Math.min(...indexes) : 0
  if (at < 0 || at > formData.lines.length) at = 0

  recordFormHistory()
  const nextLines = [...formData.lines]
  nextLines.splice(at, 0, blankFormLine(at))
  // 序号按行顺序重排 1..N：与服务端入库口径一致，也避免序号重复导致行身份错配
  formData.lines = nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }))
  await nextTick()
  formGridRef.value?.focusCell?.({ row: at, column: 0 })
  toast.add({ title: `已在第 ${at + 1} 行之前插入一行`, color: 'success' })
}

async function removeSelectedFormLines() {
  if (!formData.lines.length) {
    toast.add({ title: '明细表为空，无法删除', color: 'warning' })
    return
  }
  const indexes = await formGridRef.value?.getSelectedRowIndexes?.()
  let at = indexes?.length ? Math.min(...indexes) : 0
  if (at < 0 || at >= formData.lines.length) at = 0

  recordFormHistory()
  const nextLines = [...formData.lines]
  nextLines.splice(at, 1)

  formData.lines = nextLines.length
    ? nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }))
    : blankFormLines()

  const nextActive = Math.min(at, formData.lines.length - 1)
  await nextTick()
  if (nextActive >= 0) {
    formGridRef.value?.focusCell?.({ row: nextActive, column: 0 })
  }
  toast.add({ title: `已删除第 ${at + 1} 行`, color: 'success' })
}


function clearFormInput() {
  if (!formDirty.value) return
  if (!window.confirm('清空后当前在线录入的明细会全部丢失（可用撤销找回），确定清空？')) return
  recordFormHistory()
  resetFormData()
  toast.add({ title: '已清空明细', color: 'success' })
}

// 粘贴网格与提交归一化共用的数值解析：空值/占位符→null，非法数字→null（勿删，两处调用）
function normalizePasteValue(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function pasteNumber(value) {
  const raw = normalizePasteValue(value).replace(/,/g, '')
  if (!raw) return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

function normalizePasteHeader(value) {
  return normalizePasteValue(value).replace(/\s+/g, '').toLowerCase()
}

// 外贸模板表头词（含英文/历史写法）出现即视为表头行，粘贴时自动跳过
const PASTED_HEADER_WORDS = /^(?:s\/?n|序号|序列|报价日期|quotedate|国家|country|客户性质|style|客户|客户名称|终端客户|enduser|应用|application|applicaiton|友商|原厂|manufacturer|友商型号|mpn|数量|qty|单位|型号|ctk型号|ctkmpn|物料名称|materialname|物料编码|materialcode|itemcode|封装|package|芯片大小|芯片尺寸|diesize|spq\/?reel|spq|reel|单价|单价（元）|人民币单价|rmb|汇率|rate|美元|usd|千只单价|1只单价|交期|leadtime|l\/t|规格书|datasheet|备注|remark)$/iu

function isPastedGridHeaderRow(row) {
  return row.some((cell) => PASTED_HEADER_WORDS.test(normalizePasteHeader(cell)))
}

// 模板明细区 A..P 共 16 列 = 序号列 + 15 个数据列（兼容旧版 15 / 21 列）。
// 在网格里"千只单价（美元）/1只单价（美元）"是只读派生列，粘贴时跳过，值由「人民币单价 ÷ 汇率」算。
const FORM_TEMPLATE_PASTE_WIDTH = 16
const FORM_LEGACY_TEMPLATE_PASTE_WIDTH = 21

function normalizePastedGridRows(rows) {
  const dataRows = (rows || []).map((row) => [...row])
  while (dataRows.length && isPastedGridHeaderRow(dataRows[0])) dataRows.shift()
  while (dataRows.length && isPastedGridHeaderRow(dataRows[dataRows.length - 1])) dataRows.pop()
  if (!dataRows.length) throw new Error('请粘贴包含实际数据的 Excel 单元格区域')

  // 从模板整块复制时带 A 列序号，多这一列会让整块右移一位：
  // 判定条件是「宽度正好是模板的 16 列（或历史 15 / 21 列），且首列每格都是数字」
  const width = Math.max(...dataRows.map((row) => row.length), 0)
  const hasSequenceColumn = ([FORM_TEMPLATE_PASTE_WIDTH, 15, FORM_LEGACY_TEMPLATE_PASTE_WIDTH].includes(width)) && dataRows.every((row) => pasteNumber(row[0]) != null)
  return hasSequenceColumn ? dataRows.map((row) => row.slice(1)) : dataRows
}

function getClipboardText(event) {
  if (!event) return ''
  const clipboard = event.clipboardData
  const plainText = clipboard?.getData('text/plain') || ''
  if (plainText.trim()) return plainText

  const html = clipboard?.getData('text/html') || ''
  if (!html || typeof document === 'undefined') return ''
  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '').join('\t'))
    .filter(Boolean)
    .join('\n')
}

// 整块粘贴：从焦点所在单元格开始按模板列序填充，行不够就补空行
function handleFormPaste({ text: payloadText, clipboardEvent, startCell }) {
  const text = payloadText || getClipboardText(clipboardEvent)
  if (!String(text || '').trim()) return
  try {
    const rows = normalizePastedGridRows(parseQuotationPasteGrid(text))
    const startRow = Number(startCell?.row || 0)
    const startColumn = Number(startCell?.column || 0)
    const snapshot = cloneFormData()
    // 完整模板沿用模板映射；局部区域跟随当前可见列，避免封装后的单元格错位。
    const pasteColumns = startColumn === 0 && Math.max(...rows.map((row) => row.length)) >= 14
      ? formPasteColumns
      : QUOTATION_GRID_DISPLAY_COLUMN_PROPS.map((key) => formPasteColumns.find((column) => column.key === key))
    const nextLines = applyQuotationPasteGrid(formData.lines, rows, pasteColumns, startRow, startColumn, blankFormLine)
    recordFormHistory(snapshot)
    for (const line of nextLines) {
      if (line.ctkMpn && !line.packageName) {
        const target = String(line.ctkMpn).trim().toUpperCase()
        const matched = materialOptions.value.find((m) => {
          const val = String(m.ctkMpn || m.name || m.number || m.value || '').trim().toUpperCase()
          return val === target
        })
        if (matched?.packageName) {
          line.packageName = matched.packageName
        }
      }
    }
    formData.lines = nextLines.map((line, index) => ({ ...line, lineNo: index + 1 }))
    toast.add({ title: `已粘贴 ${rows.length} 行`, color: 'success' })
  } catch (error) {
    toast.add({ title: error?.message || '粘贴内容解析失败', description: '请确认复制的是 Excel 里的单元格区域', color: 'warning' })
  }
}







function triggerSelectFile() {
  fileInputRef.value?.click()
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (file) processExcelFile(file)
  if (event.target) event.target.value = ''
}

function handleDrop(event) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) processExcelFile(file)
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// 单价统一保留两位小数（人民币、美元同口径）：显示、保存、导出三处一致。
// 用 Math.round + EPSILON 而不是 toFixed，避开 0.615 → "0.61" 这类二进制表示误差。
function roundPrice2(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  return Math.round((num + Number.EPSILON) * 100) / 100
}

function cleanPrice(value) {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw || /^(?:waiting|\/|-|待定|null|undefined)$/i.test(raw)) return null
  const num = Number(raw.replace(/[￥¥$,]/g, '').trim())
  if (!Number.isFinite(num)) return null
  return roundPrice2(num)
}


/** 审核提交前的价格快照：统一两位小数再比较，避免 54 与 54.00 被判成"改动过" */
function normPrice(val) {
  if (val == null || val === '') return null
  const num = Number(val)
  return Number.isFinite(num) ? roundPrice2(num) : null
}

function normTerm(val) {
  return String(val ?? '').trim()
}

// 详情/审核明细只读展示：原样带出，不再补算任何价格列
function prefillReviewLines(lines = []) {
  return (lines || []).map((line) => ({ ...line }))
}

async function processExcelFile(file) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast.add({ title: '仅支持上传 .xlsx 格式的 Excel 文件', color: 'error' })
    return
  }
  selectedFile.value = file
  uploadParsing.value = true
  parseError.value = ''
  parsedData.value = null

  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('工作簿没有可读取的工作表')
    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })

    const norm = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase()
    const isDomesticHeader = (row) => {
      const cells = (row || []).map(norm)
      return cells.some((cell) => cell.includes('序号'))
        && cells.some((cell) => cell.includes('品名'))
        && cells.some((cell) => cell.includes('型号'))
        && cells.some((cell) => cell.includes('含税单价'))
    }
    if (matrix.some(isDomesticHeader)) throw new Error('检测到内贸报价单模板，请从“内贸销售报价单”页面上传')

    const headerRowIndex = 5
    if (sheetName !== '报价单' || !isCurrentQuotationTemplateHeader(matrix[headerRowIndex])) {
      throw new Error('该文件不是最新版外贸报价单模板，请下载最新模板后再上传')
    }
    const headers = [matrix[headerRowIndex]]

    // 列映射走共享规则（与 server/utils/quotation-parser 的入库解析同源），
    // 别再手写一套 else-if：顺序写反会把「终端客户」当成「客户」
    const colMap = detectQuotationColumnMapping(headers)

    // 当前模板第 4 行是三个独立条款栏，第 5 行是联系人与联系方式。
    const headCells = matrix.slice(0, 7).flat().map((cell) => String(cell ?? '').trim())
    const termsText = headCells.find((value) => /trading\s*terms/i.test(value) || /payment\s*terms?/i.test(value)) || ''
    const deliveryMatch = /trading\s*terms\s*:\s*([\s\S]*?)(?=\s*(?:quotation\s*valid|payment\s*terms?|contact|email|phone|whatsapp|wechat)\s*:|$)/i.exec(termsText)
    // 用 shared 里的同一份正则：导出写什么、这里就读什么
    const validMatch = new RegExp(QUOTATION_VALIDITY_PATTERN_SOURCE, 'i').exec(termsText)
    const paymentMatch = /payment\s*terms?\s*:\s*([\s\S]*?)(?=\s*(?:contact|email|phone|whatsapp|wechat)\s*:|quotation\s*valid\s*:|$)/i.exec(termsText)
    const contactMatch = /contact\s*:\s*([\s\S]*?)(?=\s*(?:email|phone|whatsapp|wechat)\s*:|$)/i.exec(termsText)
    let deliveryTerms = String(deliveryMatch?.[1] || '').trim()
    let validity = validMatch ? `${validMatch[1]}days` : ''
    let paymentTerm = String(paymentMatch?.[1] || '').trim()
    let contact = String(contactMatch?.[1] || '').split(/\r?\n/u, 1)[0].replace(/^[_\s]+|[_\s]+$/gu, '').trim()

    const nextHeaderValue = (row, column) => {
      for (let next = column + 1; next < Math.min(row.length, column + 7); next += 1) {
        const value = String(row[next] ?? '').trim()
        if (value) return value
      }
      return ''
    }
    for (let r = 0; r < Math.min(matrix.length, 8); r += 1) {
      const row = matrix[r] || []
      for (let c = 0; c < row.length; c += 1) {
        const val = String(row[c] ?? '').trim()
        const nVal = norm(val)
        if (!deliveryTerms && (nVal.includes('deliveryterms') || nVal.includes('tradingterms') || nVal.includes('贸易条款'))) deliveryTerms = nextHeaderValue(row, c)
        else if (!validity && /^\d+days?$/i.test(val)) validity = normalizeQuotationValidity(val)
        else if (!validity && (nVal.includes('quotationvalid') || nVal.includes('valid') || nVal.includes('有效期'))) validity = nextHeaderValue(row, c)
        else if (!paymentTerm && (nVal.includes('paymentterm') || nVal.includes('付款方式'))) {
          const inlinePayment = /payment\s*terms?\s*:\s*([\s\S]*)/i.exec(val)?.[1]?.trim() || ''
          paymentTerm = inlinePayment || nextHeaderValue(row, c)
        }
        else if (!paymentTerm && (nVal.includes('deposit') || nVal.includes('beforeship') || /^net\s*\d+/i.test(val))) paymentTerm = val.replace(/^payment\s*terms?\s*:\s*/i, '').trim()
        else if (!contact && (nVal.includes('contact') || nVal.includes('联系人') || nVal.includes('联系方式'))) {
          const matchCurrent = /contact\s*:\s*([\s\S]*?)(?=\s*(?:email|phone|whatsapp|wechat)\s*:|$)/i.exec(val)
          const currentContent = String(matchCurrent?.[1] || '').replace(/^[_\s]+|[_\s]+$/gu, '').trim()
          const contactBlock = currentContent ? val : nextHeaderValue(row, c)
          const match = /contact\s*:\s*([\s\S]*?)(?=\s*(?:email|phone|whatsapp|wechat)\s*:|$)/i.exec(contactBlock)
          contact = String(match?.[1] || contactBlock).replace(/^[_\s]+|[_\s]+$/gu, '').trim()
        }
      }
    }

    const readHeaderValue = (matches) => {
      for (let r = 0; r < Math.min(matrix.length, 7); r += 1) {
        const row = matrix[r] || []
        for (let c = 0; c < row.length; c += 1) {
          if (!matches(norm(row[c]))) continue
          if (/^(?:城市(?:\/city|city)?|city)[:：]?$/i.test(norm(row[c]))) return cleanQuotationText(row[c + 1])
          for (let next = c + 1; next < Math.min(row.length, c + 3); next += 1) {
            const value = cleanQuotationText(row[next])
            if (value) return value
          }
        }
      }
      return ''
    }
    const headerCustomer = readHeaderValue((value) => (value.includes('客户') || value.includes('quoteto')) && !value.includes('终端') && !value.includes('性质') && !value.includes('style'))
    const headerEndUser = readHeaderValue((value) => value.includes('终端客户') || value.includes('enduser'))
    const headerCountry = String(normalizeQuotationOptionValue(
      'country',
      readHeaderValue((value) => value.includes('国家') || value.includes('country')),
    ) ?? '')
    const headerCustomerStyle = readHeaderValue((value) => value.includes('性质') || value.includes('style'))
    const headerRateText = readHeaderValue((value) => (value.includes('汇率') || value === 'rate') && !value.includes('usd'))
    const headerQuoteDateText = readHeaderValue((value) => (value.includes('日期') || value === 'date') && !value.includes('交期') && !value.includes('leadtime'))
    const headerRate = normRate(headerRateText)
    const headerQuoteDate = excelDateText(headerQuoteDateText)

    // 当前模板只有第 6 行表头，明细从第 7 行开始。
    const dataStart = headerRowIndex + 1
    const rawLines = matrix.slice(dataStart).filter((r) => r && r.some((c) => c != null && String(c).trim() !== ''))
    const lines = rawLines.map((row, idx) => {
      const rmb = colMap.priceRmb >= 0 ? cleanPrice(row[colMap.priceRmb]) : null
      const rate = colMap.rate >= 0 ? normRate(row[colMap.rate]) : null
      return ({
        // 与服务端入库解析同口径：序号按行顺序 1..N，不用 Excel 的 S/N 列（可能重复/跳号）
        lineNo: idx + 1,
        quoteDate: colMap.quoteDate >= 0 ? excelDateText(row[colMap.quoteDate]) : null,
        country: colMap.country >= 0
          ? String(normalizeQuotationOptionValue('country', cleanQuotationText(row[colMap.country])) ?? '')
          : '',
        customerStyle: colMap.customerStyle >= 0 ? cleanQuotationText(row[colMap.customerStyle]) : '',
        quoteTo: cleanQuotationText(row[colMap.quoteTo]),
        endUser: '',
        application: cleanQuotationText(row[colMap.application]),
        manufacturer: cleanQuotationText(row[colMap.manufacturer]),
        manufacturerMpn: colMap.manufacturerMpn >= 0 ? cleanQuotationText(row[colMap.manufacturerMpn]) : '',
        qty: Number(String(row[colMap.qty] ?? '').replace(/,/g, '')) || null,
        unit: 'kpcs',
        ctkMpn: cleanQuotationText(row[colMap.ctkMpn]),
        materialCode: colMap.materialCode >= 0 ? cleanQuotationText(row[colMap.materialCode]) : '',
        packageName: cleanQuotationText(row[colMap.package]),
        dieSize: colMap.dieSize >= 0 ? cleanQuotationText(row[colMap.dieSize]) : '',
        spqReel: cleanQuotationText(row[colMap.spq]),
        originalPriceRmb: rmb,
        rate,
        // 交期在模板里是日期格式（07-Mar-01），cellDates 读出来是 Date，与服务端同口径按日期转
        leadTime: colMap.leadTime >= 0 ? (excelDateText(row[colMap.leadTime]) || '') : '',
        datasheet: cleanQuotationText(row[colMap.datasheet]),
        remark: colMap.remark >= 0 ? cleanQuotationText(row[colMap.remark]) : '',
      })
    }).filter((l) => [
      l.ctkMpn, l.materialCode, l.qty, l.application, l.manufacturer, l.manufacturerMpn,
      l.packageName, l.dieSize, l.spqReel, l.originalPriceRmb, l.leadTime, l.datasheet, l.remark,
    ].some((val) => val != null && String(val).trim() !== ''))

    if (!lines.length) throw new Error('未读取到有效的产品明细数据')

    parsedData.value = {
      customerName: headerCustomer,
      endUser: headerEndUser,
      country: headerCountry || lines.find((l) => l.country)?.country || '中国',
      city: readHeaderValue((value) => /^(?:城市(?:\/city|city)?|city)[:：]?$/i.test(value)),
      customerStyle: headerCustomerStyle || lines.find((l) => l.customerStyle)?.customerStyle || '终端',
      rate: headerRate ?? lines.find((l) => l.rate != null)?.rate ?? 6.7,
      quoteDate: headerQuoteDate || lines.find((l) => l.quoteDate)?.quoteDate || '',
      deliveryTerms: deliveryTerms || 'EXW Dongguan',
      validity: validity || '7days',
      paymentTerm,
      contact,
      lines,
    }
  } catch (err) {
    parseError.value = err?.message || '读取 Excel 数据异常，请检查文件格式'
  } finally {
    uploadParsing.value = false
  }
}

// 审核提醒由服务端在事务提交后发送：失败不影响单据状态，但必须让操作人看到并去手工通知
function hintNotifyResult(response) {
  const notify = response?.data?.notify
  if (notify?.status !== 'failed') return
  toast.add({
    title: '企微提醒发送失败',
    description: `${notify.message || '请手工通知审核人'}`,
    color: 'warning',
  })
}

async function submitUploadFile(action = 'submit') {
  if (!selectedFile.value) {
    toast.add({ title: '请先选择要上传的 Excel 文件', color: 'warning' })
    return
  }
  uploadSubmitting.value = true
  try {
    if (action === 'submit' && parsedData.value) {
      if (!String(parsedData.value?.endUser || '').trim()) {
        toast.add({ title: '请先在 Excel 模板单头填写终端客户', color: 'warning' })
        return
      }
      const missingAppIndex = (parsedData.value?.lines || []).findIndex((line) => !cleanQuotationText(line.application))
      if (missingAppIndex >= 0) {
        toast.add({ title: `第${missingAppIndex + 1}行必须填写应用`, color: 'warning' })
        return
      }
    }
    if (action === 'submit' && !await confirmQuotationLowPrices({ file: selectedFile.value, id: editingId.value || 0 })) return
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('action', action)
    formData.append('requestId', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    // 有 editingId = 用这份 Excel 覆盖已有草稿/已退回单据（服务端校验本人 + 状态）
    if (editingId.value) formData.append('id', String(editingId.value))

    const response = await uploadQuotation(formData)
    if (response?.code !== 200) throw new Error(response?.msg || '报价单上传失败')
    toast.add({
      title: action === 'save' ? '报价单草稿保存成功' : '报价单已提交初审',
      description: `单号：${response.data?.quoteNo || ''}`,
      color: 'success',
    })
    hintNotifyResult(response)
    closeUpload()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '报价单上传失败', color: 'error' })
  } finally {
    uploadSubmitting.value = false
  }
}

function normRate(val) {
  if (val == null || String(val).trim() === '') return null
  const num = Number(String(val).replace(/[￥¥$,\s]/g, ''))
  return Number.isFinite(num) && num > 0 ? Math.round((num + Number.EPSILON) * 10000) / 10000 : null
}

// Excel 读出来的日期列统一走 shared 的日期口径（quotationGrid.js）：Date / Excel 序列号 /
// 2026/9/18 / 2026.9.8 / 08-Sep-26 都归成 YYYY-MM-DD 再回落；认不出的（如交期填的 "30days"）原样保留。
function excelDateText(value) {
  if (value == null || String(value).trim() === '') return null
  return normalizeQuotationDate(value)
}

// 提交/保存的明细载荷：终端客户改为单头字段；美元价由服务端按「人民币 ÷ 汇率」算
function normalizeFormSubmitLines() {
  const headerQuoteDate = normalizeQuotationDate(formData.quoteDate)
  const headerCountry = cleanQuotationText(formData.country)
  const headerCustomerStyle = cleanQuotationText(formData.customerStyle)
  const headerCustomer = cleanQuotationText(formData.customerName)
  const headerRate = normRate(formData.rate) || 6.7

  return formData.lines
    .filter(hasFormLineData)
    .map((line, index) => ({
      lineNo: index + 1,
      // 报价日期落库口径固定 YYYY-MM-DD（服务端 dateOnly 只认这个；网格里手输的 2026/9/18 也在这里归一）
      quoteDate: normalizeQuotationDate(line.quoteDate) || headerQuoteDate,
      country: cleanQuotationText(line.country) || headerCountry,
      customerStyle: cleanQuotationText(line.customerStyle) || headerCustomerStyle,
      quoteTo: headerCustomer,
      application: cleanQuotationText(line.application),
      manufacturer: cleanQuotationText(line.manufacturer),
      manufacturerMpn: cleanQuotationText(line.manufacturerMpn),
      qty: pasteNumber(line.qty),
      unit: DEFAULT_QUOTATION_UNIT,
      ctkMpn: cleanQuotationText(line.ctkMpn),
      materialCode: cleanQuotationText(line.materialCode),
      packageName: cleanQuotationText(line.packageName),
      dieSize: cleanQuotationText(line.dieSize),
      spqReel: cleanQuotationText(line.spqReel),
      originalPriceRmb: cleanPrice(line.originalPriceRmb),
      rate: normRate(line.rate) || headerRate,
      // 交期日期回落成 ISO 再提交（网格里显示的是 Excel 的 dd-mmm-yy）
      leadTime: normalizeQuotationLeadTime(cleanQuotationText(line.leadTime)),
      datasheet: cleanQuotationText(line.datasheet),
      remark: cleanQuotationText(line.remark),
    }))
}

// 提交前本地校验：规则与服务端 normalizeFormPayload 对齐，
// 让用户立刻看到「客户不能为空」这类真实原因，而不是等服务端拒绝后只收到一句「网络连接异常」
function validateFormSubmit() {
  if (!String(formData.customerName || '').trim()) return '请先填写客户名称'
  if (!String(formData.endUser || '').trim()) return '请先填写终端客户'
  const rateNum = Number(formData.rate)
  if (!Number.isFinite(rateNum) || rateNum <= 0) return '请在表头填写有效的基准汇率（大于0）'
  if (!formFilledLineCount.value) return '至少填写一行报价明细'

  const violations = quotationOptionViolations([
    { country: formData.country, customerStyle: formData.customerStyle, unit: DEFAULT_QUOTATION_UNIT, rowLabel: '表头' },
    ...formData.lines
      .map((line, index) => ({ line, rowLabel: `第${index + 1}行` }))
      .filter(({ line }) => hasFormLineData(line))
      .map(({ line, rowLabel }) => ({ country: line.country, customerStyle: line.customerStyle, unit: DEFAULT_QUOTATION_UNIT, rowLabel }))
  ])
  if (violations.length) return formatQuotationOptionViolations(violations)

  if (formData.quoteDate && !quotationDateIso(formData.quoteDate)) {
    return `表头报价日期不是日期格式（当前「${String(formData.quoteDate).trim()}」），请按 YYYY-MM-DD 填`
  }

  const badDate = formBadDateLines.value[0]
  if (badDate) return `${badDate.label}报价日期不是日期格式（当前「${String(badDate.line.quoteDate ?? '').trim()}」），请按 YYYY-MM-DD 填`

  for (let index = 0; index < formData.lines.length; index += 1) {
    const line = formData.lines[index]
    if (!hasFormLineData(line)) continue
    const label = `第${index + 1}行`
    if (!cleanQuotationText(line.application)) return `${label}必须填写应用`
  }
  return ''
}

async function submitFormQuotation(action = 'submit') {
  const lines = normalizeFormSubmitLines()
  if (action === 'submit') {
    const invalidMessage = validateFormSubmit()
    if (invalidMessage) {
      toast.add({ title: invalidMessage, color: 'warning' })
      return
    }
  } else if (!lines.length) {
    toast.add({ title: '至少填写一行报价明细', color: 'warning' })
    return
  }
  uploadSubmitting.value = true
  try {
    if (action === 'submit' && !await confirmQuotationLowPrices({ customerName: formData.customerName, lines, id: editingId.value || 0 })) return
    const payload = {
      action,
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      customerName: String(formData.customerName || '').trim(),
      endUser: String(formData.endUser || '').trim(),
      country: String(formData.country || '').trim(),
      city: String(formData.city || '').trim(),
      customerStyle: String(formData.customerStyle || '').trim(),
      rate: Number(formData.rate) || 6.7,
      quoteDate: formData.quoteDate ? String(formData.quoteDate).trim() : undefined,
      deliveryTerms: String(formData.deliveryTerms || '').trim(),
      validity: String(formData.validity || '').trim(),
      paymentTerm: String(formData.paymentTerm || '').trim(),
      lines,
    }
    // 有 editingId 说明在改草稿/已退回单（服务端限制：本人 + DRAFT/RETURNED）
    const response = editingId.value
      ? await updateQuotation(editingId.value, payload)
      : await createQuotation(payload)
    if (response?.code !== 200) throw new Error(response?.msg || '报价单保存失败')
    toast.add({
      title: action === 'save' ? '报价单草稿保存成功' : '报价单已提交初审',
      description: `单号：${response.data?.quoteNo || editingQuoteNo.value || ''}`,
      color: 'success',
    })
    hintNotifyResult(response)
    closeUpload()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '报价单保存失败', color: 'error' })
  } finally {
    uploadSubmitting.value = false
  }
}

// 底部按钮按当前录入方式分发：在线录入走 JSON，导入 Excel 走文件上传
function submitCurrent(action = 'submit') {
  if (inputMode.value === 'form') return submitFormQuotation(action)
  return submitUploadFile(action)
}

// 有未提交的内容就别让误点关闭/ESC 把整张表丢掉（真正的确认在 uploadOpen 的 watcher 里）
function requestCloseUpload() {
  uploadOpen.value = false
}


// 详情弹窗与审核
async function openRecord(row) {
  detailLoading.value = true
  detailOpen.value = true
  detailSearch.value = ''
  reviewStage.value = ''
  reviewComment.value = ''
  reviewCommentError.value = ''
  pendingReviewAction.value = ''
  revisionOpen.value = false
  // 每次打开都回到「摘要 + 收起」：上次展开的条款不该带到下一张单
  phoneInfoOpen.value = false
  phoneSearchOpen.value = false
  detailHistory.clear()
  try {
    const response = await getQuotation(row.id)
    if (response?.code !== 200) throw new Error(response?.msg || '报价单详情加载失败')
    const firstLine = (response.data?.lines || [])[0] || {}
    detail.value = {
      ...response.data,
      country: response.data?.country || firstLine.country || '',
      city: response.data?.city || '',
      customerStyle: response.data?.customerStyle || firstLine.customerStyle || '',
      quoteDate: response.data?.quoteDate || firstLine.quoteDate || '',
      rate: response.data?.rate ?? firstLine.rate ?? null,
    }
    syncEditableTerms(response.data)
    editableLines.value = prefillReviewLines(response.data?.lines)
    snapshotReviewState()
  } catch (error) {
    toast.add({ title: error?.message || '报价单详情加载失败', color: 'error' })
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailOpen.value = false
  detail.value = null
  editableLines.value = []
  syncEditableTerms(null)
  detailSearch.value = ''
  reviewStage.value = ''
  reviewCommentError.value = ''
  pendingReviewAction.value = ''
  revisionOpen.value = false
  phoneInfoOpen.value = false
  phoneSearchOpen.value = false
  detailHistory.clear()
  detailSnapshot.value = null
}

// 进入审核态：审核人只读明细与条款，填意见后选「通过」或「退回业务员」
function startReview() {
  reviewStage.value = detail.value?.canFinalReview ? 'final' : detail.value?.canSecondReview ? 'second' : 'initial'
  reviewAction.value = 'approve'
  reviewComment.value = ''
  reviewCommentError.value = ''
  pendingReviewAction.value = ''
  detailHistory.clear()
  editableLines.value = editableLines.value.map((line) => ({
    ...line,
    reviewPriceRmb: line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb,
  }))
}

function cancelReview() {
  reviewStage.value = ''
  reviewCommentError.value = ''
  pendingReviewAction.value = ''
  detailHistory.clear()
  if (detail.value) {
    syncEditableTerms(detail.value)
    editableLines.value = prefillReviewLines(detail.value.lines)
  }
}

// 审核提交时只发送发生变化的行价格。
async function submitReview(action = 'approve') {
  if (!detail.value || !reviewStage.value) return
  reviewAction.value = action
  if (action === 'return' && !reviewComment.value.trim()) {
    // 不再只弹一个 toast：错误贴在输入框下面，并把输入框聚焦 + 滚进可视区（手机键盘遮挡）
    reviewCommentError.value = '退回必须填写审核原因，业务员要照着改'
    nextTick(focusReviewComment)
    return
  }
  reviewCommentError.value = ''
  const priceChanges = action === 'approve' ? editableLines.value.flatMap((line) => {
    const previous = line.finalPriceRmb ?? line.initialPriceRmb ?? line.originalPriceRmb
    return normPrice(line.reviewPriceRmb) === normPrice(previous) ? [] : [{ id: line.id, priceRmb: line.reviewPriceRmb }]
  }) : []
  if (priceChanges.some((change) => cleanPrice(change.priceRmb) == null || cleanPrice(change.priceRmb) <= 0)) {
    toast.add({ title: '修改后的人民币单价必须大于0', color: 'warning' })
    return
  }
  pendingReviewAction.value = ''
  reviewing.value = true
  try {
    if (action === 'approve' && !await confirmQuotationLowPrices({ id: detail.value.id, lines: editableLines.value })) return
    const response = await reviewQuotation({
      id: detail.value.id,
      stage: reviewStage.value,
      action,
      comment: reviewComment.value,
      priceChanges,
      requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    })
    if (response?.code !== 200) throw new Error(response?.msg || '审核提交失败')
    toast.add({
      title: action === 'return' ? '已退回业务员' : '审核已通过',
      description: `${detail.value.quoteNo || ''}${action === 'return' ? '（业务员重新提交后会从初审重跑）' : ''}`,
      color: 'success',
    })
    hintNotifyResult(response)
    closeDetail()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '审核提交失败', color: 'error' })
  } finally {
    reviewing.value = false
  }
}

const draftSubmitting = ref(false)

async function handleSubmitDraft(record) {
  if (!record?.id) return
  draftSubmitting.value = true
  try {
    if (!await confirmQuotationLowPrices({ id: record.id })) return
    const response = await submitQuotation(record.id)
    if (response?.code !== 200) throw new Error(response?.msg || '提交初审失败')
    toast.add({
      title: String(record?.status) === 'RETURNED' ? '已重新提交，将从初审重跑' : '报价单已成功提交初审',
      description: `单号：${record.quoteNo || ''}`,
      color: 'success',
    })
    hintNotifyResult(response)
    if (detailOpen.value) closeDetail()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '提交初审失败', color: 'error' })
  } finally {
    draftSubmitting.value = false
  }
}

async function handleDeleteDraft(record) {
  if (!record?.id) return
  if (!window.confirm(`确定要删除草稿报价单【${record.quoteNo}】吗？`)) return
  draftSubmitting.value = true
  try {
    const response = await deleteQuotation(record.id)
    if (response?.code !== 200) throw new Error(response?.msg || '删除草稿失败')
    toast.add({ title: '报价单草稿已删除', color: 'success' })
    if (detailOpen.value) closeDetail()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '删除草稿失败', color: 'error' })
  } finally {
    draftSubmitting.value = false
  }
}

function canWithdrawRow(row) {
  if (!row?.id) return false
  if (row.canWithdraw !== undefined) return Boolean(row.canWithdraw)
  // user store 的字段是 id（见 app/store/modules/user.js），没有 userId
  const currentUserId = Number(userStore.id)
  const isOwner = Number(row.salespersonId) === currentUserId
  const isAdmin = currentUserId === 1 || userStore.roles?.includes('admin')
  return (isOwner || isAdmin) && String(row.status) === 'PENDING_INITIAL' && canUpload.value
}

async function handleWithdraw(record) {
  if (!record?.id) return
  if (!window.confirm(`确定要撤回待初审报价单【${record.quoteNo}】为草稿吗？\n撤回后可重新修改明细或直接删除。`)) return
  draftSubmitting.value = true
  try {
    const response = await withdrawQuotation(record.id)
    if (response?.code !== 200) throw new Error(response?.msg || '撤回报价单失败')
    toast.add({ title: '报价单已成功撤回为草稿', description: `单号：${record.quoteNo || ''}`, color: 'success' })
    if (detailOpen.value) closeDetail()
    loadList()
  } catch (error) {
    toast.add({ title: error?.message || '撤回报价单失败', color: 'error' })
  } finally {
    draftSubmitting.value = false
  }
}

function download(id) {
  window.open(getQuotationDownloadUrl(id), '_blank')
}

function canDownloadRow(row) {
  return String(row.status) === 'APPROVED' && canDownload.value
}

function statusColor(status) {
  const map = {
    DRAFT: 'neutral',
    PENDING_INITIAL: 'warning',
    PENDING_SECOND: 'info',
    PENDING_FINAL: 'primary',
    RETURNED: 'error',
    APPROVED: 'success',
  }
  return map[status] || 'neutral'
}

function formatPrice(val, prefix = '') {
  if (val == null || val === '') return '-'
  const num = Number(val)
  return Number.isFinite(num) ? `${prefix}${num.toFixed(2)}` : String(val)
}


function switchTab(tab) {
  if (tab === 'list' && activeTab.value !== 'list') {
    void loadList({ silent: true })
  }
  activeTab.value = tab
}

function hasPendingQuotations() {
  return rows.value.some((row) => String(row.status || '').startsWith('PENDING_'))
}

function canAutoRefresh() {
  return activeTab.value === 'list' && !uploadOpen.value && !detailOpen.value
}

useTkAutoRefresh({
  onRefresh: () => loadList({ silent: true }),
  enabled: canAutoRefresh,
  pollWhen: hasPendingQuotations,
  intervalMs: 30_000,
  cooldownMs: 15_000,
})

watch(detailOpen, (open, wasOpen) => {
  if (!open && wasOpen && activeTab.value === 'list' && !uploadOpen.value) {
    void loadList({ silent: true })
  }
})

onMounted(() => {
  loadList()
})

</script>
