<template>
  <div class="app-container absolute inset-0 overflow-y-auto p-4 md:px-6 md:pt-6 md:pb-4 flex flex-col gap-3 bg-gray-50 dark:bg-gray-900">
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      :show-search="showSearch"
      class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <UPopover v-model:open="pdDateOpen">
          <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
            <span :class="queryParams.pdDate ? '' : 'text-dimmed'">{{ queryParams.pdDate || '请选择盘点时间' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="pdDateValue" locale="zh-CN" /></div>
          </template>
        </UPopover>

        <USelect
          v-model="queryParams.process"
          :items="tk_pd"
          placeholder="请选择盘点工序"
          clearable
          class="w-full"
        />

        <UInput
          v-model="queryParams.flowNo"
          placeholder="请输入流程单号"
          clearable
          class="w-full"
        />

        <UInput
          v-model="queryParams.productId"
          placeholder="请输入产品编码"
          clearable
          @keyup.enter="handleQuery"
          class="w-full"
        />

        <UInput
          v-model="queryParams.productName"
          placeholder="请输入产品名称"
          clearable
          @keyup.enter="handleQuery"
          class="w-full"
        />

        <UInput
          v-model="queryParams.specification"
          placeholder="请输入规格型号"
          clearable
          @keyup.enter="handleQuery"
          class="w-full"
        />

        <div class="flex items-center justify-end gap-2 sm:col-span-2 md:col-span-3 lg:col-span-2 w-full">
          <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="resetQuery">重置</UButton>
        </div>
      </div>
    </TkSearchPanel>

    <TkToolbar class="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-plus"
          @click="handleAdd"
          >新增</UButton
        >
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-trash-2"
          :disabled="multiple"
          @click="handleDelete"
          >删除</UButton
        >
        <UButton
          color="warning"
          variant="soft"
          size="sm"
          icon="i-lucide-download"
          @click="handleExport"
          >导出</UButton
        >
      </div>

      <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-lg bg-primary-50 px-2.5 py-2 dark:bg-primary-950/30">
        <div class="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300">
          <UIcon name="i-lucide-qr-code" class="size-4" />
          <span>快速扫码盘点</span>
        </div>
        <USelect
          v-model="t_process"
          :items="tk_pd"
          placeholder="选择录入工序"
          aria-label="快速盘点录入工序"
          class="w-36"
        />
        <UInput
          v-model="t_flowNo"
          placeholder="扫描流程单号后自动录入"
          aria-label="扫码录入流程单号"
          clearable
          ref="mainpageFlowNo"
          @keyup.enter="queryByFlowNo"
          class="w-56"
        />
      </div>

    </TkToolbar>

    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex-1 flex flex-col">
      <TkUTable
        ref="tkDataTableRef"
        v-model:row-selection="selectedRows"
        :loading="loading"
        :data="pdList"
        :columns="pdColumns"
        @row-open="handleUpdate"
        class="flex-1"
      >
        <template #pdDate-cell="{ row }">
          <span>{{ parseTime(row.original.pdDate, "{y}-{m}-{d}") }}</span>
        </template>
        <template #process-cell="{ row }">
          <dict-tag :options="tk_pd" :value="row.original.process" />
        </template>
        <template #processStatus-cell="{ row }">
          <UBadge v-if="String(row.original.processStatus) === '1'" color="success">已完成</UBadge>
          <UBadge v-else color="warning">进行中</UBadge>
        </template>
        <template #actions-cell="{ row }">
          <UButton variant="link" color="primary" size="xs" icon="i-lucide-square-pen" @click="handleUpdate(row.original)">修改</UButton>
        </template>
      </TkUTable>
    </div>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
      class="mt-auto shrink-0"
    />

    <UModal
      v-model:open="open"
      :title="title"
      :ui="{ content: 'max-w-3xl' }"
      :content="{ onOpenAutoFocus: handleModalOpenAutoFocus }"
      @after:enter="focusPdNumber"
    >
      <template #body>
        <UForm ref="pdRef" :state="form" :rules="rules" class="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
          <UFormField label="是否分单" name="isSplitBill">
            <USelect v-model="form.isSplitBill" :items="isSplitBillOptions" class="w-full" />
          </UFormField>

          <UFormField label="库存数量" name="number">
            <UInput
              v-model="form.number"
              placeholder="请输入库存数量"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="盘点数量" name="pdNumber">
            <UInput
              ref="pdNumberRef"
              v-model="form.pdNumber"
              @keydown.enter.prevent.stop="submitForm"
              placeholder="请输入盘点数量"
              class="w-full"
            />
          </UFormField>

          <UFormField label="盘点工序" name="process">
            <USelect
              v-model="form.process"
              :items="tk_pd"
              placeholder="请选择盘点工序"
              :disabled="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="流程单号" name="flowNo">
            <UInput
              v-model="form.flowNo"
              placeholder="请输入流程单号"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="产品编码" name="productId">
            <UInput
              v-model="form.productId"
              placeholder="请输入产品编码"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="产品名称" name="productName">
            <UInput
              v-model="form.productName"
              placeholder="请输入产品名称"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="规格型号" name="specification">
            <UInput
              v-model="form.specification"
              placeholder="请输入规格型号"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="批号" name="lot">
            <UInput
              v-model="form.lot"
              placeholder="请输入批号"
              :readonly="isEdit"
              class="w-full"
            />
          </UFormField>

          <UFormField label="工序状态" name="processStatus">
            <USelect v-model="form.processStatus" :items="processStatusOptions" class="w-full" />
          </UFormField>

          <UFormField label="备注" name="remark" class="md:col-span-2">
            <UTextarea
              v-model="form.remark"
              placeholder="请输入备注内容"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" size="sm" @click="cancel">取 消</UButton>
        <UButton color="primary" size="sm" @click="submitForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Pd">
import { useTkListQuery } from "@ctk-system/composables";
import { useDict } from "@/utils/dict";
const toast = useToast();
const UCheckbox = resolveComponent("UCheckbox");

const pdColumns = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value) => table.toggleAllPageRowsSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: 'Select all',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value) => row.toggleSelected(!!value),
        onClick: (e) => e.stopPropagation(),
        ariaLabel: 'Select row',
      }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "flowNo",
    header: "流程单号",
    cell: ({ row }) => h("span", { class: "font-mono font-medium text-gray-700 dark:text-gray-300" }, row.original.flowNo ?? ""),
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "productId",
    header: "产品编码",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "productName",
    header: "产品名称",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "specification",
    header: "规格型号",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "lot",
    header: "批号",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "number",
    header: "库存数量",
    cell: ({ row }) => h("span", { class: "font-mono font-medium text-gray-900 dark:text-gray-100" }, row.original.number ?? 0),
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "pdNumber",
    header: "盘点数量",
    cell: ({ row }) => h("span", { class: "font-mono font-semibold text-primary-600 dark:text-primary-400" }, row.original.pdNumber ?? 0),
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "remark",
    header: "备注",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
  {
    accessorKey: "pdDate",
    header: "盘点时间",
    size: 180,
    cell: "pdDate",
    meta: {
      class: {
        td: "text-center",
      },
    },
    slotBody:
      '          <span>{{ parseTime(row.pdDate, "{y}-{m}-{d}") }}</span>',
  },
  {
    accessorKey: "process",
    header: "盘点工序",
    cell: "process",
    meta: {
      class: {
        td: "text-center",
      },
    },
    slotBody: '          <dict-tag :options="tk_pd" :value="row.process" />',
  },
  {
    accessorKey: "processStatus",
    header: "工序状态",
    cell: "processStatus",
    meta: {
      class: {
        td: "text-center",
      },
    },
    slotBody:
      '          <UBadge v-if="String(row.processStatus) === \'1\'" color="success">已完成</UBadge>\n          <UBadge v-else color="warning">进行中</UBadge>',
  },
  {
    accessorKey: "actions",
    header: "操作",
    cell: "actions",
    meta: {
      class: {
        td: "text-center",
      },
    },
  },
];
const { proxy } = getCurrentInstance();

const queryPanelRef = ref();
const tkDataTableRef = ref();
const pdNumberRef = ref(null);
const currentRowId = ref(null);
const selectedRows = ref({});

const { tk_pd } = useDict("tk_pd");
const open = ref(false);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
const t_process = ref("");
const t_flowNo = ref("");
const isEdit = ref(false);
const lastProcessStatus = ref("0");
const isSplitBillOptions = computed(() => [
  { label: "是", value: "1" },
  { label: "否", value: "0" },
]);
const processStatusOptions = computed(() => [
  { label: "进行中", value: "0" },
  { label: "已完成", value: "1" },
]);
const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    pdDate: null,
    process: null,
    flowNo: null,
    productId: null,
    productName: null,
    specification: null,
    lot: null,
  },
  rules: {
    pdNumber: [
      { required: true, message: "盘点数量不能为空", trigger: "blur" },
    ],
  },
});

const { queryParams, form, rules } = toRefs(data);

// UCalendar 日期选择（原生 type="date" 替换）
import { parseDate } from "@internationalized/date";

const pdDateOpen = ref(false);
const pdDateValue = computed({
  get() {
    if (!queryParams.value.pdDate) return null;
    try { return parseDate(String(queryParams.value.pdDate).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    queryParams.value.pdDate = val ? val.toString() : null;
    pdDateOpen.value = false;
  },
});
// 对话框打开与关闭时的处理
function dialogOpen() {
  proxy.$nextTick(() => {
    window.setTimeout(() => {
      focusPdNumber();
    }, 100);
  });
}
function focusPdNumber() {
  const component = pdNumberRef.value;
  const exposedInput = component?.inputRef;
  const input = typeof exposedInput?.focus === "function"
    ? exposedInput
    : exposedInput?.value
      ?? (component?.$el instanceof HTMLInputElement ? component.$el : component?.$el?.querySelector?.("input"));
  input?.focus?.();
  input?.select?.();
}
function handleModalOpenAutoFocus(event) {
  event.preventDefault();
  proxy.$nextTick(focusPdNumber);
}
function dialogClose() {
  proxy.$nextTick(() => {
    proxy.$refs.mainpageFlowNo?.focus?.();
    proxy.$refs.mainpageFlowNo?.select?.();
  });
}

//根据流程单号查询
function queryByFlowNo() {
  if (!t_process.value)
    return toast.add({
      title: "请先选择盘点工序，再重扫描！",
      color: "warning",
    });
  if (!t_flowNo.value || t_flowNo.value.length < 8) return;
  isEdit.value = false;
  getPdFromKingdee(t_flowNo.value).then((response) => {
    var data = response.data;
    if (!data) return toast.add({ title: "找不到数据！", color: "error" });
    reset();
    form.value = data;
    if (data.isUpdatePdData) {
      isEdit.value = true;
      open.value = true;
      title.value = "修改盘点信息";
      toast.add({
        title: `该单已盘点（${data.pdDate || "近期"}，盘点数 ${data.pdNumber ?? "—"}），当前为修改模式，提交将覆盖原记录`,
        color: "warning",
        duration: 6000,
      });
    } else {
      isEdit.value = false;
      open.value = true;
      form.value.pdNumber = form.value.number;
      form.value.isSplitBill = "0";
      if (form.value.processStatus == null) {
        form.value.processStatus = lastProcessStatus.value || "0";
      }
      title.value = "添加盘点信息";
    }
    form.value.process = t_process.value;
    t_flowNo.value = "";
  });
}
const {
  loading,
  list: pdList,
  total,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listPd(queryParams.value).then((response) => response),
  beforeReset: () => queryPanelRef.value?.resetFields(),
});

watch(selectedRows, (newVal) => {
  const selectedList = [];
  if (newVal) {
    Object.keys(newVal).forEach((indexStr) => {
      if (newVal[indexStr]) {
        const idx = parseInt(indexStr, 10);
        const row = pdList.value[idx];
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
}, { deep: true });

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  form.value = {
    id: null,
    pdDate: null,
    process: null,
    flowNo: null,
    productId: null,
    productName: null,
    specification: null,
    lot: null,
    number: null,
    pdNumber: null,
    remark: null,
    isSplitBill: "0",
    processStatus: lastProcessStatus.value || "0",
  };
  proxy.resetForm("pdRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  isEdit.value = false;
  open.value = true;
  title.value = "添加盘点信息";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  isEdit.value = true;
  const _id = row?.id ?? ids.value?.[0];

  getPd(_id)
    .then((response) => {
      form.value = response.data;
      open.value = true;
      title.value = "修改盘点信息";
    })
    .catch(() => {
      toast.add({ title: "获取盘点信息失败", color: "error" });
    });
}

/** 提交按钮 */
async function submitForm(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  try {
    await proxy.$refs["pdRef"]?.validate();
  } catch {
    return;
  }

  if (form.value.id != null && form.value.isSplitBill != "1") {
    updatePd(form.value).then((response) => {
      toast.add({ title: response?.msg || "修改成功", color: "success" });
      open.value = false;
      getList();
    });
  } else {
    addPd(form.value).then((response) => {
      // 服务端查重覆盖时会如实返回覆盖消息，必须原样展示，不能前端写死"新增成功"
      const overwritten = response?.msg && response.msg !== "操作成功";
      toast.add({ title: overwritten ? response.msg : "新增成功", color: overwritten ? "warning" : "success" });
      open.value = false;
      getList();
    });
  }
}

watch(
  () => form.value.processStatus,
  (value) => {
    if (value != null) {
      lastProcessStatus.value = value;
    }
  },
);

watch(open, (newVal) => {
  if (newVal) {
    dialogOpen();
  } else {
    dialogClose();
  }
});

/** 删除按钮操作 */
function handleDelete(row) {
  const _ids = row.id || ids.value;
  useModalConfirm()
    .confirm('是否确认删除盘点编号为"' + _ids + '"的数据项？')
    .then(function () {
      return delPd(_ids);
    })
    .then(() => {
      getList();
      toast.add({ title: "删除成功", color: "success" });
    })
    .catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download(
    "tk_custom/pd/export",
    {
      ...queryParams.value,
    },
    `pd_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
