<template>
  <div
    class="app-container p-6 pb-20 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 flex min-h-0 flex-col overflow-y-auto text-app-text transition-colors duration-350 ease-in-out md:overflow-hidden"
  >
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      class="pic-search-panel shrink-0 p-2.5 mb-3 border border-[var(--app-border)] rounded-xl bg-[var(--app-surface)] shadow-sm animate-fade-in relative overflow-hidden flex flex-col gap-2.5"
    >
      <div
        class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500/50 via-blue-500/50 to-emerald-500/50"
      ></div>

      <!-- Primary row inputs (always visible) -->
      <div
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5 items-center w-full"
      >
        <UInput
          v-model="queryParams.flowno"
          placeholder="流程单号"
          icon="i-lucide-file-text"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.materialname"
          placeholder="物料名称"
          icon="i-lucide-tag"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.specification"
          placeholder="规格型号"
          icon="i-lucide-layers"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <USelect
          v-model="queryParams.result"
          :items="testResult"
          placeholder="判定结果"
          clearable
          class="w-full"
        />
        <!-- Actions Button Cell -->
        <div
          class="grid w-full grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:items-center sm:justify-end md:col-span-4 xl:col-span-2"
        >
          <UButton
            variant="outline"
            icon="i-lucide-rotate-ccw"
            class="justify-center hover:bg-default/5 text-muted hover:text-default whitespace-nowrap sm:w-28 sm:flex-none"
            @click="resetQuery"
          >
            重置
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-search"
            :loading="loading"
            class="justify-center shadow-sm font-medium whitespace-nowrap sm:w-40 sm:flex-none"
            @click="handleQuery"
          >
            搜索
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            :icon="isExpand ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="col-span-2 justify-center text-muted hover:text-default whitespace-nowrap sm:w-auto sm:flex-none"
            @click="isExpand = !isExpand"
          >
            {{ isExpand ? "收起" : "高级" }}
          </UButton>
        </div>
      </div>

      <!-- Advanced inputs (visible when expanded) -->
      <div
        v-show="isExpand"
        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 border-t border-[var(--app-border)]/40 pt-2.5 mt-0.5 animate-fade-in w-full"
      >
        <UInput
          v-model="queryParams.mechineName"
          placeholder="机台号"
          icon="i-lucide-cpu"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.xpdm"
          placeholder="芯片代码"
          icon="i-lucide-hash"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.xpph"
          placeholder="芯片批号"
          icon="i-lucide-layers"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.khdm"
          placeholder="客户代码"
          icon="i-lucide-user"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.handler"
          placeholder="操作员/技术员"
          icon="i-lucide-wrench"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.creator"
          placeholder="创建人"
          icon="i-lucide-user-plus"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.updater"
          placeholder="最后修改人"
          icon="i-lucide-user-check"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.testNumber"
          placeholder="试验数量"
          icon="i-lucide-binary"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UInput
          v-model="queryParams.testCharge"
          placeholder="试验时机"
          icon="i-lucide-alarm-clock"
          clearable
          class="w-full"
          @keyup.enter="handleQuery"
        />
        <UFormField label="创建时间" class="col-span-1 sm:col-span-2">
          <TkDateRangePicker v-model="daterangeCreatedate" placeholder="选择创建时间" class="w-full" />
        </UFormField>
        <UFormField label="修改时间" class="col-span-1 sm:col-span-2">
          <TkDateRangePicker v-model="daterangeModifydate" placeholder="选择修改时间" class="w-full" />
        </UFormField>
      </div>
    </TkSearchPanel>

    <TkToolbar>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        size="sm"
        @click="handleAdd"
      >
        新增
      </UButton>
      <UButton
        color="success"
        variant="soft"
        icon="i-lucide-pencil"
        size="sm"
        :disabled="single"
        @click="() => handleUpdate()"
      >
        修改
      </UButton>
      <UButton
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        size="sm"
        :disabled="single"
        @click="() => handleDelete()"
      >
        删除
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-file-down"
        size="sm"
        @click="handleExport"
      >
        按条件导出
      </UButton>
      <UButton
        color="warning"
        variant="soft"
        icon="i-lucide-download"
        size="sm"
        :disabled="multiple"
        @click="handleSelectExport"
      >
        按选中导出
      </UButton>
    </TkToolbar>

    <!-- Table Wrapper -->
    <div
      class="flex flex-col flex-1 min-h-0 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl overflow-hidden mb-3"
    >
      <TkUTable
        ref="uTableRef"
        sticky
        v-model:row-selection="selectedRows"
        :loading="loading"
        :data="picList"
        :columns="picColumns"
        @row-open="handleUpdate"
        @selection-change="onSelectionChange"
        class="flex-1 min-h-0"
      >
        <template #xpph-cell="{ row }">
          <UTooltip
            v-if="row.original.xpph"
            :text="row.original.xpph"
            :ui="{
              content: 'max-w-[420px] !h-auto !py-2 font-mono text-xs',
              text: '!whitespace-normal !break-all !overflow-visible !h-auto'
            }"
          >
            <div class="flex items-center gap-1 max-w-[140px]">
              <span class="truncate font-mono text-xs cursor-help select-all">
                {{ row.original.xpph }}
              </span>
              <UBadge
                v-if="formatXpphCount(row.original.xpph) > 1"
                color="neutral"
                variant="subtle"
                size="xs"
                class="shrink-0 font-mono text-[10px] px-1 py-0"
              >
                +{{ formatXpphCount(row.original.xpph) - 1 }}
              </UBadge>
            </div>
          </UTooltip>
          <span v-else class="text-muted">-</span>
        </template>
        <template #createdate-cell="{ row }">
          <span>{{
            parseTime(row.original.createdate, "{y}-{m}-{d} {h}:{i}")
          }}</span>
        </template>
        <template #imgPaths-cell="{ row }">
          <div v-if="row.original.imgPaths?.length" class="flex flex-wrap gap-1 p-0.5">
            <div
              v-for="(item, index) in row.original.imgPaths"
              :key="index"
              class="w-10 h-10 border border-[var(--app-border)] rounded-md overflow-hidden bg-[var(--app-surface-soft,var(--app-bg))] flex items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform duration-200"
              @click.stop="
                previewImages(
                  row.original.imgSrcPaths?.length
                    ? row.original.imgSrcPaths
                    : row.original.imgPaths,
                  index,
                )
              "
            >
              <img
                :src="item"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
          <span v-else class="text-muted">-</span>
        </template>
        <template #testCharge-cell="{ row }">
          <dict-tag :options="pinzhi_sj" :value="row.original.testCharge" />
        </template>
        <template #result-cell="{ row }">
          <UBadge
            :color="row.original.result === 'OK' ? 'emerald' : 'red'"
            variant="subtle"
            size="xs"
            class="font-semibold"
          >
            {{ row.original.result }}
          </UBadge>
        </template>
        <template #modifydate-cell="{ row }">
          <span>{{
            parseTime(row.original.modifydate, "{y}-{m}-{d} {h}:{i}")
          }}</span>
        </template>
      </TkUTable>
    </div>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <UForm ref="picRef" :state="form" :rules="rules" class="space-y-4">
          <!-- Two Column Grid for Manual vs Auto fields -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <!-- Left Side: Manual Fill Inputs -->
            <div class="flex flex-col gap-3">
              <div
                class="text-xs font-bold text-default border-b border-[var(--app-border)]/50 pb-1.5 mb-1 flex items-center gap-1.5"
              >
                <UIcon
                  name="i-lucide-edit-3"
                  class="w-4 h-4 text-primary-500"
                />
                手动录入数据
              </div>

              <!-- 流程单号 -->
              <UFormField label="流程单号" name="flowno" required>
                <UInput
                  ref="dialog_flowno_input"
                  v-model="form.flowno"
                  @keyup="onFlownoKeyup"
                  placeholder="请扫码或输入流程单号"
                  icon="i-lucide-scan"
                  class="w-full font-mono"
                />
              </UFormField>

              <div class="grid grid-cols-2 gap-3">
                <!-- 机台号 -->
                <UFormField label="机台号" name="mechineName" required>
                  <UInput
                    v-model="form.mechineName"
                    list="mechine-list"
                    placeholder="请选择或输入"
                    class="w-full"
                  />
                  <datalist id="mechine-list">
                    <option
                      v-for="item in restaurants1"
                      :key="item.value"
                      :value="item.value"
                    />
                  </datalist>
                </UFormField>

                <!-- 操作/技术员 -->
                <UFormField label="操作/技术员" name="handler" required>
                  <UInputMenu
                    v-model="form.handler"
                    :items="handlerOptions"
                    mode="autocomplete"
                    create-item="always"
                    open-on-focus
                    placeholder="请选择或输入"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <!-- 检测结果 -->
                <UFormField
                  label="检测结果"
                  name="result"
                  required
                  class="col-span-1"
                >
                  <USelect
                    v-model="form.result"
                    :items="testResult"
                    placeholder="结果"
                    class="w-full"
                  />
                </UFormField>

                <!-- 试验数量 -->
                <UFormField
                  label="试验数量"
                  name="testNumber"
                  required
                  class="col-span-1"
                >
                  <UInput
                    type="number"
                    v-model="form.testNumber"
                    placeholder="输入数量"
                    class="w-full font-mono"
                  />
                </UFormField>

                <!-- 试验时机 -->
                <UFormField
                  label="试验时机"
                  name="testCharge"
                  required
                  class="col-span-1"
                >
                  <USelect
                    v-model="form.testCharge"
                    :items="pinzhi_sj"
                    placeholder="时机"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <!-- Right Side: Auto Populated system fields -->
            <div
              class="flex flex-col gap-3 p-3 bg-[color-mix(in_srgb,var(--app-bg)_60%,var(--app-surface))] border border-[var(--app-border)]/40 rounded-xl"
            >
              <div
                class="text-xs font-bold text-default border-b border-[var(--app-border)]/50 pb-1.5 mb-1 flex items-center gap-1.5"
              >
                <UIcon
                  name="i-lucide-database"
                  class="w-4 h-4 text-emerald-500"
                />
                系统带出数据 (只读)
              </div>

              <div class="grid grid-cols-2 gap-3">
                <!-- 物料编码 -->
                <UFormField label="物料编码">
                  <UInput
                    v-model="form.materialno"
                    placeholder="扫描后自动带出"
                    disabled
                    readonly
                    class="w-full bg-[var(--app-bg)]/50"
                  />
                </UFormField>

                <!-- 客户代码 -->
                <UFormField label="客户代码">
                  <UInput
                    v-model="form.khdm"
                    placeholder="扫描后自动带出"
                    disabled
                    readonly
                    class="w-full bg-[var(--app-bg)]/50"
                  />
                </UFormField>
              </div>

              <!-- 物料名称 -->
              <UFormField label="物料名称">
                <UInput
                  v-model="form.materialname"
                  placeholder="扫描后自动带出"
                  disabled
                  readonly
                  class="w-full bg-[var(--app-bg)]/50"
                />
              </UFormField>

              <!-- 规格型号 -->
              <UFormField label="规格型号">
                <UInput
                  v-model="form.specification"
                  placeholder="扫描后自动带出"
                  disabled
                  readonly
                  class="w-full bg-[var(--app-bg)]/50"
                />
              </UFormField>

              <div class="grid grid-cols-2 gap-3">
                <!-- 芯片代码 -->
                <UFormField label="芯片代码">
                  <UInput
                    v-model="form.xpdm"
                    placeholder="自动带出"
                    disabled
                    readonly
                    class="w-full bg-[var(--app-bg)]/50"
                  />
                </UFormField>

                <!-- 芯片批号 -->
                <UFormField label="芯片批号">
                  <UInput
                    v-model="form.xpph"
                    placeholder="自动带出"
                    disabled
                    readonly
                    class="w-full bg-[var(--app-bg)]/50"
                  />
                </UFormField>
              </div>
            </div>
          </div>

          <!-- Bottom elements: Image Upload and Remark (takes full width) -->
          <div
            class="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-[var(--app-border)]/50 pt-4 mt-1"
          >
            <!-- Left: Remark -->
            <UFormField label="备注信息" name="remark" class="w-full">
              <UTextarea
                v-model="form.remark"
                placeholder="请输入相关的实验异常情况或备注说明"
                class="w-full"
                :rows="4"
              />
            </UFormField>

            <!-- Right: Photo Upload -->
            <UFormField label="上传弹坑图片" required class="w-full">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap gap-2 items-center">
                  <!-- Thumbnail items already uploaded -->
                  <div
                    v-for="(url, idx) in form.imgPaths"
                    :key="idx"
                    class="group relative w-16 h-16 border border-[var(--app-border)] rounded-md overflow-hidden bg-muted flex items-center justify-center"
                  >
                    <img :src="url" class="w-full h-full object-cover" />
                    <!-- Delete hover overlay -->
                    <div
                      class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200"
                    >
                      <UButton
                        color="error"
                        variant="ghost"
                        icon="i-lucide-trash-2"
                        size="xs"
                        @click="form.imgPaths.splice(idx, 1)"
                      />
                    </div>
                  </div>

                  <!-- Local previews for queued, uploading, or failed files -->
                  <div
                    v-for="task in uploadTasks"
                    :key="task.id"
                    class="group relative w-16 h-16 border rounded-md overflow-hidden bg-muted flex items-center justify-center"
                    :class="task.status === 'failed' ? 'border-error-500' : 'border-[var(--app-border)]'"
                  >
                    <img :src="task.previewUrl" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1 text-white">
                      <UIcon
                        v-if="task.status !== 'failed'"
                        name="i-lucide-loader-2"
                        class="w-4 h-4 animate-spin"
                      />
                      <UIcon v-else name="i-lucide-circle-alert" class="w-4 h-4 text-error-300" />
                      <span class="text-[9px]">{{ uploadStatusLabel(task.status) }}</span>
                      <div v-if="task.status === 'failed'" class="flex gap-1">
                        <UButton
                          icon="i-lucide-refresh-cw"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          aria-label="重试上传"
                          @click.stop="retryUpload(task)"
                        />
                        <UButton
                          icon="i-lucide-trash-2"
                          color="error"
                          variant="ghost"
                          size="xs"
                          aria-label="移除图片"
                          @click.stop="removeUploadTask(task)"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Plus sign trigger -->
                  <div
                    v-show="usedUploadSlots < 6"
                    class="relative w-16 h-16 border-2 border-dashed border-[var(--app-border)] rounded-md hover:border-primary-500 hover:bg-default/5 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200"
                    @click="$refs.fileInputRef.click()"
                  >
                    <UIcon
                      name="i-lucide-image-plus"
                      class="w-5 h-5 text-muted"
                    />
                    <span class="text-[9px] text-muted mt-1"
                      >{{ usedUploadSlots }}/6</span
                    >
                  </div>
                </div>

                <!-- Hidden native input file -->
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  @change="handleFileChange"
                />

                <span class="text-[10px] text-muted">
                  支持粘贴剪贴板图片或点击上传，最多允许上传 6 张弹坑测试照片。
                </span>
              </div>
            </UFormField>
          </div>

          <!-- Dialog footer -->
          <div
            class="flex justify-end gap-2.5 border-t border-[var(--app-border)]/50 pt-4 mt-2"
          >
            <div
              v-show="isUploading"
              class="flex items-center gap-2 text-xs font-semibold text-primary-500 animate-pulse mr-auto"
            >
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              {{ uploadSummary }}
            </div>
            <div v-show="!isUploading" class="flex gap-2 w-full justify-end">
              <UButton variant="outline" class="px-5" @click="cancel">
                取 消
              </UButton>
              <UButton
                color="primary"
                class="px-5 shadow-sm"
                @click="uploadImgToServer"
              >
                保 存
              </UButton>
            </div>
          </div>
        </UForm>
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

<script setup name="Pic">
import Cookies from "js-cookie";
import { useDict } from "@/utils/dict";
import { normalizeProfileImageList, resolveProfileImageUrl } from "@/utils/image-url";
import { useTkListQuery } from "@ctk-system/composables";
import { TkSearchPanel, TkToolbar, TkUTable } from "@ctk-system/ui";
const toast = useToast();
const { proxy } = getCurrentInstance();

const queryPanelRef = ref();
const tkDataTableRef = ref();
const uTableRef = ref(null);

const { pinzhi_sj } = useDict("pinzhi_sj");
const open = ref(false);
const ids = ref([]);
const currentRowId = ref(null);
const testResult = ref([
  { label: "OK", value: "OK" },
  { label: "NG", value: "NG" },
]);
const single = ref(true);
const multiple = ref(true);
const isExpand = ref(false);
const title = ref("");
const lightboxVisible = ref(false);
const lightboxImgs = ref([]);
const lightboxIndex = ref(0);
const uploadTasks = ref([]);
const isUploading = computed(() =>
  uploadTasks.value.some((task) => task.status === "queued" || task.status === "uploading"),
);
const usedUploadSlots = computed(
  () => (form.value?.imgPaths?.length || 0) + uploadTasks.value.length,
);
const uploadSummary = computed(() => {
  const uploading = uploadTasks.value.filter((task) => task.status === "uploading").length;
  const queued = uploadTasks.value.filter((task) => task.status === "queued").length;
  return `图片上传中（${uploading} 张处理中，${queued} 张等待）...`;
});

const cellTdClass =
  "align-middle p-2.5 border-b border-[var(--app-border)]/40 text-xs";
const cellThClass =
  "whitespace-nowrap bg-[var(--app-surface)] text-xs font-bold py-2.5 px-2.5 text-default border-b border-[var(--app-border)]";

const UCheckbox = resolveComponent("UCheckbox");

const picColumns = [
  {
    id: "select",
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value) => table.toggleAllPageRowsSelected(!!value),
        ariaLabel: "Select all",
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        onClick: (e) => handleCheckboxClick(row, e),
        ariaLabel: "Select row",
      }),
    enableSorting: false,
    enableHiding: false,
    meta: {
      class: {
        th: `${cellThClass} w-[40px] min-w-[40px]`,
        td: `${cellTdClass} w-[40px] min-w-[40px]`,
      },
    },
  },
  {
    accessorKey: "flowno",
    header: "流程单号",
    meta: {
      class: {
        th: `${cellThClass} w-[130px] min-w-[110px]`,
        td: `${cellTdClass} w-[130px] min-w-[110px] font-mono`,
      },
    },
  },
  {
    accessorKey: "materialname",
    header: "物料名称",
    meta: {
      class: {
        th: `${cellThClass} w-[180px] min-w-[150px]`,
        td: `${cellTdClass} w-[180px] min-w-[150px] font-medium`,
      },
    },
  },
  {
    accessorKey: "specification",
    header: "规格型号",
    meta: {
      class: {
        th: `${cellThClass} w-[150px] min-w-[120px]`,
        td: `${cellTdClass} w-[150px] min-w-[120px]`,
      },
    },
  },
  {
    accessorKey: "mechineName",
    header: "机台号",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px]`,
      },
    },
  },
  {
    accessorKey: "xpdm",
    header: "芯片代码",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px]`,
      },
    },
  },
  {
    accessorKey: "xpph",
    header: "芯片批号",
    meta: {
      class: {
        th: `${cellThClass} w-[140px] min-w-[100px] max-w-[160px]`,
        td: `${cellTdClass} w-[140px] min-w-[100px] max-w-[160px] font-mono`,
      },
    },
  },
  {
    accessorKey: "khdm",
    header: "客户代码",
    meta: {
      class: {
        th: `${cellThClass} w-[120px] min-w-[100px]`,
        td: `${cellTdClass} w-[120px] min-w-[100px]`,
      },
    },
  },
  {
    accessorKey: "handler",
    header: "技术员",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px]`,
      },
    },
  },
  {
    accessorKey: "testNumber",
    header: "试验数量",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px] text-right font-mono`,
      },
    },
  },
  {
    accessorKey: "testCharge",
    header: "试验时机",
    meta: {
      class: {
        th: `${cellThClass} w-[120px] min-w-[100px]`,
        td: `${cellTdClass} w-[120px] min-w-[100px]`,
      },
    },
  },
  {
    accessorKey: "result",
    header: "判定结果",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[85px] text-center`,
        td: `${cellTdClass} w-[100px] min-w-[85px] text-center`,
      },
    },
  },
  {
    accessorKey: "imgPaths",
    header: "弹坑图片",
    meta: {
      class: {
        th: `${cellThClass} w-[160px] min-w-[130px]`,
        td: `${cellTdClass} w-[160px] min-w-[130px]`,
      },
    },
  },
  {
    accessorKey: "creator",
    header: "创建人",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px]`,
      },
    },
  },
  {
    accessorKey: "createdate",
    header: "创建时间",
    meta: {
      class: {
        th: `${cellThClass} w-[150px] min-w-[130px]`,
        td: `${cellTdClass} w-[150px] min-w-[130px] text-muted`,
      },
    },
  },
  {
    accessorKey: "updater",
    header: "最后修改人",
    meta: {
      class: {
        th: `${cellThClass} w-[100px] min-w-[80px]`,
        td: `${cellTdClass} w-[100px] min-w-[80px]`,
      },
    },
  },
  {
    accessorKey: "modifydate",
    header: "修改时间",
    meta: {
      class: {
        th: `${cellThClass} w-[150px] min-w-[130px]`,
        td: `${cellTdClass} w-[150px] min-w-[130px] text-muted`,
      },
    },
  },
  {
    accessorKey: "remark",
    header: "备注",
    meta: {
      class: {
        th: `${cellThClass} w-[200px] min-w-[150px]`,
        td: `${cellTdClass} w-[200px] min-w-[150px] truncate`,
      },
    },
  },
];

function previewImages(images, index = 0) {
  lightboxImgs.value = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!lightboxImgs.value.length) return;
  lightboxIndex.value = Math.min(index, lightboxImgs.value.length - 1);
  lightboxVisible.value = true;
}

function handleFileChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  enqueueUploadFiles(files);
}

const MAX_UPLOAD_COUNT = 6;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;
let uploadQueuePromise = null;

function uploadStatusLabel(status) {
  return {
    queued: "等待上传",
    uploading: "上传中",
    failed: "上传失败",
  }[status] || status;
}

function enqueueUploadFiles(files) {
  if (!files.length) return;

  const available = MAX_UPLOAD_COUNT - usedUploadSlots.value;
  if (available <= 0) {
    toast.add({ title: "最多只允许上传 6 张图片", color: "error" });
    return;
  }

  const validFiles = [];
  for (const file of files) {
    if (!file.type?.startsWith("image/")) {
      toast.add({ title: `${file.name} 不是支持的图片格式`, color: "warning" });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.add({ title: `${file.name} 超过 10MB，无法上传`, color: "warning" });
      continue;
    }
    validFiles.push(file);
  }

  if (validFiles.length > available) {
    toast.add({ title: `剩余只能上传 ${available} 张图片`, color: "warning" });
  }

  for (const file of validFiles.slice(0, available)) {
    uploadTasks.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      error: "",
      cancelled: false,
    });
  }
  processUploadQueue();
}

async function uploadSingleTask(task) {
  task.status = "uploading";
  task.error = "";
  try {
    const body = new FormData();
    body.append("file", task.file);
    const response = await uploadImages(body);
    if (task.cancelled) return;
    if (response.code !== 200 || !response.msg) {
      throw new Error(response.msg || "服务器未返回图片路径");
    }
    form.value.imgPaths.push(resolveProfileImageUrl(response.msg));
    removeUploadTask(task);
  } catch (error) {
    if (task.cancelled) return;
    task.status = "failed";
    task.error = error?.message || "上传失败";
    toast.add({ title: `${task.file.name} 上传失败，可点击重试`, color: "error" });
  }
}

function processUploadQueue() {
  if (uploadQueuePromise) return uploadQueuePromise;
  const worker = async () => {
    while (true) {
      const task = uploadTasks.value.find((item) => item.status === "queued");
      if (!task) return;
      await uploadSingleTask(task);
    }
  };
  uploadQueuePromise = Promise.all(
    Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()),
  ).finally(() => {
    uploadQueuePromise = null;
    if (uploadTasks.value.some((task) => task.status === "queued")) {
      processUploadQueue();
    }
  });
  return uploadQueuePromise;
}

function retryUpload(task) {
  task.status = "queued";
  task.error = "";
  processUploadQueue();
}

function removeUploadTask(task) {
  const index = uploadTasks.value.findIndex((item) => item.id === task.id);
  if (index === -1) return;
  URL.revokeObjectURL(uploadTasks.value[index].previewUrl);
  uploadTasks.value.splice(index, 1);
}

function clearUploadTasks() {
  for (const task of uploadTasks.value) {
    task.cancelled = true;
    URL.revokeObjectURL(task.previewUrl);
  }
  uploadTasks.value = [];
}

const daterangeCreatedate = ref([]);
const daterangeModifydate = ref([]);
const selectedRows = ref({});
let lastCheckedIndex = null;

// 以选中行数据本身取 id，不按索引回查，避免排序/翻页后错位
function onSelectionChange(rows) {
  const list = Array.isArray(rows) ? rows : [];
  ids.value = list.map((item) => item.id);
  currentRowId.value = list.length === 1 ? list[0].id : null;
  single.value = list.length !== 1;
  multiple.value = !list.length;
}

function handleCheckboxClick(row, event) {
  event.stopPropagation();
  const currentIndex = row.index;
  const isSelected = row.getIsSelected();
  const nextState = !isSelected;

  if (event.shiftKey && lastCheckedIndex !== null) {
    const start = Math.min(lastCheckedIndex, currentIndex);
    const end = Math.max(lastCheckedIndex, currentIndex);

    const newSelection = { ...selectedRows.value };
    for (let i = start; i <= end; i++) {
      if (nextState) {
        newSelection[i] = true;
      } else {
        delete newSelection[i];
      }
    }
    selectedRows.value = newSelection;
  } else {
    const newSelection = { ...selectedRows.value };
    if (nextState) {
      newSelection[currentIndex] = true;
    } else {
      delete newSelection[currentIndex];
    }
    selectedRows.value = newSelection;
  }
  lastCheckedIndex = currentIndex;
}

const restaurants = ref([]);
const restaurants1 = ref([]);
const handlerHistory = ref([]);
const HANDLER_HISTORY_KEY = "tk_pic_handler_history";
const MAX_HANDLER_HISTORY = 12;
const handlerOptions = computed(() =>
  [
    ...new Set(
      [
        ...handlerHistory.value,
        ...restaurants.value.map((item) => item.value),
      ].filter(Boolean),
    ),
  ],
);
const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 100,
    flowno: null,
    materialno: null,
    materialname: null,
    specification: null,
    imgPaths: null,
    mechineName: null,
    createdate: null,
    modifydate: null,
    xpdm: null,
    xpph: null,
    khdm: null,
    handler: null,
    creator: null,
    updater: null,
    result: null,
    testNumber: null,
    testCharge: null,
  },
  rules: {
    flowno: [{ required: true, message: "流程单号不能为空", trigger: "blur" }],
    mechineName: [
      { required: true, message: "机台号不能为空", trigger: "blur" },
    ],
    materialno: [
      { required: true, message: "物料编码不能为空", trigger: "blur" },
    ],
    result: [{ required: true, message: "判定结果不能为空", trigger: "blur" }],
    handler: [
      { required: true, message: "操作/技术员不能为空", trigger: "blur" },
    ],
    testNumber: [
      { required: true, message: "试验数量不能为空", trigger: "blur" },
    ],
    testCharge: [
      { required: true, message: "试验时机不能为空", trigger: "blur" },
    ],
  },
});
const { queryParams, form, rules } = toRefs(data);
let flowInfoTimer = null;
let flowInfoSeq = 0;
onMounted(() => {
  loadHandlerHistory();
  void prepareDialog();
  document.addEventListener("paste", handlePaste);
});
onUnmounted(() => {
  document.removeEventListener("paste", handlePaste);
  clearTimeout(flowInfoTimer);
  clearUploadTasks();
});
function getHandlerList_pic() {
  return getHandlerList().then((response) => {
    restaurants.value = [];
    for (var i = 0; i < response.length; i++) {
      restaurants.value.push({ value: response[i] });
    }
  });
}

function loadHandlerHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HANDLER_HISTORY_KEY) || "[]");
    handlerHistory.value = Array.isArray(saved)
      ? saved.filter((item) => typeof item === "string" && item.trim())
      : [];
  } catch {
    handlerHistory.value = [];
  }
}

function rememberHandler(handler) {
  const value = handler?.trim();
  if (!value) return;

  Cookies.set("pic_handler", value, { expires: 365 });
  handlerHistory.value = [
    value,
    ...handlerHistory.value.filter((item) => item !== value),
  ].slice(0, MAX_HANDLER_HISTORY);
  try {
    localStorage.setItem(HANDLER_HISTORY_KEY, JSON.stringify(handlerHistory.value));
  } catch {
    // Cookie still preserves the last-used handler when storage is unavailable.
  }
}
function getMechineList_pic() {
  return getMechineList().then((response) => {
    restaurants1.value = [];
    for (var i = 0; i < response.length; i++) {
      restaurants1.value.push({ value: response[i] });
    }
  });
}

function onFlownoKeyup() {
  clearTimeout(flowInfoTimer);
  flowInfoTimer = setTimeout(() => {
    void getFlowInfo();
  }, 400);
}

async function getFlowInfo() {
  const flowno = form.value.flowno?.trim();
  if (!flowno || flowno.length < 8) return;
  // 序号 guard：慢请求后回不覆盖新输入的查询结果
  const seq = ++flowInfoSeq;
  let obj;
  try {
    obj = (await getFlowBillInfo(flowno)) || {};
  } catch {
    // 全局拦截器已弹错，这里只吞掉，避免未处理 rejection
    return;
  }
  if (seq !== flowInfoSeq) return;
  const textOrNull = (value) => {
    if (value == null) return null;
    const text = String(Array.isArray(value) ? value[0] ?? "" : value).trim();
    return text || null;
  };
  const specification = textOrNull(obj.specification);
  form.value.materialno = textOrNull(obj.productId);
  form.value.materialname = textOrNull(obj.productName);
  form.value.specification = specification ? specification.split("/")[0] : null;
  form.value.xpdm = textOrNull(obj.xpxh);
  form.value.xpph = textOrNull(obj.xpph);
  form.value.khdm = textOrNull(obj.khdm);
  if (!form.value.materialno) {
    toast.add({ title: "未查到该流程单的物料信息，请检查单号", color: "warning" });
  }
}
function handlePaste(event) {
  if (!open.value) return;
  const imageFiles = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.type?.startsWith("image/"))
    .map((item, index) => {
      const blob = item.getAsFile();
      if (!blob) return null;
      const extension = blob.type.split("/")[1] || "png";
      return new File([blob], `clipboard-${Date.now()}-${index}.${extension}`, {
        type: blob.type,
      });
    })
    .filter(Boolean);
  if (imageFiles.length) {
    event.preventDefault();
    enqueueUploadFiles(imageFiles);
  }
}

function mapPicImageUrls(str) {
  return normalizeProfileImageList(str);
}

function buildPicQueryParams() {
  const params = { ...queryParams.value, params: {} };
  if (Array.isArray(daterangeCreatedate.value) && daterangeCreatedate.value.length === 2) {
    params.params.beginCreatedate = daterangeCreatedate.value[0];
    params.params.endCreatedate = daterangeCreatedate.value[1];
  }
  if (Array.isArray(daterangeModifydate.value) && daterangeModifydate.value.length === 2) {
    params.params.beginModifydate = daterangeModifydate.value[0];
    params.params.endModifydate = daterangeModifydate.value[1];
  }
  return params;
}

const {
  loading,
  list: picList,
  total,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listPic(buildPicQueryParams()).then((response) => response),
  beforeReset: () => {
    daterangeCreatedate.value = [];
    daterangeModifydate.value = [];
    selectedRows.value = {};
    lastCheckedIndex = null;
    queryPanelRef.value?.resetFields();
  },
  afterLoad: () => {
    picList.value = picList.value.map((row) => ({
      ...row,
      imgPaths: mapPicImageUrls(row.imgPaths),
      imgSrcPaths: mapPicImageUrls(row.imgSrcPaths),
    }));
    // 清空勾选会触发 selection-change，ids/按钮状态随之复位
    selectedRows.value = {};
    lastCheckedIndex = null;
  },
});

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  clearUploadTasks();
  form.value = {
    id: null,
    flowno: null,
    materialno: null,
    materialname: null,
    specification: null,
    imgPaths: [],
    mechineName: null,
    xpdm: null,
    xpph: null,
    khdm: null,
    handler: null,
    creator: null,
    updater: null,
    result: null,
    testNumber: null,
    testCharge: null,
    remark: null,
  };
  proxy.$refs.picRef?.clear?.();
}

let dialogOptionsPromise = null;

function prepareDialog() {
  if (!dialogOptionsPromise) {
    dialogOptionsPromise = Promise.allSettled([
      getHandlerList_pic(),
      getMechineList_pic(),
    ]).finally(() => {
      dialogOptionsPromise = null;
    });
  }
  return dialogOptionsPromise;
}

function focusFlowInput() {
  proxy.$nextTick(() => {
    proxy.$refs.dialog_flowno_input?.focus();
    proxy.$refs.dialog_flowno_input?.select();
  });
}

/** 新增按钮操作 */
async function handleAdd() {
  reset();
  form.value.handler = Cookies.get("pic_handler") || handlerHistory.value[0] || null;
  title.value = "添加弹坑实验记录";
  await prepareDialog();
  open.value = true;
  focusFlowInput();
}

/** 修改按钮操作，row-open 双击传原始行数据，工具栏调用时取当前选中 */
async function handleUpdate(row) {
  const _id = row?.id ?? ids.value[0];
  if (_id == null) {
    toast.add({ title: "请先选择一条要修改的数据", color: "warning" });
    return;
  }
  reset();
  const [response] = await Promise.all([
    getPic(_id),
    prepareDialog(),
  ]);
  form.value = response.data;
  const str = form.value.imgPaths;
  form.value.imgPaths = normalizeProfileImageList(str);
  open.value = true;
  title.value = "修改弹坑实验记录";
  focusFlowInput();
}
function uploadImgToServer() {
  if (isUploading.value) {
    toast.add({ title: "图片仍在上传，请稍后", color: "warning" });
    return;
  }
  const failedCount = uploadTasks.value.filter((task) => task.status === "failed").length;
  if (failedCount) {
    toast.add({ title: `还有 ${failedCount} 张图片上传失败，请重试或移除`, color: "error" });
    return;
  }
  submitForm();
}
/** 提交按钮 */
async function submitForm() {
  const valid = await proxy.$refs.picRef?.validate?.({ silent: true });
  if (!valid) return;

  const cleanPaths = (form.value.imgPaths || []).map((url) => {
    const idx = url.indexOf("/profile");
    return idx !== -1 ? url.substring(idx) : url;
  });
  // 只提交白名单字段，不把详情回显的 creator/updater/imgSrcPaths 等带上
  const payload = {
    flowno: form.value.flowno,
    materialno: form.value.materialno,
    materialname: form.value.materialname,
    specification: form.value.specification,
    remark: form.value.remark,
    imgPaths: cleanPaths.join(","),
    mechineName: form.value.mechineName,
    xpdm: form.value.xpdm,
    xpph: form.value.xpph,
    khdm: form.value.khdm,
    handler: form.value.handler,
    result: form.value.result,
    testNumber: form.value.testNumber,
    testCharge: form.value.testCharge,
  };

  if (form.value.id != null) {
    payload.id = form.value.id;
    await updatePic(payload);
    toast.add({ title: "修改成功", color: "success" });
  } else {
    await addPic(payload);
    toast.add({ title: "新增成功", color: "success" });
  }
  rememberHandler(payload.handler);
  open.value = false;
  await getList();
}

/** 删除按钮操作：为防止误操作，一次只能删除一条 */
function handleDelete(row) {
  const _id = row?.id ?? ids.value[0];
  if (_id == null) {
    toast.add({ title: "请先选择一条要删除的数据", color: "warning" });
    return;
  }
  if (ids.value.length > 1) {
    toast.add({
      title: "为防止误操作，一次只能删除一条数据",
      color: "warning",
    });
    return;
  }

  useModalConfirm()
    .confirm('是否确认删除弹坑图片编号为"' + _id + '"的数据项？')
    .then(function () {
      return delPic(_id);
    })
    .then(() => {
      getList();
      toast.add({ title: "删除成功", color: "success" });
    })
    .catch(() => {});
}

/** 按当前搜索条件导出，最大导出量为200条 */
function handleExport() {
  useModalConfirm()
    .confirm("是否按搜索条件导出，最大导出量为200条？", "警告", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      showclose: true, //是否显示右上角关闭按钮
      type: "warning", //提示类型
    })
    .then(function () {
      proxy.download(
        "tk_custom/pic/export",
        {
          ...buildPicQueryParams(),
        },
        `pic_${new Date().getTime()}.xlsx`,
      );
    })
    .catch(function (e) {});
}
function handleSelectExport() {
  if (!ids.value.length) {
    toast.add({ title: "请先选择要导出的数据", color: "warning" });
    return;
  }
  const str = ids.value.join(",");
  useModalConfirm()
    .confirm("是否按选中导出？", "警告", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      showclose: true, //是否显示右上角关闭按钮
      type: "warning", //提示类型
    })
    .then(function () {
      proxy.download(
        "tk_custom/pic/exportSelect",
        { ids: str },
        `pic_${new Date().getTime()}.xlsx`,
      );
    })
    .catch(function (e) {});
}

function formatXpphCount(xpph) {
  if (!xpph || typeof xpph !== "string") return 0;
  const parts = xpph.split(/[/,，、\s]+/).filter(Boolean);
  return parts.length;
}

getList();
</script>
<style>
.pic-search-panel.tk-search-panel {
  padding: 0.625rem !important;
}

.my-cell .cell {
  display: flex;
  overflow: auto;
  box-sizing: border-box;
  line-height: 23px;
  overflow-wrap: break-word;
  padding: 0 12px;
  text-overflow: ellipsis;
  white-space: normal;
}
#mytable {
  height: calc(100vh - 230px);
}
</style>
