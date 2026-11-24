<template>
  <div class="app-container p-6 pb-4 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 overflow-y-auto">
    <!-- 顶端过滤面板 -->
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      :show-search="showSearch"
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
    >
      <div class="px-5 py-4 w-full">
        <UForm :state="queryParams" class="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap w-full">
          <UFormField label="提交时间" name="suggestTime" class="text-sm font-semibold">
            <UPopover v-model:open="queryPopoverOpen">
              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-calendar"
                class="w-full sm:w-44 justify-between text-left font-normal"
              >
                {{ queryParams.suggestTime || '选择提交时间' }}
              </UButton>
              <template #content>
                <div class="p-2">
                  <UCalendar v-model="querySuggestTimeValue" />
                  <div v-if="queryParams.suggestTime" class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 flex justify-end">
                    <UButton size="xs" color="neutral" variant="ghost" @click="queryParams.suggestTime = null; queryPopoverOpen = false">
                      清空
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </UFormField>
          
          <div class="flex items-center gap-2 sm:ml-auto">
            <UButton color="primary" icon="i-lucide-search" @click="handleQuery">搜索</UButton>
            <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="resetQuery">重置</UButton>
          </div>
        </UForm>
      </div>
    </TkSearchPanel>

    <!-- 工具按钮栏 -->
    <TkToolbar>
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          color="primary"
          variant="subtle"
          icon="i-lucide-plus"
          @click="handleAdd"
        >新增</UButton>
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-square-pen"
          :disabled="single"
          @click="handleUpdate"
        >修改</UButton>
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :disabled="multiple"
          @click="handleDelete"
        >删除</UButton>
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-download"
          @click="handleExport"
        >导出</UButton>
      </div>
    </TkToolbar>

    <!-- 数据列表表格 -->
    <UCard shadow="never" class="border border-gray-200/80 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
      <div class="overflow-x-auto">
        <TkUTable
          v-model:row-selection="selectedRows"
          :loading="loading"
          :data="suggestList"
          :columns="suggestColumns"
          @selection-change="handleSelectionChange"
          @row-open="handleUpdate"
          class="w-full"
        >
          <!-- 建议内容单元格（换行支持与美化） -->
          <template #suggestText-cell="{ row }">
            <span class="whitespace-pre-wrap text-gray-800 dark:text-gray-200 text-[13px] leading-relaxed">
              {{ row.original.suggestText }}
            </span>
          </template>

          <!-- 提交时间单元格（从 row.original 读取） -->
          <template #suggestTime-cell="{ row }">
            <span class="font-mono text-gray-600 dark:text-gray-400">
              {{ parseTime(row.original.suggestTime, '{y}-{m}-{d}') }}
            </span>
          </template>

          <!-- 操作单元格（从 row.original 读取） -->
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-1 justify-center">
              <UButton
                variant="ghost"
                color="primary"
                icon="i-lucide-square-pen"
                size="xs"
                @click="handleUpdate(row.original)"
              >修改</UButton>
              <UButton
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                size="xs"
                @click="handleDelete(row.original)"
              >删除</UButton>
            </div>
          </template>
        </TkUTable>
      </div>
    </UCard>
    
    <!-- 分页器 -->
    <pagination
      v-slot="{ page, limit }"
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加与修改意见对话框 -->
    <UModal v-model:open="open" :title="title">
      <template #body>
        <UForm ref="suggestRef" :state="form" class="space-y-4">
          <UFormField label="意见/建议内容" name="suggestText" required class="text-sm font-semibold">
            <UTextarea
              v-model="form.suggestText"
              placeholder="请输入您宝贵的建议或意见内容..."
              :rows="4"
              class="w-full"
            />
          </UFormField>
          <UFormField label="提交时间" name="suggestTime" required class="text-sm font-semibold">
            <UPopover v-model:open="formPopoverOpen" class="w-full">
              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-calendar"
                class="w-full justify-between text-left font-normal"
              >
                {{ form.suggestTime || '选择提交时间' }}
              </UButton>
              <template #content>
                <div class="p-2">
                  <UCalendar v-model="formSuggestTimeValue" />
                  <div v-if="form.suggestTime" class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 flex justify-end">
                    <UButton size="xs" color="neutral" variant="ghost" @click="form.suggestTime = null; formPopoverOpen = false">
                      清空
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="cancel">取 消</UButton>
          <UButton color="primary" @click="submitForm">确 定</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Suggest">
import { useTkRowInteraction } from "@ctk-system/composables";
import { useTkListQuery } from "@ctk-system/composables";
import { parseDate } from "@internationalized/date";

const toast = useToast();
const suggestRef = ref(null);
const queryPanelRef = ref();
const tkDataTableRef = ref();
const currentRowId = ref(null);
const selectedRows = ref({});
const open = ref(false);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");

const queryPopoverOpen = ref(false);
const formPopoverOpen = ref(false);

const querySuggestTimeValue = computed({
  get() {
    if (!queryParams.value.suggestTime) return null;
    try {
      return parseDate(queryParams.value.suggestTime);
    } catch {
      return null;
    }
  },
  set(val) {
    if (!val) {
      queryParams.value.suggestTime = null;
    } else {
      queryParams.value.suggestTime = val.toString();
    }
    queryPopoverOpen.value = false;
  }
});

const formSuggestTimeValue = computed({
  get() {
    if (!form.value.suggestTime) return null;
    try {
      const dStr = form.value.suggestTime.substring(0, 10);
      return parseDate(dStr);
    } catch {
      return null;
    }
  },
  set(val) {
    if (!val) {
      form.value.suggestTime = null;
    } else {
      form.value.suggestTime = val.toString();
    }
    formPopoverOpen.value = false;
  }
});

const suggestColumns = [
  {
    "accessorKey": "id",
    "header": "ID",
    "meta": {
      "class": {
        "td": "text-center font-mono text-gray-500 max-w-[120px] truncate"
      }
    }
  },
  {
    "accessorKey": "suggestText",
    "header": "意见/建议内容",
    "meta": {
      "class": {
        "td": "text-left"
      }
    }
  },
  {
    "accessorKey": "suggestTime",
    "header": "建议提交时间",
    "size": 180,
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "actions",
    "header": "操作",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  }
];

const { proxy } = getCurrentInstance();

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    suggestText: null,
    suggestTime: null
  },
  rules: {}
});

const { queryParams, form, rules } = toRefs(data);

const { loading, list: suggestList, total, getList, handleQuery, resetQuery } = useTkListQuery({
  queryParams,
  fetchList: () => listSuggest(queryParams.value).then((response) => response),
  beforeReset: () => queryPanelRef.value?.resetFields(),
});

const { handleSelectionChange } = useTkRowInteraction({
  getTableRef: () => tkDataTableRef.value?.tableRef,
  currentRowId,
  ids,
  single,
  multiple,
  onRowOpen: (row) => handleUpdate(row),
});

// 取消按钮
function cancel() {
  open.value = false;
  reset();
}

// 表单重置
function reset() {
  form.value = {
    id: null,
    suggestText: null,
    suggestTime: parseTime(new Date(), '{y}-{m}-{d}') // 默认当前时间方便用户录入
  };
  proxy.resetForm("suggestRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加意见/建议";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _id = row?.id || ids.value[0];
  getSuggest(_id).then(response => {
    form.value = response.data;
    // 格式化日期为 YYYY-MM-DD
    if (form.value.suggestTime) {
      form.value.suggestTime = parseTime(form.value.suggestTime, '{y}-{m}-{d}');
    }
    open.value = true;
    title.value = "修改意见/建议";
  });
}

/** 提交按钮 */
async function submitForm() {
  try {
    await suggestRef.value?.validate?.();
  } catch (_) {
    return;
  }
  
  if (form.value.id != null) {
    updateSuggest(form.value).then(() => {
      toast.add({ title: "修改成功", color: "success" });
      open.value = false;
      getList();
    });
  } else {
    addSuggest(form.value).then(() => {
      toast.add({ title: "新增成功", color: "success" });
      open.value = false;
      getList();
    });
  }
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _ids = row?.id || ids.value;
  useModalConfirm().confirm('是否确认删除意见/建议编号为"' + _ids + '"的数据项？').then(function() {
    return delSuggest(_ids);
  }).then(() => {
    getList();
    toast.add({ title: "删除成功", color: "success" });
  }).catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download('tk_custom/suggest/export', {
    ...queryParams.value
  }, `suggest_${new Date().getTime()}.xlsx`)
}

getList();
</script>
