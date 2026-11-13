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
          <UFormField label="发送状态" name="isSend" class="text-sm font-semibold">
            <USelectMenu
              v-model="queryParams.isSend"
              :items="[
                { label: '全部状态', value: '' },
                { label: '待发送', value: '0' },
                { label: '已发送', value: '1' }
              ]"
              value-attribute="value"
              option-attribute="label"
              placeholder="发送状态"
              class="w-full sm:w-[130px]"
            />
          </UFormField>

          <UFormField label="创建时间" name="createtime" class="text-sm font-semibold">
            <UPopover v-model:open="queryPopoverOpen">
              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-calendar"
                class="w-full sm:w-44 justify-between text-left font-normal"
              >
                {{ queryParams.createtime || '选择创建时间' }}
              </UButton>
              <template #content>
                <div class="p-2">
                  <UCalendar v-model="queryCreatetimeValue" />
                  <div v-if="queryParams.createtime" class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 flex justify-end">
                    <UButton size="xs" color="neutral" variant="ghost" @click="queryParams.createtime = null; queryPopoverOpen = false">
                      清空
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </UFormField>

          <UFormField label="关联源单 ID" name="parentid" class="text-sm font-semibold">
            <UInput
              v-model="queryParams.parentid"
              placeholder="源单 ID"
              clearable
              @keyup.enter="handleQuery"
              class="w-full sm:w-[180px] font-mono"
            />
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
          @click="handleUpdate(null)"
        >修改</UButton>
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :disabled="multiple"
          @click="handleDelete(null)"
        >删除</UButton>
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-download"
          @click="handleExport"
        >导出</UButton>
      </div>
      <template #trailing>
        <right-toolbar
          v-model:showSearch="showSearch"
          @queryTable="getList"
        ></right-toolbar>
      </template>
    </TkToolbar>

    <!-- 数据列表表格 -->
    <UCard shadow="never" class="border border-gray-200/80 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
      <div class="overflow-x-auto">
        <TkUTable
          v-model:row-selection="selectedRows"
          :loading="loading"
          :data="msgtowxList"
          :columns="msgtowxColumns"
          @selection-change="handleSelectionChange"
          @row-open="handleUpdate"
          class="flex-1"
        >
          <!-- 消息类型徽章 -->
          <template #type-cell="{ row }">
            <UBadge v-if="row.original.type === '匿名意见'" color="primary" variant="subtle">
              {{ row.original.type }}
            </UBadge>
            <UBadge v-else-if="row.original.type === '库存预警'" color="warning" variant="subtle">
              {{ row.original.type }}
            </UBadge>
            <UBadge v-else color="neutral" variant="subtle">
              {{ row.original.type || '未定义' }}
            </UBadge>
          </template>

          <!-- 发送状态徽章 -->
          <template #isSend-cell="{ row }">
            <UBadge v-if="row.original.isSend === '1'" color="success" variant="subtle" icon="i-lucide-circle-check">
              已发送
            </UBadge>
            <UBadge v-else-if="row.original.isSend === '0'" color="warning" variant="subtle" icon="i-lucide-clock">
              待发送
            </UBadge>
            <UBadge v-else color="neutral" variant="subtle">
              {{ row.original.isSend }}
            </UBadge>
          </template>

          <!-- 时间格式化 -->
          <template #createtime-cell="{ row }">
            <span>{{ parseTime(row.original.createtime, "{y}-{m}-{d} {h}:{i}") }}</span>
          </template>

          <!-- 行内操作按钮 -->
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2 justify-center">
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
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加与修改消息对话框 -->
    <UModal v-model:open="open" :title="title">
      <template #body>
        <UForm ref="msgtowxRef" :state="form" class="space-y-4">
          <UFormField label="发送状态" name="isSend" class="text-sm font-semibold">
            <USelectMenu
              v-model="form.isSend"
              :items="[
                { label: '待发送', value: '0' },
                { label: '已发送', value: '1' }
              ]"
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormField>

          <UFormField label="消息类型" name="type" class="text-sm font-semibold">
            <UInput v-model="form.type" placeholder="如：匿名意见、库存预警" class="w-full" />
          </UFormField>

          <UFormField label="接收人 WeCom ID(s)" name="receiverIds" class="text-sm font-semibold">
            <UTextarea v-model="form.receiverIds" placeholder="多位接收人请以英文逗号 , 隔开" :rows="2" class="w-full" />
          </UFormField>

          <UFormField label="关联源单 ID" name="parentid" class="text-sm font-semibold">
            <UInput v-model="form.parentid" placeholder="业务表主键关联 ID" class="w-full font-mono" />
          </UFormField>

          <UFormField label="推送消息内容" name="msg" class="text-sm font-semibold">
            <UTextarea v-model="form.msg" placeholder="请输入具体的企微推送文本内容..." :rows="4" class="w-full" />
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

<script setup name="Msgtowx">
import { useTkRowInteraction } from "@ctk-system/composables";
import { useTkListQuery } from "@ctk-system/composables";
import { parseDate } from "@internationalized/date";

const toast = useToast();
const msgtowxRef = ref(null);

const { proxy } = getCurrentInstance();

const queryPanelRef = ref();
const tkDataTableRef = ref();
const currentRowId = ref(null);

const open = ref(false);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const title = ref("");
const selectedRows = ref({});

const queryPopoverOpen = ref(false);

const queryCreatetimeValue = computed({
  get() {
    if (!queryParams.value.createtime) return null;
    try {
      return parseDate(queryParams.value.createtime);
    } catch {
      return null;
    }
  },
  set(val) {
    if (!val) {
      queryParams.value.createtime = null;
    } else {
      queryParams.value.createtime = val.toString();
    }
    queryPopoverOpen.value = false;
  }
});

const msgtowxColumns = [
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
    "accessorKey": "type",
    "header": "消息类型",
    "meta": {
      "class": {
        "td": "text-center w-[120px]"
      }
    }
  },
  {
    "accessorKey": "isSend",
    "header": "发送状态",
    "meta": {
      "class": {
        "td": "text-center w-[100px]"
      }
    }
  },
  {
    "accessorKey": "msg",
    "header": "消息内容",
    "meta": {
      "class": {
        "td": "max-w-md truncate"
      }
    }
  },
  {
    "accessorKey": "receiverIds",
    "header": "接收人 ID(s)",
    "meta": {
      "class": {
        "td": "max-w-[150px] truncate font-mono"
      }
    }
  },
  {
    "accessorKey": "parentid",
    "header": "源单 ID",
    "meta": {
      "class": {
        "td": "text-center font-mono text-gray-400 max-w-[120px] truncate"
      }
    }
  },
  {
    "accessorKey": "createtime",
    "header": "创建时间",
    "meta": {
      "class": {
        "td": "text-center w-[150px]"
      }
    }
  },
  {
    "accessorKey": "actions",
    "header": "操作",
    "meta": {
      "class": {
        "td": "text-center w-[160px]"
      }
    }
  }
];

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    type: null,
    isSend: null,
    receiverIds: null,
    createtime: null,
    parentid: null,
    msg: null,
  },
  rules: {},
});

const { queryParams, form, rules } = toRefs(data);

const {
  loading,
  list: msgtowxList,
  total,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listMsgtowx(queryParams.value).then((response) => response),
  beforeReset: () => queryPanelRef.value?.resetFields(),
});

const { handleSelectionChange } =
  useTkRowInteraction({
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
    type: null,
    isSend: null,
    receiverIds: null,
    createtime: null,
    parentid: null,
    msg: null,
  };
  proxy.resetForm("msgtowxRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加发送到企微的消息队列";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _id = row.id || ids.value;
  getMsgtowx(_id).then((response) => {
    form.value = response.data;
    open.value = true;
    title.value = "修改发送到企微的消息队列";
  });
}

/** 提交按钮 */
async function submitForm() {
  try {
    await msgtowxRef.value?.validate?.();
  } catch (_) {
    return;
  }
  if (form.value.id != null) {
    updateMsgtowx(form.value).then((response) => {
      toast.add({ title: "修改成功", color: "success" });
      open.value = false;
      getList();
    });
  } else {
    addMsgtowx(form.value).then((response) => {
      toast.add({ title: "新增成功", color: "success" });
      open.value = false;
      getList();
    });
  }
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _ids = row.id || ids.value;
  useModalConfirm()
    .confirm('是否确认删除发送到企微的消息队列编号为"' + _ids + '"的数据项？')
    .then(function () {
      return delMsgtowx(_ids);
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
    "tk_custom/msgtowx/export",
    {
      ...queryParams.value,
    },
    `msgtowx_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>
