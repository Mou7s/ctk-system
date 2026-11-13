<template>
  <div
    class="absolute inset-0 flex min-h-0 flex-col overflow-hidden p-4 text-app-text md:p-6"
  >
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TkSearchPanel
        ref="queryPanelRef"
        :model="queryParams"
        class="relative mb-3 shrink-0 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 shadow-sm"
      >
        <div
          class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary-500/50 via-blue-500/50 to-emerald-500/50"
        ></div>
        <div
          class="grid w-full grid-cols-1 items-center gap-2.5 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6"
        >
          <UInput
            v-model="queryParams.position"
            placeholder="职位"
            icon="i-lucide-briefcase-business"
            clearable
            class="w-full"
            aria-label="职位"
            @keyup.enter="handleQuery"
          />
          <UInput
            v-model="queryParams.name"
            placeholder="姓名"
            icon="i-lucide-user"
            clearable
            class="w-full"
            aria-label="姓名"
            @keyup.enter="handleQuery"
          />
          <USelect
            v-model="queryParams.eduId"
            :items="edus"
            placeholder="学历"
            icon="i-lucide-graduation-cap"
            clearable
            class="w-full"
            aria-label="学历"
          />
          <UInput
            v-model="queryParams.schoolName"
            placeholder="学校"
            icon="i-lucide-school"
            clearable
            class="w-full"
            aria-label="学校"
            @keyup.enter="handleQuery"
          />
          <div
            class="grid w-full grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:justify-end md:col-span-4 xl:col-span-2"
          >
            <UButton
              variant="outline"
              icon="i-lucide-rotate-ccw"
              class="justify-center whitespace-nowrap sm:w-28 sm:flex-none"
              @click="resetQuery"
            >
              重置
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-search"
              :loading="loading"
              class="justify-center whitespace-nowrap shadow-sm sm:w-40 sm:flex-none"
              @click="handleQuery"
            >
              搜索
            </UButton>
          </div>
        </div>
      </TkSearchPanel>

      <TkToolbar class="!mb-3 shrink-0">
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
          :disabled="selectedIds.length !== 1"
          @click="handleEdit"
        >
          修改
        </UButton>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          size="sm"
          :disabled="multiple"
          @click="handleDelete"
        >
          删除
        </UButton>
      </TkToolbar>
      <div
        class="mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
      >
        <TkUTable
          ref="talentTableRef"
          sticky
          v-model:row-selection="selectedRows"
          :loading="loading"
          :data="tableList"
          :columns="talentColumns"
          @row-open="handleUpdate"
          class="min-h-0 flex-1"
        >
          <template #interviewTime-cell="{ row }">
            <span>{{
              parseTime(row.original.interviewTime, "{y}-{m}-{d}")
            }}</span>
          </template>

          <template #gender-cell="{ row }">
            <UBadge
              :type="
                row.original.gender === 0 || row.original.gender === '0'
                  ? 'primary'
                  : row.original.gender === 1 || row.original.gender === '1'
                    ? 'danger'
                    : 'info'
              "
            >
              {{
                row.original.gender == "0" || row.original.gender == 0
                  ? "男"
                  : row.original.gender == "1" || row.original.gender == 1
                    ? "女"
                    : "未知"
              }}
            </UBadge>
          </template>

          <template #eduId-cell="{ row }">
            <dict-tag :options="edus" :value="row.original.eduId" />
          </template>

          <template #birthDate-cell="{ row }">
            <span>{{ parseTime(row.original.birthDate, "{y}-{m}-{d}") }}</span>
          </template>

          <template #isMarriedId-cell="{ row }">
            <UBadge
              :type="
                row.original.isMarriedId === 'Y'
                  ? 'primary'
                  : row.original.isMarriedId === 'N'
                    ? 'danger'
                    : 'info'
              "
            >
              {{
                row.original.isMarriedId == "Y"
                  ? "是"
                  : row.original.isMarriedId == "N"
                    ? "否"
                    : "未知"
              }}
            </UBadge>
          </template>

          <template #attachments-cell="{ row }">
            <div class="flex min-w-0 items-center gap-1 p-0.5">
              <template
                v-if="
                  row.original.attachments && row.original.attachments.length
                "
              >
                <div
                  v-for="(item, index) in row.original.attachments.slice(0, 3)"
                  :key="index"
                  class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-[var(--app-border)] bg-muted shadow-sm transition-transform duration-200 hover:scale-105"
                >
                  <img
                    :src="item"
                    class="w-full h-full object-cover"
                    @click.stop="previewImages(row.original.attachments, index)"
                  />
                </div>
                <UBadge
                  v-if="row.original.attachments.length > 3"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  class="shrink-0"
                >
                  +{{ row.original.attachments.length - 3 }}
                </UBadge>
              </template>
            </div>
          </template>

          <template #createTime-cell="{ row }">
            <span>
              {{
                parseTime(row.original.createTime, "{y}-{m}-{d} {h}:{i}:{s}")
              }}
            </span>
          </template>

          <template #updateTime-cell="{ row }">
            <span>
              {{
                parseTime(row.original.updateTime, "{y}-{m}-{d} {h}:{i}:{s}")
              }}
            </span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              variant="link"
              color="primary"
              icon="i-lucide-square-pen"
              @click="handleUpdate(row.original)"
              >修改</UButton
            >
          </template>
        </TkUTable>
      </div>
      <!-- 分页组件 -->
      <pagination
        v-show="total > 0"
        :page-sizes="[30, 50, 100, 200, 300]"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="handleGetTableList"
      />
      <!-- 添加或修改盘点对话框 -->
      <UModal
        :title="dialogDialog"
        v-model:open="openDialog"
        :ui="{ content: 'max-w-2xl' }"
        @update:open="
          (v) => {
            if (v) {
              dialogOpen();
            } else {
              dialogClose();
            }
          }
        "
      >
        <template #body>
          <UForm
            ref="talentRef"
            :state="talentInfoForm"
            :rules="rules"
            class="grid grid-cols-2 gap-x-4 gap-y-3"
          >
            <UFormField label="姓名" prop="name">
              <UInput
                v-model="talentInfoForm.name"
                placeholder="请输入姓名"
                class="w-full"
              />
            </UFormField>
            <UFormField label="性别" prop="gender">
              <USelect
                v-model="talentInfoForm.gender"
                :items="sys_user_sex"
                placeholder="请选择性别"
                class="w-full"
              />
            </UFormField>

            <UFormField label="籍贯" prop="nativePlace">
              <UInput
                v-model="talentInfoForm.nativePlace"
                placeholder="请输入籍贯"
                class="w-full"
              />
            </UFormField>
            <UFormField label="婚否" prop="isMarriedId">
              <USelect
                v-model="talentInfoForm.isMarriedId"
                :items="sys_yes_no"
                placeholder="请选择婚否"
                class="w-full"
              />
            </UFormField>

            <UFormField label="职位" prop="position">
              <UInput
                v-model="talentInfoForm.position"
                placeholder="请输入职位"
                class="w-full"
              />
            </UFormField>
            <UFormField label="学历" prop="eduId">
              <USelect
                v-model="talentInfoForm.eduId"
                :items="edus"
                placeholder="请选择学历"
                class="w-full"
              />
            </UFormField>

            <UFormField label="联系电话" prop="phoneNumber">
              <UInput
                v-model="talentInfoForm.phoneNumber"
                placeholder="请输入联系电话"
                class="w-full"
              />
            </UFormField>
            <UFormField label="毕业学校" prop="schoolName">
              <UInput
                v-model="talentInfoForm.schoolName"
                placeholder="请输入毕业学校"
                class="w-full"
              />
            </UFormField>

            <UFormField label="出生日期" prop="birthDate">
              <UPopover v-model:open="birthDateOpen">
                <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
                  <span :class="talentInfoForm.birthDate ? '' : 'text-dimmed'">{{ talentInfoForm.birthDate || '选择日期' }}</span>
                </UButton>
                <template #content>
                  <div class="p-2"><UCalendar v-model="birthDateValue" locale="zh-CN" /></div>
                </template>
              </UPopover>
            </UFormField>
            <UFormField label="面试日期" prop="interviewTime">
              <UPopover v-model:open="interviewTimeOpen">
                <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start font-normal">
                  <span :class="talentInfoForm.interviewTime ? '' : 'text-dimmed'">{{ talentInfoForm.interviewTime || '选择日期' }}</span>
                </UButton>
                <template #content>
                  <div class="p-2"><UCalendar v-model="interviewTimeValue" locale="zh-CN" /></div>
                </template>
              </UPopover>
            </UFormField>

            <UFormField label="备注" prop="remark" class="col-span-2">
              <UInput
                v-model="talentInfoForm.remark"
                class="w-full"
                :rows="2"
                type="textarea"
                placeholder="请输入备注"
              />
            </UFormField>

            <UFormField label="图片附件" prop="attachments" class="col-span-2">
              <ImageUpload v-model="talentInfoForm.attachments" :limit="10" />
            </UFormField>
          </UForm>
        </template>
        <template #footer>
          <div class="dialog-footer flex justify-end gap-3">
            <UButton
              :loading="isSubLoading"
              color="primary"
              @click="submitForm"
            >
              确 定
            </UButton>
            <UButton :loading="isSubLoading" @click="formCancel">
              取 消
            </UButton>
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
  </div>
</template>
<script setup name="talentPool">
import { useDict } from "@/utils/dict"; // 字典工具
import { TkSearchPanel, TkToolbar, TkUTable } from "@ctk-system/ui";
import { useTkListQuery } from "@ctk-system/composables";
import { normalizeProfileImageList } from "@/utils/image-url";

const toast = useToast();
const { proxy } = getCurrentInstance();

const lightboxVisible = ref(false);
const lightboxImgs = ref([]);
const lightboxIndex = ref(0);

function previewImages(images, index = 0) {
  lightboxImgs.value = normalizeProfileImageList(images);
  if (!lightboxImgs.value.length) return;
  lightboxIndex.value = Math.min(index, lightboxImgs.value.length - 1);
  lightboxVisible.value = true;
}
// 获取学历字典数据 - 用于学历下拉选择
const { edu: edus } = useDict("edu");
// 获取是否字典数据 - 用于婚否等是/否选择
const { sys_yes_no } = useDict("sys_yes_no");
// 获取性别字典数据 - 用于性别选择
const { sys_user_sex } = useDict("sys_user_sex");
// 查询表单引用 - 用于重置查询表单
const queryRef = ref(null);
const queryPanelRef = ref(null);
// 表格引用 - 用于操作表格
const talentTableRef = ref(null);
// 当前选中的行ID
const currentRowId = ref(null);
// API代理路径 - 文件上传时使用的API基础路径
const proxyPath = ref([import.meta.env.VITE_APP_BASE_API]);
// 是否显示搜索表单 - 控制搜索表单的显示与隐藏
// 提交表单加载状态 - 表单提交时显示加载动画
const isSubLoading = ref(false);
// 选中的记录ID数组 - 用于批量操作
const selectedIds = ref([]);
// 是否单选 - 控制修改按钮的禁用状态
const single = ref(true);
// 是否多选 - 控制删除按钮的禁用状态
const multiple = ref(true);
// 是否为编辑模式 - true表示修改，false表示新增
const isEdit = ref(false);

const selectedRows = ref({});
let lastCheckedIndex = null;

const cellTdClass =
  "align-middle whitespace-nowrap p-2.5 border-b border-[var(--app-border)]/40 text-xs";
const cellThClass =
  "whitespace-nowrap bg-[var(--app-surface)] text-xs font-bold py-2.5 px-2.5 text-default border-b border-[var(--app-border)]";

const UCheckbox = resolveComponent("UCheckbox");

const talentColumns = [
  {
    id: "select",
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value) =>
          table.toggleAllPageRowsSelected(!!value),
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
    accessorKey: "name",
    header: "姓名",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "gender",
    header: "性别",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "nativePlace",
    header: "籍贯",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "position",
    header: "职位",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "phoneNumber",
    header: "联系电话",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "eduId",
    header: "学历",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "schoolName",
    header: "毕业学校",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "birthDate",
    header: "出生日期",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "interviewTime",
    header: "面试日期",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "attachments",
    header: "图片附件",
    meta: {
      class: {
        th: `${cellThClass} w-[180px] min-w-[180px]`,
        td: `${cellTdClass} w-[180px] min-w-[180px]`,
      },
    },
  },
  {
    accessorKey: "remark",
    header: "备注",
    meta: {
      class: {
        th: `${cellThClass} w-[220px] min-w-[180px]`,
        td: `${cellTdClass} max-w-[220px] overflow-hidden text-ellipsis`,
      },
    },
  },
  {
    accessorKey: "createTime",
    header: "创建时间",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "updateTime",
    header: "修改时间",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
  {
    accessorKey: "actions",
    header: "操作",
    meta: {
      class: {
        th: cellThClass,
        td: cellTdClass,
      },
    },
  },
];

// 表单参数 - 查询人才列表的条件
const queryParams = ref({
  pageNum: 1, // 当前页码
  pageSize: 30, // 每页条数
  name: undefined, // 姓名 - 模糊查询
  position: undefined, // 职位 - 模糊查询
  eduId: undefined, // 学历ID - 精确查询
  schoolName: undefined, // 学校名称 - 模糊查询
});

// 表格数据列表交给公共 composable（分页 / loading / 并发守卫 / code!==200 判定）；
// 附件地址归一与选中态清理放在 afterLoad，失败提示保留本页原有 toast（watch listError）
const {
  list: tableList,
  loading,
  total,
  error: listError,
  getList: loadTalentList,
  handleQuery,
  resetQuery,
} = useTkListQuery({
  queryParams,
  fetchList: () => getListApi(queryParams.value),
  beforeReset: resetQueryData,
  afterLoad: () => {
    // 将附件路径统一转换为 Nitro 可访问的 /profile 地址
    tableList.value.forEach((item) => {
      item.attachments = normalizeProfileImageList(item.attachments);
    });
    // 选中态按页内下标存储，数据刷新后旧下标会指向新行，必须清空
    selectedRows.value = {};
    lastCheckedIndex = null;
  },
});

watch(listError, (msg) => {
  if (msg) toast.add({ title: "查询失败：" + msg, color: "error" });
});

// 对话框显示状态 - 控制新增/修改对话框的显示与隐藏
const openDialog = ref(false);
// 对话框标题 - 根据新增/修改模式动态显示
const dialogDialog = ref("添加人员信息");

// 人才信息表单 - 新增/修改人才信息的表单数据
const talentInfoForm = reactive({
  id: 0, // 主键ID - 0表示新增
  name: "", // 姓名 - 必填
  gender: "", // 性别 - 必填，0表示男，1表示女
  eduId: "", // 学历ID - 必填，关联字典表
  birthDate: "", // 出生日期 - 必填，日期格式
  interviewTime: "", // 面试日期
  isMarriedId: "", // 婚否 - 可选（后端允许空，未填时列表显示“未知”）
  position: "", // 职位 - 必填
  phoneNumber: "", // 联系电话 - 必填
  schoolName: "", // 毕业学校 - 可选（后端允许空）
  nativePlace: "", // 籍贯 - 必填
  attachments: "", // 附件路径 - 存储图片路径，逗号分隔
  remark: "", // 备注 - 可选
});

/**
 * 获取人才列表数据（分页 / loading / 并发守卫 / 失败提示都交给 composable）
 */
function handleTalentList() {
  return loadTalentList();
}

/**
 * 处理新增按钮点击事件（先清空表单，避免残留上次编辑的数据）
 */
function handleAdd() {
  resetTalentForm();
  dialogDialog.value = "添加人员信息";
  openDialog.value = true;
  isEdit.value = false;
}

/**
 * 处理编辑按钮点击事件（批量操作）
 */
async function handleEdit() {
  const id = selectedIds.value[0];
  if (!id) return;
  talentInfoForm.id = id;
  const { data: talentInfo } = await getTalentInfoApi(id);
  isEdit.value = true;
  dialogDialog.value = "修改人员信息";
  setTalentInfoForm(talentInfo);
  openDialog.value = true;
}

/**
 * 处理表格行编辑按钮点击事件
 * @param {Object} record - 当前行数据
 */
async function handleUpdate(record) {
  if (!record) return;
  const { data: talentInfo } = await getTalentInfoApi(record.id);
  talentInfoForm.id = record.id;
  isEdit.value = true;
  dialogDialog.value = "修改人员信息";
  setTalentInfoForm(talentInfo);
  openDialog.value = true;
}

/**
 * 取日期部分（后端返回 "YYYY-MM-DD HH:mm:ss"，原生 date 输入框只认 YYYY-MM-DD）
 */
// UCalendar 日期选择（原生 type="date" 替换）：字符串 ⇄ CalendarDate 双向转换
import { parseDate } from "@internationalized/date";

const birthDateOpen = ref(false);
const interviewTimeOpen = ref(false);
const birthDateValue = computed({
  get() {
    if (!talentInfoForm.birthDate) return null;
    try { return parseDate(String(talentInfoForm.birthDate).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    talentInfoForm.birthDate = val ? val.toString() : "";
    birthDateOpen.value = false;
  },
});
const interviewTimeValue = computed({
  get() {
    if (!talentInfoForm.interviewTime) return null;
    try { return parseDate(String(talentInfoForm.interviewTime).slice(0, 10)); } catch { return null; }
  },
  set(val) {
    talentInfoForm.interviewTime = val ? val.toString() : "";
    interviewTimeOpen.value = false;
  },
});

function toDateInput(value) {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
}

/**
 * 设置人才信息表单数据
 * @param {Object} talentInfo - 人才信息数据
 */
function setTalentInfoForm(talentInfo) {
  // 设置基本信息
  talentInfoForm.id = talentInfo.id;
  talentInfoForm.name = talentInfo.name;
  talentInfoForm.gender = talentInfo.gender + "";
  talentInfoForm.eduId = talentInfo.eduId;
  talentInfoForm.birthDate = toDateInput(talentInfo.birthDate);
  talentInfoForm.isMarriedId = talentInfo.isMarriedId;
  talentInfoForm.position = talentInfo.position;
  talentInfoForm.phoneNumber = talentInfo.phoneNumber;
  talentInfoForm.schoolName = talentInfo.schoolName;
  talentInfoForm.nativePlace = talentInfo.nativePlace;
  talentInfoForm.remark = talentInfo.remark;
  talentInfoForm.interviewTime = toDateInput(talentInfo.interviewTime);

  talentInfoForm.attachments = normalizeProfileImageList(talentInfo.attachments);
}

/**
 * 清空人才信息表单（新增前 / 对话框关闭后调用，避免残留旧数据）
 */
function resetTalentForm() {
  talentInfoForm.id = 0;
  talentInfoForm.name = "";
  talentInfoForm.gender = "";
  talentInfoForm.eduId = "";
  talentInfoForm.birthDate = "";
  talentInfoForm.interviewTime = "";
  talentInfoForm.isMarriedId = "";
  talentInfoForm.position = "";
  talentInfoForm.phoneNumber = "";
  talentInfoForm.schoolName = "";
  talentInfoForm.nativePlace = "";
  talentInfoForm.attachments = "";
  talentInfoForm.remark = "";
}

watch(
  selectedRows,
  (newVal) => {
    const selectedList = [];
    if (newVal) {
      Object.keys(newVal).forEach((indexStr) => {
        if (newVal[indexStr]) {
          const idx = parseInt(indexStr, 10);
          const row = tableList.value[idx];
          if (row) {
            selectedList.push(row);
          }
        }
      });
    }
    selectedIds.value = selectedList.map((item) => item.id);
    single.value = selectedList.length !== 1;
    multiple.value = !selectedList.length;
  },
  { deep: true },
);

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

/**
 * 处理删除按钮点击事件
 */
function handleDelete() {
  const ids = selectedIds.value;
  if (!ids || ids.length === 0) return;
  if (confirm("是否确认删除选中的人员数据？")) {
    delByIdsApi(ids)
      .then(() => {
        selectedRows.value = {};
        handleTalentList();
        toast.add({ title: "删除成功", color: "success" });
      })
      .catch((err) => {
        toast.add({ title: "删除失败：" + (err.message || "未知错误"), color: "error" });
      });
  }
}

/**
 * 处理分页变化事件（页码已由 v-model 更新，直接拉取，不重置页码）
 */
function handleGetTableList() {
  handleTalentList();
}

/**
 * 重置查询参数
 */
function resetQueryData() {
  queryParams.value.name = undefined;
  queryParams.value.position = undefined;
  queryParams.value.schoolName = undefined;
  queryParams.value.eduId = undefined;
}

// 人才表单引用 - 用于表单验证 and 重置
const talentRef = ref(null);
// 表单验证规则 - 定义各字段的验证规则
const rules = {
  name: [
    { required: true, message: "请输入姓名", trigger: ["change", "blur"] },
  ],
  position: [
    { required: true, message: "请输入职位", trigger: ["change", "blur"] },
  ],
  phoneNumber: [
    { required: true, message: "请输入联系电话", trigger: ["change", "blur"] },
    {
      pattern: /^1[3-9]\d{9}$|^\d{3,4}-\d{7,8}$/,
      message: "请输入正确的电话号码格式(手机:11位数字/固话:区号-号码)",
      trigger: ["change", "blur"],
    },
  ],
  gender: [
    { required: true, message: "请选择性别", trigger: ["change", "blur"] },
  ],
  eduId: [
    { required: true, message: "请选择学历", trigger: ["change", "blur"] },
  ],
  birthDate: [
    { required: true, message: "请选择出生日期", trigger: ["change", "blur"] },
  ],
  nativePlace: [
    { required: true, message: "请输入籍贯", trigger: ["change", "blur"] },
  ],
};

/**
 * 对话框打开事件
 */
function dialogOpen() {}

/**
 * 对话框关闭事件（清空表单，避免下次打开残留旧数据）
 */
function dialogClose() {
  openDialog.value = false;
  talentRef.value?.clear();
  resetTalentForm();
}

/**
 * 表单取消事件
 */
function formCancel() {
  dialogClose();
}

/**
 * 提交表单
 */
async function submitForm() {
  try {
    await talentRef.value?.validate();
  } catch (err) {
    return;
  }

  try {
    // 设置提交加载状态
    isSubLoading.value = true;

    // Formatting date inputs (native date outputs YYYY-MM-DD, backend expects yyyy-MM-dd HH:mm:ss)
    const postData = {
      ...talentInfoForm,
      birthDate: talentInfoForm.birthDate
        ? talentInfoForm.birthDate.includes(" ")
          ? talentInfoForm.birthDate
          : `${talentInfoForm.birthDate} 00:00:00`
        : null,
      interviewTime: talentInfoForm.interviewTime
        ? talentInfoForm.interviewTime.includes(" ")
          ? talentInfoForm.interviewTime
          : `${talentInfoForm.interviewTime} 00:00:00`
        : null,
      // 编辑回填时 attachments 是数组，提交前拼成逗号分隔字符串，后端按文本存储
      attachments: Array.isArray(talentInfoForm.attachments)
        ? talentInfoForm.attachments.join(",")
        : talentInfoForm.attachments || null,
    };

    // 根据是否为编辑模式执行不同的操作
    if (talentInfoForm.id && isEdit.value) {
      // 修改人才信息
      const res = await editTalentInfoApi(postData);
      const { code } = res;
      if (code === 200) {
        toast.add({ title: "修改成功！", color: "success" });
        dialogClose();
        // 保留搜索条件，只回到第一页刷新
        queryParams.value.pageNum = 1;
        handleTalentList();
      } else {
        toast.add({ title: "修改失败！", color: "error" });
      }
    } else {
      // 新增人才信息
      const res = await addTalentInfoApi(postData);
      const { data, code } = res;
      if (code === 200 && data.id) {
        toast.add({ title: "添加成功！", color: "success" });
        dialogClose();
        // 保留搜索条件，只回到第一页刷新
        queryParams.value.pageNum = 1;
        handleTalentList();
      } else {
        toast.add({ title: "添加失败！", color: "error" });
      }
    }
  } catch (error) {
    toast.add({ title: "保存失败：" + (error.message || "未知错误"), color: "error" });
  } finally {
    // 重置提交加载状态
    isSubLoading.value = false;
  }
}

/**
 * 组件挂载后执行
 */
onMounted(() => {
  nextTick(() => {
    handleQuery(); // 加载数据
  });
});
</script>
