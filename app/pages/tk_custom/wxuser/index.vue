<template>
  <div
    class="app-container p-6 pb-4 space-y-6 bg-gray-50 dark:bg-gray-900 absolute inset-0 overflow-y-auto"
  >
    <!-- 顶端过滤面板 -->
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      :show-search="showSearch"
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
    >
      <div class="px-5 py-4 w-full">
        <UForm
          :state="queryParams"
          class="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap w-full"
        >
          <UFormField label="姓名" name="name" class="text-sm font-semibold">
            <UInput
              v-model="queryParams.name"
              placeholder="请输入姓名"
              clearable
              class="w-full sm:w-[160px]"
              @keyup.enter="handleQuery"
            />
          </UFormField>

          <UFormField label="部门" name="dept" class="text-sm font-semibold">
            <UInput
              v-model="queryParams.dept"
              placeholder="请输入部门"
              clearable
              class="w-full sm:w-[160px]"
              @keyup.enter="handleQuery"
            />
          </UFormField>

          <UFormField
            label="职位"
            name="position"
            class="text-sm font-semibold"
          >
            <UInput
              v-model="queryParams.position"
              placeholder="请输入职位"
              clearable
              class="w-full sm:w-[160px]"
              @keyup.enter="handleQuery"
            />
          </UFormField>

          <!-- 搜索/重置按钮 -->
          <div class="flex items-center gap-2 pt-6 sm:pt-6 ml-auto">
            <UButton
              color="primary"
              icon="i-lucide-search"
              @click="handleQuery"
              >搜索</UButton
            >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              @click="resetQuery"
              >重置</UButton
            >
          </div>
        </UForm>
      </div>
    </TkSearchPanel>

    <!-- 工具栏 -->
    <TkToolbar
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 shadow-sm"
    >
      <div class="flex items-center gap-3">
        <UButton
          color="primary"
          variant="subtle"
          icon="i-lucide-plus"
          @click="handleAdd"
          >新增</UButton
        >
        <UButton
          color="success"
          variant="subtle"
          icon="i-lucide-square-pen"
          :disabled="single"
          @click="handleUpdate"
          >修改</UButton
        >
        <UButton
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          :disabled="multiple"
          @click="handleDelete"
          >删除</UButton
        >
        <UButton
          color="warning"
          variant="subtle"
          icon="i-lucide-download"
          @click="handleExport"
          >导出</UButton
        >
      </div>
      <template #trailing>
        <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" />
      </template>
    </TkToolbar>

    <!-- 数据表格 -->
    <UCard
      class="border border-gray-200/80 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-0"
    >
      <div class="overflow-x-auto">
        <TkUTable
          ref="tkDataTableRef"
          v-model:row-selection="selectedRows"
          :loading="loading"
          :data="wxuserList"
          :columns="wxuserColumns"
          class="w-full"
          @selection-change="handleSelectionChange"
          @row-open="handleUpdate"
        >
          <!-- 用户ID列添加等宽等高级字体样式 -->
          <template #userid-cell="{ row }">
            <span class="font-mono text-gray-500 dark:text-gray-400">{{
              row.original.userid
            }}</span>
          </template>

          <!-- 行内操作按钮插槽 -->
          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2 justify-center">
              <UButton
                variant="ghost"
                color="primary"
                icon="i-lucide-square-pen"
                size="xs"
                @click="handleUpdate(row.original)"
                >修改</UButton
              >
              <UButton
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                size="xs"
                @click="handleDelete(row.original)"
                >删除</UButton
              >
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

    <!-- 添加与修改扫码登记对话框 -->
    <UModal v-model:open="open" :title="title">
      <template #body>
        <UForm ref="wxuserRef" :state="form" :schema="rules" class="space-y-4">
          <UFormField
            label="用户 WeCom ID"
            name="userid"
            required
            class="text-sm font-semibold"
          >
            <UInput
              v-model="form.userid"
              placeholder="请输入企业微信 UserID..."
              :disabled="form.userid !== null && title.includes('修改')"
              class="w-full font-mono"
            />
          </UFormField>

          <UFormField
            label="姓名"
            name="name"
            required
            class="text-sm font-semibold"
          >
            <UInput
              v-model="form.name"
              placeholder="请输入姓名..."
              class="w-full"
            />
          </UFormField>

          <UFormField label="部门" name="dept" class="text-sm font-semibold">
            <UInput
              v-model="form.dept"
              placeholder="请输入部门..."
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="职位"
            name="position"
            class="text-sm font-semibold"
          >
            <UInput
              v-model="form.position"
              placeholder="请输入职位..."
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <UButton color="neutral" variant="outline" @click="cancel"
            >取 消</UButton
          >
          <UButton color="primary" @click="submitForm">确 定</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Wxuser">
import { useTkRowInteraction } from "@ctk-system/composables";
import { useTkListQuery } from "@ctk-system/composables";

const { proxy } = getCurrentInstance();
const toast = useToast();
const wxuserRef = ref(null);
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

const wxuserColumns = [
  {
    accessorKey: "userid",
    header: "用户 WeCom ID",
    cell: "userid",
    meta: { class: { td: "text-center max-w-[200px] truncate" } },
  },
  {
    accessorKey: "name",
    header: "姓名",
    meta: {
      class: {
        td: "text-center font-semibold text-gray-800 dark:text-gray-200",
      },
    },
  },
  {
    accessorKey: "dept",
    header: "部门",
    meta: { class: { td: "text-center text-gray-600 dark:text-gray-400" } },
  },
  {
    accessorKey: "position",
    header: "职位",
    meta: { class: { td: "text-center text-gray-600 dark:text-gray-400" } },
  },
  {
    accessorKey: "actions",
    header: "操作",
    cell: "actions",
    meta: { class: { td: "text-center w-[160px]" } },
  },
];

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    name: null,
    dept: null,
    position: null,
  },
  rules: {
    userid: [{ required: true, message: "UserID 不能为空", trigger: "blur" }],
    name: [{ required: true, message: "姓名不能为空", trigger: "blur" }],
  },
});

const { queryParams, form, rules } = toRefs(data);

const {
  loading,
  list: wxuserList,
  total,
  getList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => listWxuser(queryParams.value).then((response) => response),
  beforeReset: () => queryPanelRef.value?.resetFields(),
});

const { handleSelectionChange } = useTkRowInteraction({
  getTableRef: () => tkDataTableRef.value?.tableRef,
  currentRowId,
  ids,
  single,
  multiple,
  getRowId: (row) => row.userid,
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
    userid: null,
    name: null,
    dept: null,
    position: null,
  };
  proxy.resetForm("wxuserRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加企业微信成员";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _userid = row.userid || ids.value;
  getWxuser(_userid).then((response) => {
    form.value = response.data;
    open.value = true;
    title.value = "修改企业微信成员";
  });
}

/** 提交按钮 */
async function submitForm() {
  try {
    await wxuserRef.value?.validate?.();
  } catch (_) {
    return;
  }

  if (title.value.includes("修改")) {
    updateWxuser(form.value).then((response) => {
      toast.add({ title: "修改成功", color: "success" });
      open.value = false;
      getList();
    });
  } else {
    addWxuser(form.value).then((response) => {
      toast.add({ title: "新增成功", color: "success" });
      open.value = false;
      getList();
    });
  }
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _userids = row.userid || ids.value;
  useModalConfirm()
    .confirm('是否确认删除企业微信成员表编号为"' + _userids + '"的数据项？')
    .then(function () {
      return delWxuser(_userids);
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
    "tk_custom/wxuser/export",
    {
      ...queryParams.value,
    },
    `wxuser_${new Date().getTime()}.xlsx`,
  );
}

getList();
</script>

<style scoped>
.app-container {
  min-height: 100%;
}
</style>
