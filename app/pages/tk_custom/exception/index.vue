<template>
  <div
    class="app-container exception-page absolute top-0 left-0 right-0 bottom-0 flex flex-col overflow-hidden"
  >
    <TkSearchPanel
      ref="queryPanelRef"
      :state="queryParams"
      :show-search="showSearch"
      panel-class="exception-search"
      @keydown.enter="handleQuery"
    >
      <div
        class="exception-search-grid w-full"
      >
        <UInput
          v-model="queryParams.planNo"
          size="sm"
          placeholder="输入流程卡号"
          clearable
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.reportNo"
          size="sm"
          placeholder="输入报告编号"
          clearable
          @keyup.enter="handleQuery"
        />
        <UPopover v-model:open="dateRangeArrayOpen" :content="{ align: 'center' }">
                <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full min-w-0 justify-start font-normal" :title="rangeDisplayText(dateRangeArray) || '选择日期范围'">
                  <span class="min-w-0 truncate whitespace-nowrap text-xs tabular-nums" :class="dateRangeArray?.length === 2 ? '' : 'text-dimmed'">{{ rangeDisplayText(dateRangeArray) || '选择日期范围' }}</span>
                </UButton>
                <template #content>
                  <div class="flex items-stretch divide-x divide-default">
                    <div class="hidden sm:flex flex-col justify-center py-2">
                      <UButton
                        v-for="p in DATE_RANGE_PRESETS"
                        :key="p.label"
                        :label="p.label"
                        color="neutral"
                        variant="ghost"
                        class="rounded-none px-4"
                        :class="isPresetSelected(dateRangeArray, p, 'date') ? 'bg-elevated' : 'hover:bg-elevated/50'"
                        truncate
                        @click="applydateRangeArrayPreset(p)"
                      />
                      <UButton
                        v-if="dateRangeArray?.length"
                        label="清除"
                        color="neutral"
                        variant="ghost"
                        class="rounded-none px-4 text-error hover:bg-elevated/50"
                        truncate
                        @click="cleardateRangeArray"
                      />
                    </div>
                    <UCalendar
                      :default-value="rangeArrayToCalendar(dateRangeArray)"
                      range
                      :number-of-months="calendarMonths"
                      locale="zh-CN"
                      class="p-2"
                      @update:model-value="ondateRangeArrayPick"
                    />
                  </div>
                </template>
              </UPopover>
        <UInput
          v-model="queryParams.productName"
          size="sm"
          placeholder="输入物料名称"
          clearable
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.productSpec"
          size="sm"
          placeholder="输入封装"
          clearable
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.finderName"
          size="sm"
          placeholder="输入发现人"
          clearable
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.machineNo"
          size="sm"
          placeholder="输入发生机台"
          clearable
          @keyup.enter="handleQuery"
        />
        <USelect
          v-model="queryParams.shiftName"
          size="sm"
          :items="tk_exception_shift"
          placeholder="选择班别"
          clearable
        />
        <USelect
          v-model="queryParams.generateProcessName"
          size="sm"
          :items="exceptionProcessOptions"
          placeholder="选择产生工序"
          clearable
        />
        <USelect
          v-model="queryParams.processName"
          size="sm"
          :items="exceptionProcessOptions"
          placeholder="选择发现工序"
          clearable
        />
        <USelect
          v-model="queryParams.defectCategory"
          size="sm"
          :items="exceptionCategoryOptions"
          placeholder="选择类别"
          clearable
        />
        <USelect
          v-model="queryParams.status"
          size="sm"
          :items="tk_exception_status"
          placeholder="选择状态"
          clearable
        />
        <UInput
          v-model="queryParams.defectItem"
          size="sm"
          placeholder="输入不良项目"
          clearable
          @keyup.enter="handleQuery"
        />
        <div class="exception-search-actions flex items-center justify-end gap-2">
          <UButton size="sm" color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery">重置</UButton>
        </div>
      </div>
    </TkSearchPanel>

    <TkToolbar>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="primary"
          variant="solid"
          size="sm"
          icon="i-lucide-plus"
          class="shadow-sm font-semibold"
          @click="handleAdd"
          v-if="!isRecycleBin"
          >新增</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-square-pen"
          class="disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="single"
          @click="() => handleUpdate()"
          v-if="!isRecycleBin"
          >修改</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-trash-2"
          class="disabled:opacity-40 disabled:cursor-not-allowed hover:text-red-500 hover:border-red-500/50"
          :disabled="multiple"
          @click="() => handleDelete()"
          v-if="!isRecycleBin"
          >删除</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          class="disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="multiple"
          @click="() => handleRestore()"
          v-if="isRecycleBin"
          >恢复</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-download"
          class="disabled:opacity-40 disabled:cursor-not-allowed"
          @click="handleExport"
          v-if="!isRecycleBin"
          >导出</UButton
        >
      </div>
      <template #trailing>
        <UTooltip :text="isRecycleBin ? '返回列表' : '回收站'" placement="top">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :icon="
              isRecycleBin
                ? 'i-lucide-arrow-left'
                : 'i-lucide-archive'
            "
            @click="toggleRecycleBin"
          >
            {{ isRecycleBin ? "返回" : "回收站" }}
          </UButton>
        </UTooltip>
      </template>
    </TkToolbar>

    <div
      class="bg-[var(--app-surface)] rounded-xl shadow-sm border border-[var(--app-border)] overflow-y-auto flex-1 min-h-0 flex flex-col"
    >
      <TkUTable
        ref="tkDataTableRef"
        v-model:row-selection="selectedRows"
        :loading="loading"
        :data="exceptionList"
        :columns="exceptionColumns"
        :sticky="true"
        :interactive="!isRecycleBin"
        @row-open="handleUpdate"
        class="flex-1"
      >
        <template #generateProcessName-cell="{ row }">
          <dict-tag
            :options="exceptionProcessOptions"
            :value="row.original.generateProcessName"
          />
        </template>
        <template #processName-cell="{ row }">
          <dict-tag
            :options="exceptionProcessOptions"
            :value="row.original.processName"
          />
        </template>
        <template #batchDefectTotal-cell="{ row }">
          <span class="font-mono text-gray-900 dark:text-gray-100"
            >{{ row.original.batchDefectTotal }}
            {{ row.original.batchUnit || "PCS" }}</span
          >
        </template>
        <template #sampleQty-cell="{ row }">
          <span class="font-mono text-gray-900 dark:text-gray-100"
            >{{ row.original.sampleQty }}
            {{ row.original.sampleUnit || "PCS" }}</span
          >
        </template>
        <template #defectQty-cell="{ row }">
          <span class="font-mono text-gray-900 dark:text-gray-100"
            >{{ row.original.defectQty }}
            {{ row.original.defectUnit || "PCS" }}</span
          >
        </template>
        <template #defectRate-cell="{ row }">
          <span
            class="font-mono font-semibold text-primary-600 dark:text-primary-400"
            >{{ formatDecimalRate(row.original.defectRate) }}</span
          >
        </template>
        <template #defectImages-cell="{ row }">
          <div
            v-if="row.original.defectImages"
            class="flex items-center gap-1 min-w-0 max-w-[148px]"
          >
            <div
              v-for="(img, idx) in imagePreview(row.original.defectImages).preview"
              :key="`${img}-${idx}`"
              class="w-10 h-10 shrink-0 border border-[var(--app-border)] rounded-md overflow-hidden bg-[var(--app-bg)] shadow-sm cursor-zoom-in hover:ring-2 hover:ring-primary-400/50 transition-[box-shadow,ring] duration-150"
              @click.stop="
                showLightbox(imagePreview(row.original.defectImages).all, idx)
              "
            >
              <img
                :src="getRealSrc(img)"
                class="w-full h-full object-cover block"
                loading="lazy"
              />
            </div>
            <UBadge
              v-if="imagePreview(row.original.defectImages).more > 0"
              color="neutral"
              variant="soft"
              size="xs"
              class="shrink-0"
            >
              +{{ imagePreview(row.original.defectImages).more }}
            </UBadge>
          </div>
          <span v-else class="text-[var(--app-page-text-muted)]">-</span>
        </template>
        <template #reportImages-cell="{ row }">
          <div
            v-if="row.original.reportImages"
            class="flex items-center gap-1 min-w-0 max-w-[148px]"
          >
            <div
              v-for="(img, idx) in imagePreview(row.original.reportImages).preview"
              :key="`${img}-${idx}`"
              class="w-10 h-10 shrink-0 border border-[var(--app-border)] rounded-md overflow-hidden bg-[var(--app-bg)] shadow-sm cursor-zoom-in hover:ring-2 hover:ring-primary-400/50 transition-[box-shadow,ring] duration-150"
              @click.stop="
                showLightbox(imagePreview(row.original.reportImages).all, idx)
              "
            >
              <img
                :src="getRealSrc(img)"
                class="w-full h-full object-cover block"
                loading="lazy"
              />
            </div>
            <UBadge
              v-if="imagePreview(row.original.reportImages).more > 0"
              color="neutral"
              variant="soft"
              size="xs"
              class="shrink-0"
            >
              +{{ imagePreview(row.original.reportImages).more }}
            </UBadge>
          </div>
          <span v-else class="text-[var(--app-page-text-muted)]">-</span>
        </template>
        <template #defectDesc-cell="{ row }">
          <UTooltip
            v-if="row.original.defectDesc"
            :text="row.original.defectDesc"
            :ui="{
              content: 'max-w-[320px] !h-auto !py-1.5',
              text: '!whitespace-normal !break-all !overflow-visible !h-auto'
            }"
          >
            <div
              class="line-clamp-2 text-left min-w-[180px] max-w-[280px] whitespace-normal break-all cursor-help"
            >
              {{ row.original.defectDesc }}
            </div>
          </UTooltip>
          <span v-else>-</span>
        </template>
        <template #reasonAnalysis-cell="{ row }">
          <UTooltip
            v-if="row.original.reasonAnalysis"
            :text="row.original.reasonAnalysis"
            :ui="{
              content: 'max-w-[320px] !h-auto !py-1.5',
              text: '!whitespace-normal !break-all !overflow-visible !h-auto'
            }"
          >
            <div
              class="line-clamp-2 text-left min-w-[180px] max-w-[280px] whitespace-normal break-all cursor-help"
            >
              {{ row.original.reasonAnalysis }}
            </div>
          </UTooltip>
          <span v-else>-</span>
        </template>
        <template #causeAnalysis-cell="{ row }">
          <UTooltip
            v-if="row.original.causeAnalysis"
            :text="row.original.causeAnalysis"
            :ui="{
              content: 'max-w-[320px] !h-auto !py-1.5',
              text: '!whitespace-normal !break-all !overflow-visible !h-auto'
            }"
          >
            <div
              class="line-clamp-2 text-left min-w-[180px] max-w-[280px] whitespace-normal break-all cursor-help"
            >
              {{ row.original.causeAnalysis }}
            </div>
          </UTooltip>
          <span v-else>-</span>
        </template>
        <template #defectCategory-cell="{ row }">
          <UBadge
            v-if="row.original.defectCategory"
            :color="categoryBadgeColor(row.original.defectCategory)"
            variant="subtle"
            class="px-2 py-0.5 rounded-md font-medium text-xs shadow-none border-none"
          >
            {{ getCategoryLabel(row.original.defectCategory) }}
          </UBadge>
          <span v-else>-</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            v-if="row.original.status != null"
            :color="statusBadgeColor(row.original.status)"
            variant="subtle"
            class="px-2 py-0.5 rounded-md font-medium text-xs shadow-none border-none"
          >
            {{ getStatusLabel(row.original.status) }}
          </UBadge>
          <span v-else>-</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-slot="{}"
            v-if="!isRecycleBin"
            variant="link"
            color="primary"
            size="xs"
            @click.stop="handleUpdate(row.original)"
            >修改</UButton
          >
          <UButton
            v-slot="{}"
            v-if="!isRecycleBin"
            variant="link"
            color="primary"
            size="xs"
            @click.stop="handleDelete(row.original)"
            >删除</UButton
          >
          <UButton
            v-slot="{}"
            v-if="isRecycleBin"
            variant="link"
            color="primary"
            size="xs"
            @click.stop="handleRestore(row.original)"
            >恢复</UButton
          >
        </template>
      </TkUTable>
    </div>

    <div>
      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </div>

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-6xl' }">
      <template #body>
        <UForm
          ref="exceptionRef"
          :state="form"
          :rules="rules"
          label-position="top"
          scroll-to-error
          class="premium-form relative min-h-[400px]"
        >
          <div
            v-if="formLoading"
            class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-[2px] rounded-xl transition-all duration-300"
          >
            <UIcon
              name="i-lucide-refresh-cw"
              class="w-8 h-8 text-primary animate-spin"
            />
            <span
              class="mt-2.5 text-xs font-medium text-gray-500 dark:text-gray-400"
              >正在加载数据...</span
            >
          </div>

          <!-- 双栏布局容器 -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            
            <!-- 左侧一栏 -->
            <div class="flex flex-col gap-4">
              <!-- 基本信息 -->
              <div
                class="p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl shadow-sm hover:shadow transition-all duration-300"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-dashed border-[var(--app-border)]"
                >
                  <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span class="text-sm font-semibold text-[var(--app-text)]"
                    >基本信息</span
                  >
                  <span class="text-xs text-[var(--app-page-text-muted)] ml-1.5"
                    >异常报告的核心流转记录</span
                  >
                </div>
                <div class="section-body">
                  <div class="grid grid-cols-12 gap-4">
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField label="报告编号" prop="reportNo">
                        <UInput
                          v-model="form.reportNo"
                          :disabled="!form.id"
                          :placeholder="form.id ? '请输入报告编号' : '自动生成'"
                          clearable
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField label="流程卡号" prop="planNo">
                        <UInput
                          v-model="form.planNo"
                          placeholder="输入后自动获取；假片可选手动封装"
                          @blur="handlePlanNoBlur"
                          clearable
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField label="发生日期" prop="occurDate">
                        <UPopover class="w-full">
                          <UButton
                            color="neutral"
                            variant="outline"
                            icon="i-lucide-calendar"
                            class="w-full justify-start text-left font-mono relative pr-8"
                          >
                            {{ form.occurDate ? form.occurDate : "选择发生日期" }}
                            <UIcon
                              v-if="form.occurDate"
                              name="i-lucide-x"
                              class="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer z-10"
                              @click.stop="form.occurDate = null"
                            />
                          </UButton>
                          <template #content>
                            <UCalendar
                              v-model="formOccurDateValue"
                              locale="zh-CN"
                              class="p-2"
                            />
                          </template>
                        </UPopover>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-3">
                      <UFormField label="发现工序" prop="processName">
                        <USelect
                          v-model="form.processName"
                          :items="exceptionProcessOptions"
                          placeholder="请选择发现工序"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-3">
                      <UFormField label="班别" prop="shiftName">
                        <USelect
                          v-model="form.shiftName"
                          :items="tk_exception_shift"
                          placeholder="请选择班别"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-3">
                      <UFormField label="发现人" prop="finderName">
                        <UInput
                          v-model="form.finderName"
                          placeholder="发现人"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-3">
                      <UFormField label="发生机台" prop="machineNo">
                        <UInput
                          v-model="form.machineNo"
                          placeholder="发生机台"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 品名与订单资料 -->
              <div
                class="p-5 bg-gradient-to-br from-[var(--app-surface)] to-[var(--app-page-hover)] border border-[var(--app-border)] border-l-4 border-l-emerald-500 rounded-xl shadow-sm"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-dashed border-[var(--app-border)]"
                >
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span class="text-sm font-semibold text-[var(--app-text)]"
                    >品名与订单资料</span
                  >
                  <span class="text-xs text-[var(--app-page-text-muted)] ml-1.5">{{
                    isDummyPlan
                      ? "假片模式：封装请手动选择"
                      : "来自金蝶 K3 Cloud 系统的自动拉取"
                  }}</span>
                </div>
                <div class="section-body">
                  <div class="grid grid-cols-3 gap-3">
                    <div
                      class="col-span-2 flex flex-col gap-1 p-2.5 px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg"
                    >
                      <span
                        class="text-[11px] text-[var(--app-page-text-muted)] font-medium uppercase tracking-wider"
                        >物料名称</span
                      >
                      <span
                        class="text-[13px] font-semibold truncate text-teal-700 dark:text-teal-400"
                        >{{
                          form.productName ||
                          (isDummyPlan
                            ? "假片"
                            : "请先填写流程卡号自动带出")
                        }}</span
                      >
                    </div>
                    <div
                      class="flex flex-col gap-1 p-2.5 px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg"
                      :class="isDummyPlan ? 'ring-1 ring-amber-400/60' : ''"
                    >
                      <span
                        class="text-[11px] text-[var(--app-page-text-muted)] font-medium uppercase tracking-wider"
                        >封装规格</span
                      >
                      <USelect
                        v-if="isDummyPlan"
                        v-model="form.productSpec"
                        :items="dummyPackageOptions"
                        placeholder="请选择封装"
                        class="w-full"
                      />
                      <span
                        v-else
                        class="text-[13px] text-[var(--app-text)] font-semibold truncate font-mono"
                        >{{ form.productSpec || "自动带出" }}</span
                      >
                    </div>
                    <div
                      class="flex flex-col gap-1 p-2.5 px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg"
                    >
                      <span
                        class="text-[11px] text-[var(--app-page-text-muted)] font-medium uppercase tracking-wider"
                        >生产订单</span
                      >
                      <span
                        class="text-[13px] text-[var(--app-text)] font-semibold truncate font-mono"
                        >{{ form.moNumber || "自动带出" }}</span
                      >
                    </div>
                    <div
                      class="flex flex-col gap-1 p-2.5 px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg"
                    >
                      <span
                        class="text-[11px] text-[var(--app-page-text-muted)] font-medium uppercase tracking-wider"
                        >芯片代码</span
                      >
                      <span
                        class="text-[13px] text-[var(--app-text)] font-semibold truncate font-mono"
                        >{{ form.chipCode || "自动带出" }}</span
                      >
                    </div>
                    <div
                      class="flex flex-col gap-1 p-2.5 px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg"
                    >
                      <span
                        class="text-[11px] text-[var(--app-page-text-muted)] font-medium uppercase tracking-wider"
                        >芯片编号</span
                      >
                      <span
                        class="text-[13px] text-[var(--app-text)] font-semibold truncate font-mono"
                        >{{ form.chipNo || "自动带出" }}</span
                      >
                    </div>
                  </div>
                  <UInput v-model="form.productName" style="display: none" />
                  <UInput v-model="form.productSpec" style="display: none" />
                  <UInput v-model="form.moNumber" style="display: none" />
                  <UInput v-model="form.chipCode" style="display: none" />
                  <UInput v-model="form.chipNo" style="display: none" />
                </div>
              </div>

              <!-- 工序与责任人员 -->
              <div
                class="p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl shadow-sm hover:shadow transition-all duration-300"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-dashed border-[var(--app-border)]"
                >
                  <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span class="text-sm font-semibold text-[var(--app-text)]"
                    >工序与责任人员</span
                  >
                  <span class="text-xs text-[var(--app-page-text-muted)] ml-1.5"
                    >责任归属与现场协助人跟踪</span
                  >
                </div>
                <div class="section-body">
                  <div class="grid grid-cols-12 gap-4">
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="产生工序" prop="generateProcessName">
                        <USelect
                          v-model="form.generateProcessName"
                          :items="exceptionProcessOptions"
                          placeholder="产生工序"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="现场作业人员" prop="operatorName">
                        <UInput
                          v-model="form.operatorName"
                          placeholder="现场作业人员"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="技术部门协助" prop="technicianName">
                        <UInput
                          v-model="form.technicianName"
                          placeholder="技术部门协助"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="品质部门确认" prop="qualityName">
                        <UInput
                          v-model="form.qualityName"
                          placeholder="品质部门确认"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧一栏 -->
            <div class="flex flex-col gap-4">
              <!-- 不良数据与分析 -->
              <div
                class="p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl shadow-sm hover:shadow transition-all duration-300"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-dashed border-[var(--app-border)]"
                >
                  <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span class="text-sm font-semibold text-[var(--app-text)]"
                    >不良数据与分析</span
                  >
                  <span class="text-xs text-[var(--app-page-text-muted)] ml-1.5"
                    >核心质量数据与异常评估指标</span
                  >
                </div>
                <div class="section-body">
                  <div class="grid grid-cols-12 gap-4">
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField label="抽检数量" prop="sampleQty">
                        <UInput
                          v-model="form.sampleQty"
                          placeholder="数量"
                          type="number"
                          :step="0.01"
                          :min="0"
                          inputmode="decimal"
                          class="w-full"
                        >
                          <template #trailing>
                            <USelect
                              v-model="form.sampleUnit"
                              :items="exceptionUnitOptions"
                              placeholder="单位"
                              variant="none"
                              class="bg-transparent"
                              style="width: 75px"
                            />
                          </template>
                        </UInput>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField label="不良数量" prop="defectQty">
                        <UInput
                          v-model="form.defectQty"
                          placeholder="数量"
                          type="number"
                          :step="0.01"
                          :min="0"
                          inputmode="decimal"
                          class="w-full"
                        >
                          <template #trailing>
                            <USelect
                              v-model="form.defectUnit"
                              :items="exceptionUnitOptions"
                              placeholder="单位"
                              variant="none"
                              class="bg-transparent"
                              style="width: 75px"
                            />
                          </template>
                        </UInput>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-4">
                      <UFormField
                        label="不良率评估"
                        prop="defectRate"
                        class="defect-rate-item"
                      >
                        <div
                          class="flex flex-col justify-center items-center gap-1 w-full h-8 px-3"
                        >
                          <div
                            class="flex items-center text-[13px] font-bold leading-none"
                            :class="[
                              defectRateClass === 'gauge-success'
                                ? 'text-green-700 dark:text-green-400'
                                : defectRateClass === 'gauge-warning'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-red-700 dark:text-red-400',
                            ]"
                          >
                            <span class="rate-label">不良率：</span>
                            <span class="rate-value">{{
                              formatDecimalRate(form.defectRate)
                            }}</span>
                          </div>
                          <div
                            class="w-full h-1 bg-[var(--app-border)] rounded-full overflow-hidden"
                          >
                            <div
                              class="h-full rounded-full transition-all duration-500"
                              :class="[
                                defectRateClass === 'gauge-success'
                                  ? 'bg-emerald-500'
                                  : defectRateClass === 'gauge-warning'
                                    ? 'bg-amber-500'
                                    : 'bg-red-500',
                              ]"
                              :style="{ width: defectRateBarWidth }"
                            ></div>
                          </div>
                        </div>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="涉及风险批" prop="riskBatch">
                        <UInput
                          v-model="form.riskBatch"
                          placeholder="请输入涉及风险批描述或批号"
                          clearable
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="批不良总数" prop="batchDefectTotal">
                        <UInput
                          v-model="form.batchDefectTotal"
                          placeholder="数量"
                          type="number"
                          :step="0.01"
                          :min="0"
                          inputmode="decimal"
                          class="w-full"
                        >
                          <template #trailing>
                            <USelect
                              v-model="form.batchUnit"
                              :items="exceptionUnitOptions"
                              placeholder="单位"
                              variant="none"
                              class="bg-transparent"
                              style="width: 75px"
                            />
                          </template>
                        </UInput>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="异常类别" prop="defectCategory">
                        <USelect
                          v-model="form.defectCategory"
                          :items="exceptionCategoryOptions"
                          placeholder="请选择异常类别"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField label="处理方式" prop="processingMethod">
                        <USelect
                          v-model="form.processingMethod"
                          :items="tk_processing_method"
                          placeholder="请选择处理方式"
                          class="w-full"
                        />
                      </UFormField>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 描述、分析与图片附件 -->
              <div
                class="p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl shadow-sm hover:shadow transition-all duration-300"
              >
                <div
                  class="flex items-center gap-2 mb-4 pb-3 border-b border-dashed border-[var(--app-border)]"
                >
                  <span class="w-2 h-2 rounded-full bg-red-500"></span>
                  <span class="text-sm font-semibold text-[var(--app-text)]"
                    >描述、分析与图片附件</span
                  >
                  <span class="text-xs text-[var(--app-page-text-muted)] ml-1.5"
                    >异常发生详情、原因溯源与措施</span
                  >
                </div>
                <div class="section-body flex flex-col gap-4">
                  <UFormField label="不良项目" prop="defectItem">
                    <UInput
                      v-model="form.defectItem"
                      placeholder="请输入不良项目"
                      clearable
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="不良描述" prop="defectDesc">
                    <UTextarea
                      v-model="form.defectDesc"
                      :rows="2"
                      placeholder="请详细描述异常发生的状态、现象、波及范围等..."
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="原因分析" prop="reasonAnalysis">
                    <UTextarea
                      v-model="form.reasonAnalysis"
                      :rows="2"
                      placeholder="请根据排查结果，说明该品质异常产生的原因分析..."
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="纠正及预防措施" prop="causeAnalysis">
                    <UTextarea
                      v-model="form.causeAnalysis"
                      :rows="2"
                      placeholder="为防止该品质异常重复出现，请详细说明将采取的纠正与预防措施..."
                      class="w-full"
                    />
                  </UFormField>

                  <div class="grid grid-cols-12 gap-4 mt-2">
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField
                        label="不良现象现场图片 (最多6张)"
                        prop="defectImages"
                      >
                        <div
                          class="p-2.5 bg-[var(--app-bg)] border border-dashed border-[var(--app-border)] rounded-lg"
                        >
                          <image-upload v-model="form.defectImages" :limit="6" />
                        </div>
                      </UFormField>
                    </div>
                    <div class="col-span-12 sm:col-span-6">
                      <UFormField
                        label="检测分析报告图片 (最多6张)"
                        prop="reportImages"
                      >
                        <div
                          class="p-2.5 bg-[var(--app-bg)] border border-dashed border-[var(--app-border)] rounded-lg"
                        >
                          <image-upload v-model="form.reportImages" :limit="6" />
                        </div>
                      </UFormField>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton color="neutral" variant="soft" @click="cancel"
            >取 消</UButton
          >
          <UButton
            color="primary"
            @click="submitForm"
            class="bg-gradient-to-r from-blue-500 to-blue-700 border-none text-white font-semibold shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >确 定</UButton
          >
        </div>
      </template>
    </UModal>

    <ClientOnly>
      <VueEasyLightbox
        :visible="lightboxVisible"
        :imgs="lightboxImgs"
        :index="lightboxIndex"
        @hide="lightboxVisible = false"
      />
    </ClientOnly>
  </div>
</template>

<script setup name="Exception">
import { useTkListQuery } from "@ctk-system/composables";
import { formatDecimalRate } from "@ctk-system/shared";
import { CalendarDate } from "@internationalized/date";
import { isExternal } from "@/utils/validate";
import { useDict } from "@/utils/dict";

// 图片灯箱预览状态
const lightboxVisible = ref(false);
const lightboxImgs = ref([]);
const lightboxIndex = ref(0);

function splitImages(imagesStr) {
  if (!imagesStr) return [];
  return String(imagesStr).split(",").filter(Boolean);
}

function imagePreview(imagesStr, max = 3) {
  const all = splitImages(imagesStr);
  return {
    all,
    preview: all.slice(0, max),
    more: Math.max(0, all.length - max),
  };
}

function getRealSrc(src) {
  if (!src) return "";
  if (isExternal(src)) return src;
  const normalized = String(src).replace(/^\/prod-api(?=\/profile\/)/i, "");
  if (/^\/profile\//i.test(normalized)) return normalized;
  const prefix = src.startsWith("/") ? "" : "/";
  return import.meta.env.VITE_APP_BASE_API + prefix + src;
}

function showLightbox(imgs, index = 0) {
  lightboxImgs.value = imgs.map(img => getRealSrc(img));
  lightboxIndex.value = index;
  lightboxVisible.value = true;
}
const toast = useToast();
const exceptionRef = ref(null);
const UCheckbox = resolveComponent("UCheckbox");

const { proxy } = getCurrentInstance();
const route = useRoute();
const {
  tk_exception_shift,
  tk_exception_category,
  tk_exception_status,
  tk_exception_process,
  tk_processing_method,
  tk_exception_unit,
} = useDict(
  "tk_exception_shift",
  "tk_exception_category",
  "tk_exception_status",
  "tk_exception_process",
  "tk_processing_method",
  "tk_exception_unit",
);
const exceptionCategoryOptions = computed(() =>
  (tk_exception_category.value || []).map((dict) =>
    dict.value === "O" ? { ...dict, label: "人/机" } : dict,
  ),
);
const exceptionProcessOptions = computed(
  () => tk_exception_process.value || [],
);
const exceptionUnitOptions = computed(() => tk_exception_unit.value || []);

const exceptionColumns = [
  {
    id: "select",
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value) =>
          table.toggleAllPageRowsSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: "Select all",
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        "onUpdate:modelValue": (value) => row.toggleSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: "Select row",
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "reportNo",
    header: "报告编号",
    cell: ({ row }) =>
      h(
        "span",
        {
          class: "font-mono font-medium text-primary-600 dark:text-primary-400",
        },
        row.original.reportNo ?? "",
      ),
  },
  {
    accessorKey: "planNo",
    header: "流程卡号",
    cell: ({ row }) =>
      h(
        "span",
        { class: "font-mono text-gray-700 dark:text-gray-300" },
        row.original.planNo ?? "",
      ),
  },
  { accessorKey: "shiftName", header: "班别" },
  { accessorKey: "finderName", header: "发现人" },
  { accessorKey: "generateProcessName", header: "产生工序" },
  { accessorKey: "processName", header: "发现工序" },
  {
    accessorKey: "machineNo",
    header: "发生机台",
    cell: ({ row }) =>
      h(
        "span",
        { class: "font-mono text-gray-700 dark:text-gray-300" },
        row.original.machineNo ?? "",
      ),
  },
  { accessorKey: "productName", header: "物料名称" },
  { accessorKey: "productSpec", header: "封装" },
  { accessorKey: "riskBatch", header: "涉及风险批" },
  { accessorKey: "batchDefectTotal", header: "批不良总数" },
  { accessorKey: "sampleQty", header: "抽检数量" },
  { accessorKey: "defectQty", header: "不良数量" },
  { accessorKey: "defectRate", header: "不良率" },
  { accessorKey: "defectItem", header: "不良项目" },
  { accessorKey: "defectDesc", header: "不良描述" },
  { accessorKey: "defectImages", header: "不良图片" },
  { accessorKey: "reportImages", header: "报告图片" },
  { accessorKey: "reasonAnalysis", header: "原因分析" },
  { accessorKey: "causeAnalysis", header: "纠正及预防措施" },
  { accessorKey: "defectCategory", header: "异常类别" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "actions", header: "操作" },
];

const loadingPlan = ref(false);
const defectRateClass = computed(() => {
  const num = Number(form.value.defectRate || 0);
  if (num <= 0.01) return "gauge-success";
  if (num <= 0.05) return "gauge-warning";
  return "gauge-danger";
});
const defectRateBarWidth = computed(() => {
  const num = Number(form.value.defectRate || 0);
  if (!num || num <= 0) return "0%";
  const percent = Math.min(100, Math.max(0, num * 100));
  return `${percent}%`;
});

const queryPanelRef = ref();
const tkDataTableRef = ref();
const open = ref(false);
const formLoading = ref(false);
const showSearch = ref(true);
const selectedRows = ref({});
const ids = ref([]);
const currentRowId = ref(null);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
const tableMaxHeight = ref(360);
const dateRangeArray = ref([]);
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
const calendarMonths = useCalendarMonths();
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const dateRangeArrayOpen = ref(false)
function ondateRangeArrayPick(range) {
  if (!range?.start || !range?.end) return
  dateRangeArray.value = calendarToArray(range, 'date')
  dateRangeArrayOpen.value = false
}
function applydateRangeArrayPreset(preset) {
  dateRangeArray.value = presetToArray(preset, 'date')
  dateRangeArrayOpen.value = false
}
function cleardateRangeArray() {
  dateRangeArray.value = []
  dateRangeArrayOpen.value = false
}

const formOccurDateValue = computed({
  get() {
    if (!form.value?.occurDate) return null;
    // 原先调用从未定义过的 parseDate，异常被 catch 吞掉后恒返回 null，
    // 打开日历时永远不预选当前发生日期。按 YYYY-MM-DD 显式构造 CalendarDate。
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(form.value.occurDate));
    if (!match) return null;
    return new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
  },
  set(val) {
    form.value.occurDate = val ? val.toString() : null;
  },
});

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 50,
    reportNo: null,
    planNo: null,
    shiftName: null,
    finderName: null,
    machineNo: null,
    generateProcessName: null,
    processName: null,
    productName: null,
    productSpec: null,
    riskBatch: null,
    batchDefectTotal: null,
    defectCategory: null,
    defectItem: null,
    status: null,
    delFlag: "0",
  },
  rules: {
    reportNo: [
      {
        validator: (rule, value, callback) => {
          if (form.value.id && !value?.trim()) {
            callback(new Error("报告编号不能为空"));
            return;
          }
          callback();
        },
        trigger: "blur",
      },
    ],
    shiftName: [{ required: true, message: "班别不能为空", trigger: "change" }],
    finderName: [
      { required: true, message: "发现人不能为空", trigger: "blur" },
    ],
    occurDate: [
      { required: true, message: "发生日期不能为空", trigger: "change" },
    ],
    generateProcessName: [
      { required: true, message: "产生工序不能为空", trigger: "change" },
    ],
    processName: [
      { required: true, message: "发现工序不能为空", trigger: "blur" },
    ],
    defectDesc: [
      { required: true, message: "不良描述不能为空", trigger: "blur" },
    ],
    productName: [
      { required: true, message: "物料名称不能为空", trigger: "blur" },
    ],
    productSpec: [{ required: true, message: "封装不能为空", trigger: "blur" }],
  },
});

const { queryParams, form, rules } = toRefs(data);
const isRecycleBin = computed(() => queryParams.value.delFlag === "2");

function buildExceptionQuery() {
  return {
    ...queryParams.value,
    beginOccurDate: dateRangeArray.value[0],
    endOccurDate: dateRangeArray.value[1],
  };
}

const {
  loading,
  list: exceptionList,
  total,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listException(buildExceptionQuery()),
  beforeReset: () => {
    const delFlag = isRecycleBin.value ? "2" : "0";
    Object.assign(queryParams.value, {
      pageNum: 1,
      pageSize: queryParams.value.pageSize || 50,
      reportNo: null,
      planNo: null,
      shiftName: null,
      finderName: null,
      machineNo: null,
      generateProcessName: null,
      processName: null,
      productName: null,
      productSpec: null,
      riskBatch: null,
      batchDefectTotal: null,
      defectCategory: null,
      defectItem: null,
      status: null,
      delFlag,
    });
    dateRangeArray.value = [];
  },
  afterLoad: () => {
    ids.value = [];
    currentRowId.value = null;
    single.value = true;
    multiple.value = true;
    nextTick(() => updateTableMaxHeight());
  },
});

watch(
  selectedRows,
  (newVal) => {
    const selectedList = [];
    if (newVal) {
      Object.keys(newVal).forEach((indexStr) => {
        if (newVal[indexStr]) {
          const idx = parseInt(indexStr, 10);
          const row = exceptionList.value[idx];
          if (row) {
            selectedList.push(row);
          }
        }
      });
    }
    ids.value = selectedList.map((item) => item.id);
    currentRowId.value = selectedList.length === 1 ? selectedList[0].id : null;
    single.value = selectedList.length !== 1;
    multiple.value = !selectedList.length;
  },
  { deep: true },
);

function statusTag(value) {
  if (value === "2") return "success";
  if (value === "1") return "warning";
  if (value === "3") return "info";
  return "danger";
}

function statusBadgeColor(value) {
  const tag = statusTag(value);
  if (tag === "success") return "success";
  if (tag === "warning") return "warning";
  if (tag === "info") return "neutral";
  return "error";
}

function getStatusLabel(value) {
  const dict = (tk_exception_status.value || []).find((item) => item.value === value);
  return dict ? dict.label : value;
}

function getCategoryLabel(value) {
  const dict = (exceptionCategoryOptions.value || []).find((item) => item.value === value);
  return dict ? dict.label : value;
}

function categoryBadgeColor(value) {
  if (value === "P") return "error";     // 人 - 红色
  if (value === "M") return "warning";   // 机 - 黄色
  if (value === "O") return "primary";   // 人/机 - 蓝色
  return "neutral";                      // 其它 - 灰色
}

function syncDefectRate() {
  const sampleQty = Number(form.value.sampleQty || 0);
  const defectQty = Number(form.value.defectQty || 0);
  if (!sampleQty || sampleQty <= 0 || defectQty < 0) {
    form.value.defectRate = "0.0000";
    return;
  }
  form.value.defectRate = (defectQty / sampleQty).toFixed(4);
}

function updateTableMaxHeight() {
  nextTick(() => {
    const containerEl = tkDataTableRef.value?.getContainerEl?.();
    const tableTop = containerEl?.getBoundingClientRect?.().top ?? 0;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 800;
    const paginationHeight = total.value > 0 ? 64 : 16;
    const bottomGap = 24;
    tableMaxHeight.value = Math.max(
      280,
      viewportHeight - tableTop - paginationHeight - bottomGap,
    );
  });
}

watch(
  () => [form.value.sampleQty, form.value.defectQty],
  () => {
    syncDefectRate();
  },
);

watch(showSearch, () => {
  updateTableMaxHeight();
});

const DUMMY_PLAN_NO = "假片";
const isDummyPlan = computed(
  () => String(form.value.planNo || "").trim() === DUMMY_PLAN_NO,
);
const DUMMY_PACKAGE_NAMES = [
  "SOD-123",
  "SOD-323",
  "SOD-523",
  "SOT-23 6R",
  "SOT-23 27R",
  "SOT-23/26",
  "TO-252",
  "PDFN5X6",
  "PDFN3X3",
  "DFN1006",
  "DFN",
];
const dummyPackageOptions = computed(() => {
  const names = [...DUMMY_PACKAGE_NAMES];
  const current = String(form.value.productSpec || "").trim();
  if (current && !names.includes(current)) {
    names.unshift(current);
  }
  return names.map((name) => ({ label: name, value: name }));
});

function applyDummyPlanDefaults() {
  form.value.productName = DUMMY_PLAN_NO;
  form.value.moNumber = "";
  form.value.chipCode = "";
  form.value.chipNo = "";
  if (!form.value.productSpec) {
    form.value.productSpec = null;
  }
}

/** 从金蝶规格型号提取封装 */
function normalizePackageSegment(segment) {
  if (!segment) return "";
  const text = segment.trim().toUpperCase();
  if (text.includes("TO-252") || text.includes("TO252")) return "TO-252";
  if (
    text.includes("PDFN5X6") ||
    text.includes("PDFN5*6") ||
    text.includes("PDFN5-6")
  )
    return "PDFN5X6";
  if (
    text.includes("PDFN3X3") ||
    text.includes("PDFN3*3") ||
    text.includes("PDFN3-3")
  )
    return "PDFN3X3";
  if (
    ["SOT-23/27R", "SOT-23 27R", "SOT23-27R", "SOT23(27R)", "SOT-23(27R)"].some(
      (token) => text.includes(token),
    )
  ) {
    return "SOT-23 27R";
  }
  if (
    ["SOT-23/6R", "SOT-23 6R", "SOT23-6R", "SOT23(6R)", "SOT-23(6R)"].some(
      (token) => text.includes(token),
    )
  ) {
    return "SOT-23 6R";
  }
  if (text.startsWith("DFN1006")) return "DFN1006";
  return segment.trim();
}

function resolvePackageFromSpec(spec) {
  if (!spec) return "";
  const parts = spec
    .split(/[/\\]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? normalizePackageSegment(parts[0]) : "";
}

/** 处理流程卡号失去焦点事件 */
function handlePlanNoBlur() {
  const planNo = String(form.value.planNo || "").trim();
  form.value.planNo = planNo;
  if (!planNo) return;

  // 假片：金蝶搜不到，跳过拉取，改为手动选封装
  if (planNo === DUMMY_PLAN_NO) {
    applyDummyPlanDefaults();
    toast.add({
      title: "假片模式",
      description: "请手动选择封装规格",
      color: "info",
    });
    return;
  }

  loadingPlan.value = true;
  getGXJHData(planNo)
    .then((res) => {
      if (res && res.FProductName) {
        form.value.productName = res.FProductName;
        form.value.productSpec = resolvePackageFromSpec(
          res.FProSpecification || "",
        );
        form.value.moNumber = res.FMONumber || "";
        form.value.chipCode = res.F_UNW_BaseProperty_re5 || "";
        form.value.chipNo = res.F_UNW_Text_w5c || "";
        toast.add({ title: "已自动获取金蝶资料", color: "success" });
      } else {
        toast.add({ title: "未找到该流程卡号资料", color: "warning" });
      }
    })
    .catch(() => {})
    .finally(() => {
      loadingPlan.value = false;
    });
}

function cancel() {
  open.value = false;
  reset();
}

function reset() {
  form.value = {
    id: null,
    reportNo: "",
    planNo: "",
    reportDate: null,
    shiftName: null,
    finderName: null,
    sendDept: null,
    generateProcessName: null,
    processName: null,
    occurDate: null,
    productName: null,
    productSpec: null,
    moNumber: null,
    chipCode: null,
    chipNo: null,
    riskBatch: null,
    batchDefectTotal: null,
    batchUnit: "PCS",
    processingMethod: null,
    machineNo: null,
    sampleQty: 0,
    sampleUnit: "PCS",
    defectQty: 0,
    defectUnit: "PCS",
    defectRate: "0.0000",
    defectItem: null,
    defectDesc: null,
    defectImages: null,
    reportImages: null,
    defectCategory: null,
    operatorName: null,
    technicianName: null,
    qualityName: null,
    causeAnalysis: null,
    reasonAnalysis: null,
    correctiveAction: null,
    preventiveAction: null,
    handlerName: null,
    qcConfirm: null,
    status: "0",
    remark: null,
  };
  proxy.resetForm("exceptionRef");
}

function handleAdd() {
  reset();
  formLoading.value = false;
  open.value = true;
  title.value = "添加异常单";
}

function handleUpdate(row) {
  reset();
  // 工具栏调用时 row 为空，取单选行的 id；行双击/操作列调用时取行 id
  const _id = row?.id ?? ids.value[0];
  if (_id == null || _id === "") return;
  formLoading.value = true;
  open.value = true;
  title.value = "修改异常单";
  getException(_id).then((response) => {
    form.value = response.data;
    syncDefectRate();
  }).finally(() => {
    formLoading.value = false;
  });
}

async function submitForm() {
  try {
    await exceptionRef.value?.validate?.();
  } catch (_) {
    return;
  }
  syncDefectRate();
  form.value.reportDate = form.value.occurDate;
  form.value.reportNo = form.value.reportNo?.trim?.() || "";
  form.value.planNo = form.value.planNo?.trim?.() || "";
  if (String(form.value.planNo || "") === DUMMY_PLAN_NO) {
    applyDummyPlanDefaults();
  }
  form.value.productName = form.value.productName?.trim?.() || "";
  form.value.productSpec = form.value.productSpec?.trim?.() || "";
  if (form.value.id != null) {
    updateException(form.value).then(() => {
      toast.add({ title: "修改成功", color: "success" });
      open.value = false;
      getList();
    });
  } else {
    addException(form.value).then(() => {
      toast.add({ title: "新增成功", color: "success" });
      open.value = false;
      getList();
    });
  }
}

function handleDelete(row) {
  const rawIds = row?.id ?? ids.value;
  const _ids = Array.isArray(rawIds) ? rawIds.join(",") : rawIds;
  if (_ids == null || _ids === "") return;
  useModalConfirm()
    .confirm('是否确认删除异常单编号为 "' + _ids + '" 的数据项？')
    .then(function () {
      return delException(_ids);
    })
    .then(() => {
      getList();
      toast.add({ title: "删除成功", color: "success" });
    })
    .catch(() => {});
}

function toggleRecycleBin() {
  queryParams.value.delFlag = isRecycleBin.value ? "0" : "2";
  queryParams.value.pageNum = 1;
  ids.value = [];
  single.value = true;
  multiple.value = true;
  getList();
}

function handleRestore(row) {
  const rawIds = row?.id ?? ids.value;
  const _ids = Array.isArray(rawIds) ? rawIds.join(",") : rawIds;
  if (_ids == null || _ids === "") return;
  useModalConfirm()
    .confirm('是否确认恢复异常单编号为 "' + _ids + '" 的数据项？')
    .then(function () {
      return restoreException(_ids);
    })
    .then(() => {
      getList();
      toast.add({ title: "恢复成功", color: "success" });
    })
    .catch(() => {});
}

function handleExport() {
  const exportParams = buildExceptionQuery();
  if (ids.value.length > 0) {
    exportParams.exportIds = ids.value.join(",");
  }
  proxy.download(
    "tk_custom/exception/export",
    {
      ...exportParams,
    },
    `exception_${new Date().getTime()}.xlsx`,
  );
}

function applyRouteFilters() {
  const filterKeys = [
    "reportNo",
    "planNo",
    "processName",
    "defectCategory",
    "machineNo",
    "productName",
    "status",
  ];
  for (const key of filterKeys) {
    const value = route.query?.[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      queryParams.value[key] = Array.isArray(value) ? value[0] : String(value);
    }
  }
  // 看板穿透的区间（日期范围值格式 ['YYYY-MM-DD','YYYY-MM-DD']，经 addDateRange 转 begin/endOccurDate）
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const pickDate = (value) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string") return "";
    const trimmed = text.trim();
    return datePattern.test(trimmed) ? trimmed : "";
  };
  const begin = pickDate(route.query?.beginOccurDate);
  const end = pickDate(route.query?.endOccurDate);
  const single = pickDate(route.query?.occurDate);
  if (begin || end) {
    dateRangeArray.value = [begin || end, end || begin];
  } else if (single) {
    dateRangeArray.value = [single, single];
  }
}

applyRouteFilters();
getList();

onMounted(() => {
  updateTableMaxHeight();
  window.addEventListener("resize", updateTableMaxHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateTableMaxHeight);
});
</script>

<style scoped>
.exception-search {
  margin-bottom: 8px;
  padding: 8px 10px 6px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.02),
    0 1px 2px rgba(0, 0, 0, 0.03);
}

.exception-search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  align-items: center;
}

.exception-search-grid > * {
  min-width: 0;
}

.exception-search :deep(.nuxt-form-field) {
  margin-bottom: 0;
}

.exception-search :deep(.nuxt-form-item__label) {
  margin-bottom: 4px;
  padding: 0;
  height: 20px;
  line-height: 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-page-text-muted);
}

.exception-search :deep(.nuxt-input),
.exception-search :deep(.nuxt-select) {
  width: 100%;
}

.exception-search :deep(.nuxt-input__wrapper),
.exception-search :deep(.nuxt-select__wrapper) {
  background-color: var(--app-surface);
}

.exception-search-actions {
  grid-column: 1 / -1;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-bottom: 0;
}

.exception-table-wrapper {
  width: 100%;
}

@media (max-width: 767px) {
  .exception-search {
    padding: 7px 8px 5px;
  }

  .exception-search-actions {
    align-items: center;
  }

  .exception-search-actions :deep(button) {
    flex: 1;
  }
}

@media (max-width: 480px) {
  .exception-search-actions {
    justify-content: flex-end;
  }

  .exception-search-actions :deep(button) {
    flex: 0 0 auto;
  }
}
</style>
