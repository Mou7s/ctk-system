<template>
  <div class="app-container absolute inset-0 flex min-h-0 flex-col overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3">
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      :show-search="showSearch"
      inline
      label-width="68px"
      class="shrink-0"
    >

<UInput
      v-model="queryParams.kdBillno"
      placeholder="请输入销售出/退库单号"
      clearable
      @keyup.enter="handleQuery"
    />

<UInput
      v-model="queryParams.kdWlbm"
      placeholder="请输入物料编码"
      clearable
      @keyup.enter="handleQuery"
    />

<UInput
      v-model="queryParams.kdWumc"
      placeholder="请输入物料名称"
      clearable
      @keyup.enter="handleQuery"
    />

<UInput
      v-model="queryParams.kdGgxh"
      placeholder="请输入规格型号"
      clearable
      @keyup.enter="handleQuery"
    />

<UInput
      v-model="queryParams.kdCangkuName"
      placeholder="请输入仓库"
      clearable
      @keyup.enter="handleQuery"
    />

<UInput
      v-model="queryParams.kdKuweiName"
      placeholder="请输入库位"
      clearable
      @keyup.enter="handleQuery"
    />
        <UPopover v-model:open="queryChukuTimeOpen">
          <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
            <span :class="queryParams.kdChukuTime ? '' : 'text-dimmed'">{{ queryParams.kdChukuTime || '请选择出库时间' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="queryChukuTimeValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
      
        <UPopover v-model:open="querySyncTimeOpen">
          <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
            <span :class="queryParams.syncTime ? '' : 'text-dimmed'">{{ queryParams.syncTime || '请选择同步时间' }}</span>
          </UButton>
          <template #content>
            <div class="p-2"><UCalendar v-model="querySyncTimeValue" locale="zh-CN" /></div>
          </template>
        </UPopover>
      

<UButton color="primary" @click="handleQuery">搜索</UButton>
    <UButton @click="resetQuery">重置</UButton>
    </TkSearchPanel>

    <TkToolbar class="shrink-0">
      <div>
        <UButton
          color="primary"
          variant="outline"
          @click="handleAdd"
        >新增</UButton>
      </div>
      <div>
        <UButton
          color="success"
          variant="outline"
          :disabled="single"
          @click="handleUpdate"
        >修改</UButton>
      </div>
      <div>
        <UButton
          color="error"
          variant="outline"
          :disabled="multiple"
          @click="handleDelete"
        >删除</UButton>
      </div>
      <div>
        <UButton
          color="warning"
          variant="outline"
          @click="handleExport"
        >导出</UButton>
      </div>
      <template #trailing>

        <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>

      </template>
    </TkToolbar>

    <div class="min-h-0 flex-1 overflow-hidden">
    <TkUTable
        v-model:row-selection="selectedRows"
        :loading="loading"
        :data="kucunList"
        :columns="kucunColumns"
        @selection-change="handleSelectionChange"
        @row-open="handleUpdate"
        class="flex-1"
        style="height: 100%"
      >
        <template #kdChukuTime-cell="{ row }">
          <span>{{ parseTime(row.kdChukuTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</span>
        </template>
        <template #syncTime-cell="{ row }">
          <span>{{ parseTime(row.syncTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton variant="ghost" color="primary" @click="handleUpdate(row)">修改</UButton>
          <UButton variant="ghost" color="primary" @click="handleDelete(row)">删除</UButton>
        </template>
      </TkUTable>
    </div>
    
    <pagination
      v-show="total>0"
      class="shrink-0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" :title="title">
      <template #body>
        <UForm ref="kucunRef" :state="form">

<UInput v-model="form.kdBillno" placeholder="请输入销售出/退库单号" />

<UInput v-model="form.kdWlbm" placeholder="请输入物料编码" />

<UInput v-model="form.kdWumc" placeholder="请输入物料名称" />

<UInput v-model="form.kdGgxh" placeholder="请输入规格型号" />

<UInput v-model="form.kdCangkuId" placeholder="请输入仓库id" />

<UInput v-model="form.kdCangkuName" placeholder="请输入仓库" />

<UInput v-model="form.kdKuweiId" placeholder="请输入库位id" />

<UInput v-model="form.kdKuweiName" placeholder="请输入库位" />

<UInput v-model="form.kdChukuNumber" placeholder="请输入出库数量" />
            <UPopover v-model:open="formChukuTimeOpen">
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                <span :class="form.kdChukuTime ? '' : 'text-dimmed'">{{ form.kdChukuTime || '请选择出库时间' }}</span>
              </UButton>
              <template #content>
                <div class="p-2"><UCalendar v-model="formChukuTimeValue" locale="zh-CN" /></div>
              </template>
            </UPopover>
          
            <UPopover v-model:open="formSyncTimeOpen">
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="font-normal">
                <span :class="form.syncTime ? '' : 'text-dimmed'">{{ form.syncTime || '请选择同步时间' }}</span>
              </UButton>
              <template #content>
                <div class="p-2"><UCalendar v-model="formSyncTimeValue" locale="zh-CN" /></div>
              </template>
            </UPopover>
          
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Kucun">
import { useTkRowInteraction } from "@ctk-system/composables";
import { useTkListQuery } from "@ctk-system/composables";
const toast = useToast();
const kucunRef = ref(null);


const kucunColumns = [
  {
    "accessorKey": "kdBillno",
    "header": "销售出/退库单号",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdWlbm",
    "header": "物料编码",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdWumc",
    "header": "物料名称",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdGgxh",
    "header": "规格型号",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdCangkuName",
    "header": "仓库",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdKuweiName",
    "header": "库位",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdChukuNumber",
    "header": "出库数量",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  },
  {
    "accessorKey": "kdChukuTime",
    "header": "出库时间",
    "size": 180,
    "cell": "kdChukuTime",
    "meta": {
      "class": {
        "td": "text-center"
      }
    },
    "slotBody": "          <span>{{ parseTime(row.kdChukuTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</span>"
  },
  {
    "accessorKey": "syncTime",
    "header": "同步时间",
    "size": 180,
    "cell": "syncTime",
    "meta": {
      "class": {
        "td": "text-center"
      }
    },
    "slotBody": "          <span>{{ parseTime(row.syncTime, '{y}-{m}-{d} {h}:{i}:{s}') }}</span>"
  },
  {
    "accessorKey": "actions",
    "header": "操作",
    "cell": "actions",
    "meta": {
      "class": {
        "td": "text-center"
      }
    }
  }
]
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

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    kdBillno: null,
    kdWlbm: null,
    kdWumc: null,
    kdGgxh: null,
    kdCangkuName: null,
    kdKuweiName: null,
    kdChukuTime: null,
    syncTime: null
  },
  rules: {
  }
});

const { queryParams, form, rules } = toRefs(data);

// UCalendar 日期选择（原生 type="date" 替换）：字符串 ⇄ CalendarDate 双向转换
import { parseDate } from "@internationalized/date";

const queryChukuTimeOpen = ref(false);
const querySyncTimeOpen = ref(false);
const formChukuTimeOpen = ref(false);
const formSyncTimeOpen = ref(false);
const queryChukuTimeValue = computed({
  get() {
    if (!queryParams.value.kdChukuTime) return null;
    try { return parseDate(String(queryParams.value.kdChukuTime).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    queryParams.value.kdChukuTime = val ? val.toString() : null;
    queryChukuTimeOpen.value = false;
  },
});
const querySyncTimeValue = computed({
  get() {
    if (!queryParams.value.syncTime) return null;
    try { return parseDate(String(queryParams.value.syncTime).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    queryParams.value.syncTime = val ? val.toString() : null;
    querySyncTimeOpen.value = false;
  },
});
const formChukuTimeValue = computed({
  get() {
    if (!form.value.kdChukuTime) return null;
    try { return parseDate(String(form.value.kdChukuTime).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    form.value.kdChukuTime = val ? val.toString() : null;
    formChukuTimeOpen.value = false;
  },
});
const formSyncTimeValue = computed({
  get() {
    if (!form.value.syncTime) return null;
    try { return parseDate(String(form.value.syncTime).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    form.value.syncTime = val ? val.toString() : null;
    formSyncTimeOpen.value = false;
  },
});

const { loading, list: kucunList, total, getList, handleQuery, resetQuery } = useTkListQuery({
  queryParams,
  fetchList: () => listKucun(queryParams.value).then((response) => response),
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
    kdBillno: null,
    kdWlbm: null,
    kdWumc: null,
    kdGgxh: null,
    kdCangkuId: null,
    kdCangkuName: null,
    kdKuweiId: null,
    kdKuweiName: null,
    kdChukuNumber: null,
    kdChukuTime: null,
    syncTime: null
  };
  proxy.resetForm("kucunRef");
}

/** 新增按钮操作 */
function handleAdd() {
  reset();
  open.value = true;
  title.value = "添加D栋库存明细";
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const _id = row.id || ids.value
  getKucun(_id).then(response => {
    form.value = response.data;
    open.value = true;
    title.value = "修改D栋库存明细";
  });
}

/** 提交按钮 */
async function submitForm() {
  try {
    await kucunRef.value?.validate?.();
  } catch (_) {
    return;
  }
if (form.value.id != null) {
  updateKucun(form.value).then(response => {
    toast.add({ title: "修改成功", color: "success" });
    open.value = false;
    getList();
  });
} else {
  addKucun(form.value).then(response => {
    toast.add({ title: "新增成功", color: "success" });
    open.value = false;
    getList();
  });
}
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _ids = row.id || ids.value;
  useModalConfirm().confirm('是否确认删除D栋库存编号为"' + _ids + '"的数据项？').then(function() {
    return delKucun(_ids);
  }).then(() => {
    getList();
    toast.add({ title: "删除成功", color: "success" });
  }).catch(() => {});
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download('tk_custom/kucun/export', {
    ...queryParams.value
  }, `kucun_${new Date().getTime()}.xlsx`)
}

getList();
</script>
