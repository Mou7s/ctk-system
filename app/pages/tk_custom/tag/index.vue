<!--
  Converted: el-form → UForm, el-form-item → UFormField, el-dialog → UModal
  Refactored to Tailwind CSS and Nuxt UI
-->
<template>
  <div
    class="app-container absolute inset-0 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 bg-gray-50 dark:bg-gray-900"
  >
    <!-- 顶部数据看板 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <!-- 今日盘点 -->
      <div class="relative overflow-hidden group bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between">
        <div class="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent dark:from-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        <div class="flex flex-col gap-1 z-10">
          <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">今日盘点次数</span>
          <span class="text-2xl font-bold text-gray-900 dark:text-white font-mono mt-0.5">{{ todayPdCount }}</span>
        </div>
        <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-300 z-10">
          <UIcon name="i-lucide-clipboard-check" class="h-6 w-6" />
        </div>
      </div>

      <!-- 累计盘点数量 -->
      <div class="relative overflow-hidden group bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between">
        <div class="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent dark:from-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        <div class="flex flex-col gap-1 z-10">
          <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">累计盘点数量</span>
          <span class="text-2xl font-bold text-gray-900 dark:text-white font-mono mt-0.5">{{ totalPdNumber }}</span>
        </div>
        <div class="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300 z-10">
          <UIcon name="i-lucide-database" class="h-6 w-6" />
        </div>
      </div>

      <!-- 覆盖物料品类 -->
      <div class="relative overflow-hidden group bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between">
        <div class="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent dark:from-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        <div class="flex flex-col gap-1 z-10">
          <span class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">覆盖物料品类</span>
          <span class="text-2xl font-bold text-gray-900 dark:text-white font-mono mt-0.5">{{ categoryCount }}</span>
        </div>
        <div class="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform duration-300 z-10">
          <UIcon name="i-lucide-layout-grid" class="h-6 w-6" />
        </div>
      </div>
    </div>

    <!-- 一体化检索与操作面板 -->
    <!-- 扁平流式检索过滤栏 -->
    <TkSearchPanel
      ref="queryPanelRef"
      :model="queryParams"
      :show-search="showSearch"
      inline
      class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/60"
    >
      <UInput
        v-model="queryParams.mertiralid"
        placeholder="物料编码"
        clearable
        icon="i-lucide-tag"
        @keyup.enter="handleQuery"
        class="w-full sm:w-36"
      />

      <UInput
        v-model="queryParams.mertiralname"
        placeholder="物料名称"
        clearable
        icon="i-lucide-search"
        @keyup.enter="handleQuery"
        class="w-full sm:w-36"
      />

      <UInput
        v-model="queryParams.kuwei"
        placeholder="库位"
        clearable
        icon="i-lucide-map-pin"
        @keyup.enter="handleQuery"
        class="w-full sm:w-28"
      />

      <UInput
        v-model="queryParams.fengzhuang"
        placeholder="封装"
        clearable
        icon="i-lucide-box"
        @keyup.enter="handleQuery"
        class="w-full sm:w-28"
      />

      <UInput
        v-model="queryParams.yinzi"
        placeholder="印字"
        clearable
        icon="i-lucide-pencil"
        @keyup.enter="handleQuery"
        class="w-full sm:w-28"
      />

      <UInput
        v-model="queryParams.number"
        placeholder="数量"
        clearable
        icon="i-lucide-calculator"
        @keyup.enter="handleQuery"
        class="w-full sm:w-24"
      />

      <UPopover v-model:open="queryPopoverOpen">
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-calendar"
          class="w-full sm:w-44 justify-between text-left font-normal"
        >
          {{ queryParams.pddate || '盘点日期' }}
        </UButton>
        <template #content>
          <div class="p-2">
            <UCalendar v-model="queryPddateValue" />
            <div v-if="queryParams.pddate" class="border-t border-gray-100 dark:border-gray-850 pt-2 mt-2 flex justify-end">
              <UButton size="xs" color="neutral" variant="ghost" @click="queryParams.pddate = null; queryPopoverOpen = false">
                清空
              </UButton>
            </div>
          </div>
        </template>
      </UPopover>

      <UInput
        v-model="queryParams.creator"
        placeholder="创建人"
        clearable
        icon="i-lucide-user"
        @keyup.enter="handleQuery"
        class="w-full sm:w-28"
      />

      <!-- 操作按钮集 -->
      <UButton
        color="primary"
        icon="i-lucide-search"
        @click="handleQuery"
      >
        搜索
      </UButton>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="resetQuery"
      >
        重置
      </UButton>
    </TkSearchPanel>

    <!-- 操作工具栏 -->
    <TkToolbar>
      <div class="flex items-center gap-2">
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="handleAdd"
        >
          手动新增
        </UButton>
      </div>
    </TkToolbar>

    <!-- 卡片列表流 -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="loading" class="flex justify-center items-center py-12">
        <UIcon
          name="i-lucide-refresh-cw"
          class="animate-spin h-8 w-8 text-primary-500"
        />
      </div>
      <div
        v-else-if="pd_ckList.length === 0"
        class="flex flex-col justify-center items-center py-16 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm transition-all duration-300"
      >
        <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-full mb-3 text-gray-300 dark:text-gray-600">
          <UIcon
            name="i-lucide-inbox"
            class="h-10 w-10"
          />
        </div>
        <p class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">暂无盘点记录，开始盘点吧</p>
        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-qr-code"
            @click="scan"
          >
            立即扫码
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-plus"
            @click="handleAdd"
          >
            手动录入
          </UButton>
        </div>
      </div>
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-6"
      >
        <div
          v-for="item in pd_ckList"
          :key="item.id"
          class="relative group bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/80 hover:border-primary-500/30 dark:hover:border-primary-400/30 hover:shadow-md transition-all duration-300 flex flex-col justify-between gap-4"
        >
          <!-- 悬停渐变微光 -->
          <div class="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent dark:from-primary-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none"></div>

          <!-- 卡片头部：物料名称和编码 -->
          <div class="flex flex-col gap-2 z-10">
            <div class="flex items-start justify-between gap-3">
              <h3
                class="font-bold text-gray-800 dark:text-gray-100 text-sm leading-snug line-clamp-2"
                :title="item.mertiralname"
              >
                {{ item.mertiralname }}
              </h3>
              <UBadge
                color="primary"
                variant="solid"
                class="shrink-0 font-mono text-[10px] tracking-wide px-2 py-0.5 rounded-md shadow-sm"
              >
                {{ item.mertiralid }}
              </UBadge>
            </div>
            
            <!-- 印字展示 -->
            <div
              v-if="item.yinzi"
              class="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/60 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-800/80 font-mono"
            >
              <UIcon name="i-lucide-pencil" class="h-3 w-3 text-gray-400" />
              <span class="font-semibold text-gray-400 uppercase tracking-wider scale-95 origin-left">印字:</span>
              <span class="break-all text-gray-700 dark:text-gray-200 font-medium">{{ item.yinzi }}</span>
            </div>
          </div>

          <!-- 卡片主要指标：封装、库位、数量 -->
          <div
            class="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 dark:border-gray-700/60 my-1 text-xs z-10"
          >
            <div class="flex flex-col justify-center">
              <div class="flex items-center gap-1 text-gray-400 dark:text-gray-500 mb-0.5">
                <UIcon name="i-lucide-box" class="h-3 w-3" />
                <span class="text-[10px] font-semibold uppercase tracking-wider">封装</span>
              </div>
              <span
                class="text-gray-700 dark:text-gray-300 font-medium truncate font-mono text-[13px]"
                :title="item.fengzhuang"
              >
                {{ item.fengzhuang || "-" }}
              </span>
            </div>

            <div class="flex flex-col justify-center border-l border-gray-100 dark:border-gray-700/60 pl-3">
              <div class="flex items-center gap-1 text-gray-400 dark:text-gray-500 mb-0.5">
                <UIcon name="i-lucide-map-pin" class="h-3 w-3" />
                <span class="text-[10px] font-semibold uppercase tracking-wider">库位</span>
              </div>
              <span
                class="text-primary-600 dark:text-primary-400 font-semibold truncate font-mono text-[13px]"
                :title="item.kuwei"
              >
                {{ item.kuwei || "-" }}
              </span>
            </div>

            <div class="flex flex-col justify-center border-l border-gray-100 dark:border-gray-700/60 pl-3">
              <div class="flex items-center gap-1 text-gray-400 dark:text-gray-500 mb-0.5">
                <UIcon name="i-lucide-calculator" class="h-3 w-3" />
                <span class="text-[10px] font-semibold uppercase tracking-wider">盘点数</span>
              </div>
              <!-- 数量渐变色 -->
              <span
                class="bg-gradient-to-r from-primary-600 to-emerald-600 dark:from-primary-400 dark:to-emerald-400 bg-clip-text text-transparent font-bold text-lg font-mono tracking-tight leading-none mt-0.5"
              >
                {{ item.number }}
              </span>
            </div>
          </div>

          <!-- 卡片尾部：日期、人员和操作按钮 -->
          <div class="flex items-center justify-between gap-2 pt-0.5 text-[11px] z-10">
            <div class="flex flex-col gap-1 text-gray-400 dark:text-gray-500 font-mono">
              <div class="flex items-center gap-1">
                <UIcon name="i-lucide-user" class="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />
                <span>{{ item.creator }}</span>
              </div>
              <div class="flex items-center gap-1">
                <UIcon name="i-lucide-calendar" class="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />
                <span>{{
                  item.pddate ? item.pddate.substring(0, 16) : "-"
                }}</span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-1.5">
              <UButton
                size="xs"
                variant="subtle"
                color="neutral"
                icon="i-lucide-square-pen"
                @click="handleUpdate(item.id)"
              >
                修改
              </UButton>
              <UButton
                size="xs"
                variant="subtle"
                color="error"
                icon="i-lucide-trash-2"
                @click="handleDelete(item.id, item.mertiralname)"
              >
                删除
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页组件 -->
    <Pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
      class="bg-transparent py-2 shrink-0"
    />

    <!-- 底部安全区 -->
    <div class="h-6 md:h-8 shrink-0"></div>

    <!-- 新增/修改弹窗 -->
    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UForm
          ref="pd_ckRef"
          :state="form"
          :schema="formSchema"
          class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1"
          @submit="submitForm"
        >
          <UFormField label="物料编码" name="mertiralid">
            <UInput
              v-model="form.mertiralid"
              placeholder="请输入物料编码"
              icon="i-lucide-tag"
              class="w-full"
            />
          </UFormField>
          <UFormField label="物料名称" name="mertiralname">
            <UInput
              v-model="form.mertiralname"
              placeholder="请输入物料名称"
              icon="i-lucide-search"
              class="w-full"
            />
          </UFormField>
          <UFormField label="封装" name="fengzhuang">
            <UInput
              v-model="form.fengzhuang"
              placeholder="请输入封装"
              icon="i-lucide-box"
              class="w-full"
            />
          </UFormField>
          <UFormField label="印字" name="yinzi">
            <UInput
              v-model="form.yinzi"
              placeholder="请输入印字"
              icon="i-lucide-pencil"
              class="w-full"
            />
          </UFormField>
          <UFormField label="库位" name="kuwei">
            <UInput
              v-model="form.kuwei"
              placeholder="请输入库位"
              icon="i-lucide-map-pin"
              class="w-full"
            />
          </UFormField>
          <UFormField label="数量" name="number">
            <UInput
              v-model="form.number"
              placeholder="请输入数量"
              icon="i-lucide-calculator"
              class="w-full"
            />
          </UFormField>
          <UFormField label="盘点日期" name="pddate" class="sm:col-span-2">
            <UPopover v-model:open="formPopoverOpen" class="w-full">
              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-calendar"
                class="w-full justify-between text-left font-normal"
              >
                {{ form.pddate || '请选择盘点日期' }}
              </UButton>
              <template #content>
                <div class="p-2">
                  <UCalendar v-model="formPddateValue" />
                  <div v-if="form.pddate" class="border-t border-gray-100 dark:border-gray-850 pt-2 mt-2 flex justify-end">
                    <UButton size="xs" color="neutral" variant="ghost" @click="form.pddate = null; formPopoverOpen = false">
                      清空
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </UFormField>
          <UFormField label="备注" name="remark" class="sm:col-span-2">
            <UTextarea
              v-model="form.remark"
              placeholder="请输入备注内容"
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
          <UButton color="primary" :loading="saving" @click="submitForm"
            >确 定</UButton
          >
        </div>
      </template>
    </UModal>

    <!-- 悬浮扫码按钮 -->
    <div
      v-show="!open"
      class="fixed bottom-20 right-6 z-50 flex items-center justify-center h-14 w-14 group"
    >
      <!-- 呼吸微光涟漪层 -->
      <span class="absolute inline-flex h-full w-full rounded-full bg-emerald-400 dark:bg-emerald-500 opacity-60 animate-ping duration-1000"></span>
      
      <!-- 主按钮 -->
      <UButton
        color="success"
        class="relative shadow-2xl rounded-full h-14 w-14 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 bg-emerald-500 hover:bg-emerald-600 border-none"
        @click="scan"
      >
        <UIcon name="i-lucide-qr-code" class="h-8 w-8 text-white" />
      </UButton>
    </div>
  </div>
</template>

<script setup name="tag">
import { getInfo } from "@/api/login";
import { TkSearchPanel, TkToolbar } from "@ctk-system/ui";
import { z } from "zod";
import { parseDate } from "@internationalized/date";

const toast = useToast();
const { proxy } = getCurrentInstance();

const pd_ckList = ref([]);

const queryPopoverOpen = ref(false);
const formPopoverOpen = ref(false);

const queryPddateValue = computed({
  get() {
    if (!queryParams.pddate) return null;
    try {
      return parseDate(queryParams.pddate);
    } catch {
      return null;
    }
  },
  set(val) {
    if (!val) {
      queryParams.pddate = null;
    } else {
      queryParams.pddate = val.toString();
    }
    queryPopoverOpen.value = false;
  }
});

const formPddateValue = computed({
  get() {
    if (!form.pddate) return null;
    try {
      const dStr = form.pddate.substring(0, 10);
      return parseDate(dStr);
    } catch {
      return null;
    }
  },
  set(val) {
    if (!val) {
      form.pddate = null;
    } else {
      form.pddate = val.toString();
    }
    formPopoverOpen.value = false;
  }
});

const todayStr = computed(() => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

const todayPdCount = computed(() => {
  return pd_ckList.value.filter(item => item.pddate && item.pddate.startsWith(todayStr.value)).length;
});

const totalPdNumber = computed(() => {
  return pd_ckList.value.reduce((acc, item) => acc + (Number(item.number) || 0), 0);
});

const categoryCount = computed(() => {
  return new Set(pd_ckList.value.map(item => item.mertiralid).filter(Boolean)).size;
});
const open = ref(false);
const loading = ref(true);
const saving = ref(false);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const pd_ckRef = ref(null);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 20,
  mertiralid: null,
  mertiralname: null,
  fengzhuang: null,
  yinzi: null,
  kuwei: null,
  number: null,
  pddate: null,
  creator: null,
});

const form = reactive({
  id: null,
  mertiralid: null,
  mertiralname: null,
  fengzhuang: null,
  yinzi: null,
  kuwei: null,
  number: null,
  pddate: null,
  remark: null,
  creator: null,
});

const formSchema = z.object({
  mertiralid: z.string().optional(),
  mertiralname: z.string().optional(),
  fengzhuang: z.string().optional(),
  yinzi: z.string().optional(),
  kuwei: z.string().optional(),
  number: z.string().optional(),
  pddate: z.string().optional(),
  remark: z.string().optional(),
});

function getList() {
  loading.value = true;
  listPd_ck(queryParams).then((response) => {
    pd_ckList.value = response.rows;
    total.value = response.total;
    loading.value = false;
  });
}

function scan() {
  try {
    AndroidJs.scan();
  } catch {
    toast.add({ title: "请安装指定APP!", color: "error" });
  }
}

window.getBarCodeResult = function (code) {
  var arr = code.split("|");
  form.mertiralid = arr[0] || "";
  form.mertiralname = arr[1] || "";
  form.fengzhuang = arr[2] || "";
  form.yinzi = arr[3] || "";
  form.kuwei = null;
  form.number = null;
  form.pddate = null;
  form.remark = null;
  form.creator = null;
  handleAdd();
};

function cancel() {
  open.value = false;
  reset();
}

function reset() {
  Object.assign(form, {
    id: null,
    mertiralid: null,
    mertiralname: null,
    fengzhuang: null,
    yinzi: null,
    kuwei: null,
    number: null,
    pddate: null,
    remark: null,
    creator: null,
  });
}

function handleQuery() {
  queryParams.pageNum = 1;
  getList();
}

function resetQuery() {
  Object.assign(queryParams, {
    pageNum: 1,
    pageSize: 20,
    mertiralid: null,
    mertiralname: null,
    fengzhuang: null,
    yinzi: null,
    kuwei: null,
    number: null,
    pddate: null,
    creator: null,
  });
  handleQuery();
}

function handleAdd() {
  open.value = true;
  title.value = "添加";
  form.pddate = todayStr.value;
}

function handleUpdate(id) {
  reset();
  getPd_ck(id).then((response) => {
    const data = response.data;
    if (data.pddate) {
      data.pddate = data.pddate.substring(0, 10);
    }
    Object.assign(form, data);
    open.value = true;
    title.value = "修改";
  });
}

async function submitForm() {
  try {
    await pd_ckRef.value?.validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    if (form.id != null) {
      const res = await updatePd_ck(form);
      if (res.code != "200") {
        toast.add({ title: "保存失败！", color: "error" });
      } else {
        toast.add({ title: "修改成功", color: "success" });
        open.value = false;
        getList();
      }
    } else {
      const res = await addPd_ck(form);
      if (res.code != "200") {
        toast.add({ title: "保存失败！", color: "error" });
      } else {
        toast.add({ title: "新增成功", color: "success" });
        open.value = false;
        scan();
        getList();
      }
    }
  } finally {
    saving.value = false;
  }
}

function handleDelete(id, name) {
  useModalConfirm()
    .confirm('是否确认删除"' + name + '"？')
    .then(function () {
      return delPd_ck(id);
    })
    .then(() => {
      getList();
      toast.add({ title: "删除成功", color: "success" });
    })
    .catch(() => {});
}

getInfo().then(function (resp) {
  queryParams.creator = resp.user.userName;
  getList();
});
</script>
