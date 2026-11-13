<template>
  <!-- absolute + 表格区 overflow-y-auto：修复布局裁剪导致整页无法上下滚动 -->
  <div
    class="app-container absolute inset-0 flex flex-col px-3 pt-3 pb-0 gap-2 overflow-hidden"
  >
    <div
      v-show="showSearch"
      class="shrink-0 flex flex-nowrap items-end gap-2 overflow-x-auto pb-1"
    >
      <UInput
        v-model="queryParams.roleName"
        placeholder="请输入角色名称"
        clearable
        class="w-36 shrink-0"
        @keyup.enter="handleQuery"
      />
      <UInput
        v-model="queryParams.roleKey"
        placeholder="请输入权限字符"
        clearable
        class="w-36 shrink-0"
        @keyup.enter="handleQuery"
      />
      <USelect
        v-model="queryParams.status"
        :items="statusFilterItems"
        value-key="value"
        label-key="label"
        placeholder="角色状态（全部）"
        clearable
        class="w-32 shrink-0"
      />
      <UPopover v-model:open="dateRangeOpen" :content="{ align: 'center' }">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar"
          class="w-48 shrink-0 justify-start font-normal"
        >
          <span
            class="min-w-0 truncate"
            :class="dateRange?.length === 2 ? '' : 'text-dimmed'"
          >
            {{ rangeDisplayText(dateRange) || "选择日期范围" }}
          </span>
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
                :class="isPresetSelected(dateRange, p, 'date') ? 'bg-elevated' : 'hover:bg-elevated/50'"
                truncate
                @click="applydateRangePreset(p)"
              />
              <UButton
                v-if="dateRange?.length"
                label="清除"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4 text-error hover:bg-elevated/50"
                truncate
                @click="cleardateRange"
              />
            </div>
            <UCalendar
              :default-value="rangeArrayToCalendar(dateRange)"
              range
              :number-of-months="calendarMonths"
              locale="zh-CN"
              class="p-2"
              @update:model-value="ondateRangePick"
            />
          </div>
        </template>
      </UPopover>
      <UButton
        color="primary"
        icon="i-lucide-search"
        class="shrink-0 whitespace-nowrap"
        @click="handleQuery"
      >
        搜索
      </UButton>
      <UButton
        variant="outline"
        icon="i-lucide-rotate-ccw"
        class="shrink-0 whitespace-nowrap"
        @click="resetQuery"
      >
        重置
      </UButton>
    </div>

    <div class="shrink-0 flex items-center gap-2">
      <UButton
        color="primary"
        variant="outline"
        icon="i-lucide-plus"
        @click="handleAdd"
        >新增</UButton
      >
      <UButton
        color="success"
        variant="outline"
        icon="i-lucide-edit"
        :disabled="single || hasBuiltinRoleSelected"
        @click="handleUpdate"
        >修改</UButton
      >
      <UButton
        color="error"
        variant="outline"
        icon="i-lucide-trash"
        :disabled="multiple || hasBuiltinRoleSelected"
        @click="handleDelete"
        >删除</UButton
      >
      <UButton
        color="warning"
        variant="outline"
        icon="i-lucide-download"
        @click="handleExport"
        >导出</UButton
      >
      <UButton
        color="neutral"
        variant="ghost"
        :icon="
          showSearch ? 'i-lucide-panel-top-close' : 'i-lucide-panel-top-open'
        "
        :aria-label="showSearch ? '收起筛选' : '展开筛选'"
        :title="showSearch ? '收起筛选' : '展开筛选'"
        @click="showSearch = !showSearch"
      >
        {{ showSearch ? "收起筛选" : "展开筛选" }}
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        aria-label="刷新角色列表"
        title="刷新角色列表"
        @click="getList"
      >
        刷新
      </UButton>
    </div>

    <div
      class="flex-1 min-h-0 overflow-y-auto overflow-x-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-white dark:[&_thead]:bg-gray-900 [&_[data-slot=root]]:!overflow-visible"
    >
      <TkUTable
        ref="roleTableRef"
        :loading="loading"
        :data="roleList"
        :columns="columns"
        sticky
        :ui="{
          td: 'p-2 text-sm text-default whitespace-nowrap',
          th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold',
        }"
        @selection-change="handleSelectionChange"
        @row-dblclick="handleRowDblClick"
      />
    </div>

    <pagination
      v-show="total > 0"
      class="shrink-0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UForm
          ref="roleFormRef"
          :state="form"
          :rules="rules"
          class="space-y-4"
          @submit="submitForm"
        >
          <UFormField label="角色名称" name="roleName" required>
            <UInput v-model="form.roleName" placeholder="请输入角色名称" />
          </UFormField>
          <UFormField name="roleKey" required>
            <template #label>
              <span class="inline-flex items-center gap-1">
                权限字符
                <UTooltip
                  text="控制器中定义的权限字符，如：@PreAuthorize(`@ss.hasRole('admin')`)"
                  placement="top"
                >
                  <UIcon name="i-lucide-help-circle" class="size-4" />
                </UTooltip>
              </span>
            </template>
            <UInput v-model="form.roleKey" placeholder="请输入权限字符" />
          </UFormField>
          <UFormField label="角色顺序" name="roleSort" required>
            <UInputNumber v-model="form.roleSort" :min="0" />
          </UFormField>
          <UFormField label="状态" name="status">
            <URadioGroup
              v-model="form.status"
              :items="sys_normal_disable"
              value-key="value"
              label-key="label"
            />
          </UFormField>
          <UFormField
            label="菜单权限"
            name="menuIds"
            help="勾选一个 C 类型菜单就是授予对应页面；Navbar 按菜单 ID 显示页面，不会因为权限字符相同而自动授予其他页面。父菜单仅用于分组，页面的查询、新增、修改、删除、导出等操作权限仍由权限字符控制。"
          >
            <div class="flex flex-wrap gap-3 mb-2">
              <UCheckbox
                v-model="menuExpand"
                label="展开/折叠"
                @update:model-value="(v) => handleCheckedTreeExpand(v, 'menu')"
              />
              <UCheckbox
                v-model="menuNodeAll"
                label="全选/全不选"
                @update:model-value="(v) => handleCheckedTreeNodeAll(v, 'menu')"
              />
              <!-- menuCheckStrictly=true 表示启用父子联动（与若依字段含义一致） -->
              <UCheckbox v-model="form.menuCheckStrictly" label="父子联动" />
            </div>
            <!-- TODO: replace with custom tree component -->
            <div
              class="w-full border border-gray-100 dark:border-gray-700/60 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-900/20 max-h-[300px] overflow-y-auto space-y-0.5"
            >
              <div
                v-if="flatMenuNodes.length === 0"
                class="text-sm text-gray-400 text-center py-4"
              >
                加载中，请稍候
              </div>
              <div
                v-else
                v-for="node in displayedMenuNodes"
                :key="node.id"
                :style="{ paddingLeft: `${node.level * 16}px` }"
                class="flex items-center gap-2 px-2 py-1 rounded-lg text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/30"
              >
                <span
                  v-if="node.children.length > 0"
                  class="flex items-center justify-center w-4 h-4 cursor-pointer text-gray-400 hover:text-primary"
                  @click.stop="toggleMenuNode(node)"
                >
                  <UIcon
                    :name="
                      node.expanded
                        ? 'i-lucide-chevron-down'
                        : 'i-lucide-chevron-right'
                    "
                    class="size-3.5"
                  />
                </span>
                <span v-else class="w-4"></span>
                <UCheckbox
                  :model-value="
                    node.indeterminate ? 'indeterminate' : node.checked
                  "
                  @update:model-value="
                    (value) => handleNodeCheckChange(node, 'menu', value)
                  "
                />
                <span class="truncate text-default">{{ node.label }}</span>
              </div>
            </div>
          </UFormField>
          <UFormField label="备注" name="remark">
            <UTextarea v-model="form.remark" placeholder="请输入内容" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="openDataScope"
      :title="title"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <UForm :state="form" class="space-y-4">
          <UFormField label="角色名称">
            <UInput v-model="form.roleName" disabled />
          </UFormField>
          <UFormField label="权限字符">
            <UInput v-model="form.roleKey" disabled />
          </UFormField>
          <UFormField label="权限范围">
            <USelect
              v-model="form.dataScope"
              :items="dataScopeOptions"
              value-key="value"
              label-key="label"
              @update:model-value="dataScopeSelectChange"
            />
          </UFormField>
          <UFormField
            v-show="
              unwrapSelectValue(form.dataScope) == 2 || form.dataScope == 2
            "
            label="数据权限"
          >
            <div class="flex flex-wrap gap-3 mb-2">
              <UCheckbox
                v-model="deptExpand"
                label="展开/折叠"
                @update:model-value="(v) => handleCheckedTreeExpand(v, 'dept')"
              />
              <UCheckbox
                v-model="deptNodeAll"
                label="全选/全不选"
                @update:model-value="(v) => handleCheckedTreeNodeAll(v, 'dept')"
              />
              <UCheckbox v-model="form.deptCheckStrictly" label="父子联动" />
            </div>
            <!-- TODO: replace with custom tree component -->
            <div
              class="w-full border border-gray-100 dark:border-gray-700/60 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-900/20 max-h-[300px] overflow-y-auto space-y-0.5"
            >
              <div
                v-if="flatDeptNodes.length === 0"
                class="text-sm text-gray-400 text-center py-4"
              >
                加载中，请稍候
              </div>
              <div
                v-else
                v-for="node in displayedDeptNodes"
                :key="node.id"
                :style="{ paddingLeft: `${node.level * 16}px` }"
                class="flex items-center gap-2 px-2 py-1 rounded-lg text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/30"
              >
                <span
                  v-if="node.children.length > 0"
                  class="flex items-center justify-center w-4 h-4 cursor-pointer text-gray-400 hover:text-primary"
                  @click.stop="toggleDeptNode(node)"
                >
                  <UIcon
                    :name="
                      node.expanded
                        ? 'i-lucide-chevron-down'
                        : 'i-lucide-chevron-right'
                    "
                    class="size-3.5"
                  />
                </span>
                <span v-else class="w-4"></span>
                <UCheckbox
                  :model-value="
                    node.indeterminate ? 'indeterminate' : node.checked
                  "
                  @update:model-value="
                    (value) => handleNodeCheckChange(node, 'dept', value)
                  "
                />
                <span class="truncate text-default">{{ node.label }}</span>
              </div>
            </div>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancelDataScope">取 消</UButton>
        <UButton color="primary" @click="submitDataScope">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Role">
import { h, resolveComponent } from "vue";
import {
  addRole,
  changeRoleStatus,
  dataScope,
  delRole,
  getRole,
  listRole,
  updateRole,
  deptTreeSelect,
} from "@/api/system/role";
import {
  roleMenuTreeselect,
  treeselect as menuTreeselect,
} from "@/api/system/menu";
import { useDict } from "@/utils/dict";
import { TkUTable } from "@ctk-system/ui";
import { parseTime } from "@/utils/helpers";
import useSettingsStore from '@/store/modules/settings';

const toast = useToast();

const UButton = resolveComponent("UButton");

const router = useRouter();
const { proxy } = getCurrentInstance();
const { sys_normal_disable } = useDict("sys_normal_disable");

const settingsStore = useSettingsStore()
const containerHeight = computed(() => {
  let headerHeight = 50
  if (settingsStore.tagsView) headerHeight += 34
  if (settingsStore.fixedHeader) return `calc(100vh - ${headerHeight * 2}px)`
  return `calc(100vh - ${headerHeight}px)`
})

const roleList = ref([]);
const roleTableRef = ref(null);
const currentRowId = ref(null);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const ids = ref([]);
const single = ref(true);
const multiple = ref(true);
const hasBuiltinRoleSelected = computed(() =>
  ids.value.some((roleId) => Number(roleId) === 1),
);
const total = ref(0);
const title = ref("");
/** 创建时间范围：['YYYY-MM-DD','YYYY-MM-DD']，交给 addDateRange 拼 beginTime/endTime */
const dateRange = ref([])
import { DATE_RANGE_PRESETS, calendarToArray, isPresetSelected, presetToArray, rangeArrayToCalendar, rangeDisplayText, useCalendarMonths } from '@/packages/shared/dateRange'
// 日期范围：原生 UPopover + UCalendar range（原生 range，值格式不变）
const dateRangeOpen = ref(false)
const calendarMonths = useCalendarMonths();
function ondateRangePick(range) {
  if (!range?.start || !range?.end) return
  dateRange.value = calendarToArray(range, 'date')
  dateRangeOpen.value = false
}
function applydateRangePreset(preset) {
  dateRange.value = presetToArray(preset, 'date')
  dateRangeOpen.value = false
}
function cleardateRange() {
  dateRange.value = []
  dateRangeOpen.value = false
}
const menuOptions = ref([]);
const menuExpand = ref(false);
const menuNodeAll = ref(false);
const deptExpand = ref(true);
const deptNodeAll = ref(false);
const deptOptions = ref([]);
const openDataScope = ref(false);

function preparePagePermissionTree(nodes) {
  return (nodes || []).map((item) => ({
    ...item,
    children: preparePagePermissionTree(item.children || []),
  }));
}

const dataScopeOptions = [
  { value: "1", label: "全部数据权限" },
  { value: "2", label: "自定数据权限" },
  { value: "3", label: "本部门数据权限" },
  { value: "4", label: "本部门及以下数据权限" },
  { value: "5", label: "仅本人数据权限" },
];

/**
 * 状态下拉项：value 不能为空字符串（USelect/Reka Select 禁止空 value，空串用于清空选中）
 * 「全部」通过 clearable + placeholder 实现，不要塞 value:'' 的选项
 */
const statusFilterItems = computed(() =>
  (sys_normal_disable.value || []).map((d) => ({
    label: d.label,
    value: String(d.value),
  })),
);

const queryParams = reactive({
  pageNum: 1,
  pageSize: 100,
  roleName: undefined,
  roleKey: undefined,
  status: undefined,
});
const form = reactive({});
const rules = {
  roleName: [{ required: true, message: "角色名称不能为空", trigger: "blur" }],
  roleKey: [{ required: true, message: "权限字符不能为空", trigger: "blur" }],
  roleSort: [{ required: true, message: "角色顺序不能为空", trigger: "blur" }],
};
const roleFormRef = ref(null);

function unwrapSelectValue(v) {
  if (v == null || v === "") return undefined;
  if (typeof v === "object" && !Array.isArray(v)) {
    return v.value ?? v.id ?? undefined;
  }
  return v;
}

function getList() {
  loading.value = true;
  const status = unwrapSelectValue(queryParams.status);
  const params = {
    ...queryParams,
    status:
      status === undefined || status === null || status === ""
        ? undefined
        : String(status),
  };
  listRole(proxy.addDateRange(params, dateRange.value))
    .then((response) => {
      roleList.value = response.rows;
      total.value = response.total;
      loading.value = false;
      currentRowId.value = null;
    })
    .catch(() => {
      loading.value = false;
    });
}

function handleQuery() {
  queryParams.pageNum = 1;
  getList();
}

function resetQuery() {
  queryParams.roleName = undefined;
  queryParams.roleKey = undefined;
  queryParams.status = undefined;
  dateRange.value = [];
  handleQuery();
}

function handleDelete(row) {
  const roleIds = row?.roleId || ids.value;
  const selectedRoleIds = Array.isArray(roleIds) ? roleIds : [roleIds];
  if (selectedRoleIds.some((roleId) => Number(roleId) === 1)) {
    toast.add({
      title: "超级管理员是内置角色，不能删除",
      color: "warning",
    });
    return;
  }
  if (!confirm(`是否确认删除角色编号为"${roleIds}"的数据项?`)) return;
  delRole(roleIds).then(() => {
    getList();
    toast.add({ title: "删除成功", color: "success" });
  });
}

function handleExport() {
  const status = unwrapSelectValue(queryParams.status);
  const params = proxy.addDateRange(
    {
      ...queryParams,
      status:
        status === undefined || status === null || status === ""
          ? undefined
          : status,
    },
    dateRange.value,
  );
  proxy.download("system/role/export", params, `role_${Date.now()}.xlsx`);
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.roleId);
  currentRowId.value = selection.length === 1 ? selection[0].roleId : null;
  single.value = selection.length != 1;
  multiple.value = !selection.length;
}

function handleRowDblClick(row) {
  const data = row?.original ?? row;
  if (!data?.roleId) return;
  handleUpdate(data);
}

function handleStatusChange(row) {
  if (Number(row.roleId) === 1) {
    row.status = "0";
    toast.add({
      title: "超级管理员是内置角色，不能停用",
      color: "warning",
    });
    return;
  }
  const text = row.status === "0" ? "启用" : "停用";
  if (!confirm(`确认要"${text}""${row.roleName}"角色吗?`)) {
    row.status = row.status === "0" ? "1" : "0";
    return;
  }
  changeRoleStatus(row.roleId, row.status)
    .then(() => {
      toast.add({ title: `${text}成功`, color: "success" });
    })
    .catch(() => {
      row.status = row.status === "0" ? "1" : "0";
    });
}

function handleAuthUser(row) {
  router.push("/system/role-auth/user/" + row.roleId);
}

const flatMenuNodes = ref([]);
const flatDeptNodes = ref([]);

function buildFlatTreeForChecked(nodes, level = 0, parent = null) {
  let list = [];
  for (const node of nodes || []) {
    const flatNode = reactive({
      id: node.id,
      label: node.label,
      menuType: node.menuType,
      level,
      parent,
      expanded: true,
      assigned: false,
      checked: false,
      indeterminate: false,
      children: [],
    });
    list.push(flatNode);
    if (node.children && node.children.length > 0) {
      flatNode.children = buildFlatTreeForChecked(
        node.children,
        level + 1,
        flatNode,
      );
      list = list.concat(flatNode.children);
    }
  }
  return list;
}

const displayedMenuNodes = computed(() => {
  return flatMenuNodes.value.filter((node) => {
    let p = node.parent;
    while (p) {
      if (!p.expanded) return false;
      p = p.parent;
    }
    return true;
  });
});

const displayedDeptNodes = computed(() => {
  return flatDeptNodes.value.filter((node) => {
    let p = node.parent;
    while (p) {
      if (!p.expanded) return false;
      p = p.parent;
    }
    return true;
  });
});

function toggleMenuNode(node) {
  node.expanded = !node.expanded;
}

function toggleDeptNode(node) {
  node.expanded = !node.expanded;
}

function setMenuCheckedKeys(keys) {
  applyCheckedKeys(flatMenuNodes.value, keys, form.menuCheckStrictly);
}

function setDeptCheckedKeys(keys) {
  applyCheckedKeys(flatDeptNodes.value, keys, form.deptCheckStrictly);
}

function applyCheckedKeys(nodes, keys, linkParentChild) {
  const keySet = new Set(keys);
  for (const node of nodes) {
    node.assigned = keySet.has(node.id);
  }
  refreshTreeSelection(nodes, linkParentChild);
}

function refreshTreeSelection(nodes, linkParentChild) {
  if (!linkParentChild) {
    for (const node of nodes) {
      node.checked = node.assigned;
      node.indeterminate = false;
    }
    return;
  }

  // 从真实授权 ID 自下而上计算全选/半选，避免把“仅有子权限”误显示成父级全选。
  for (const node of [...nodes].sort((a, b) => b.level - a.level)) {
    if (!node.children.length) {
      node.checked = node.assigned;
      node.indeterminate = false;
      continue;
    }
    const allChecked = node.children.every(
      (child) => child.checked && !child.indeterminate,
    );
    const anySelected = node.children.some(
      (child) => child.checked || child.indeterminate,
    );
    if (node.assigned && allChecked) {
      node.checked = true;
      node.indeterminate = false;
    } else if (node.assigned || anySelected) {
      node.checked = false;
      node.indeterminate = true;
    } else {
      node.checked = false;
      node.indeterminate = false;
    }
  }
}

function handleNodeCheckChange(node, type, value) {
  // 若依：menuCheckStrictly / deptCheckStrictly 为 true 表示「父子联动」开启
  const linkParentChild =
    type === "menu" ? form.menuCheckStrictly : form.deptCheckStrictly;
  const nodes = type === "menu" ? flatMenuNodes.value : flatDeptNodes.value;
  const nextVal = value === true;

  if (!linkParentChild) {
    node.assigned = nextVal;
    refreshTreeSelection(nodes, false);
    return;
  }

  // 1. 同步所有子孙
  function checkDescendants(n, val) {
    n.assigned = val;
    if (n.children && n.children.length > 0) {
      for (const child of n.children) {
        checkDescendants(child, val);
      }
    }
  }
  checkDescendants(node, nextVal);

  // 2. 父子联动下，任一子权限被选中时必须同时授权祖先菜单。
  let p = node.parent;
  while (p) {
    p.assigned = p.children.some(
      (child) => child.assigned || child.checked || child.indeterminate,
    );
    p = p.parent;
  }
  refreshTreeSelection(nodes, true);
}

function getMenuTreeselect() {
  menuTreeselect().then((response) => {
    const menus = preparePagePermissionTree(response.data || []);
    menuOptions.value = menus;
    flatMenuNodes.value = buildFlatTreeForChecked(menus);
  });
}

function getDeptAllCheckedKeys() {
  return flatDeptNodes.value
    .filter((n) => n.assigned)
    .map((n) => n.id);
}

function reset() {
  flatMenuNodes.value.forEach((n) => {
    n.assigned = false;
    n.checked = false;
    n.indeterminate = false;
  });
  flatDeptNodes.value.forEach((n) => {
    n.assigned = false;
    n.checked = false;
    n.indeterminate = false;
  });
  menuExpand.value = false;
  menuNodeAll.value = false;
  deptExpand.value = true;
  deptNodeAll.value = false;
  Object.assign(form, {
    roleId: undefined,
    roleName: undefined,
    roleKey: undefined,
    roleSort: 0,
    status: "0",
    menuIds: [],
    deptIds: [],
    menuCheckStrictly: true,
    deptCheckStrictly: true,
    remark: undefined,
  });
  roleFormRef.value?.clear?.();
}

function handleAdd() {
  reset();
  getMenuTreeselect();
  open.value = true;
  title.value = "添加角色";
}

function handleUpdate(row) {
  reset();
  const roleId =
    row?.roleId ?? (Array.isArray(ids.value) ? ids.value[0] : ids.value);
  if (!roleId) {
    toast.add({ title: "请先选择要修改的角色", color: "warning" });
    return;
  }
  if (Number(roleId) === 1) {
    toast.add({
      title: "超级管理员是内置全权限角色，不支持修改",
      color: "warning",
    });
    return;
  }
  const roleMenu = getRoleMenuTreeselect(roleId);
  getRole(roleId).then((response) => {
    Object.assign(form, response.data);
    form.roleSort = Number(form.roleSort);
    form.status = form.status != null ? String(form.status) : "0";
    open.value = true;
    roleMenu.then((res) => {
      setMenuCheckedKeys(res.checkedKeys);
    });
    title.value = "修改角色";
  });
}

function getRoleMenuTreeselect(roleId) {
  return roleMenuTreeselect(roleId).then((response) => {
    const menus = preparePagePermissionTree(response.menus || []);
    menuOptions.value = menus;
    flatMenuNodes.value = buildFlatTreeForChecked(menus);
    return response;
  });
}

function getDeptTree(roleId) {
  return deptTreeSelect(roleId).then((response) => {
    deptOptions.value = response.depts;
    flatDeptNodes.value = buildFlatTreeForChecked(response.depts);
    return response;
  });
}

function handleCheckedTreeExpand(value, type) {
  const list = type === "menu" ? flatMenuNodes.value : flatDeptNodes.value;
  for (const node of list) {
    node.expanded = !!value;
  }
}

function handleCheckedTreeNodeAll(value, type) {
  const list = type === "menu" ? flatMenuNodes.value : flatDeptNodes.value;
  for (const node of list) {
    node.assigned = !!value;
  }
  const linkParentChild =
    type === "menu" ? form.menuCheckStrictly : form.deptCheckStrictly;
  refreshTreeSelection(list, linkParentChild);
}

function getMenuAllCheckedKeys() {
  return flatMenuNodes.value
    .filter((node) => node.assigned)
    .map((node) => node.id);
}

async function submitForm() {
  for (const [field, ruleList] of Object.entries(rules)) {
    for (const rule of ruleList) {
      // roleSort 允许 0，不能用 !form[field]
      const empty =
        form[field] === undefined || form[field] === null || form[field] === "";
      if (rule.required && empty) {
        toast.add({ title: rule.message, color: "error" });
        return;
      }
    }
  }
  form.menuIds = getMenuAllCheckedKeys();
  form.status = unwrapSelectValue(form.status) ?? form.status;
  if (form.roleId != undefined) {
    await updateRole(form);
    toast.add({ title: "修改成功", color: "success" });
  } else {
    await addRole(form);
    toast.add({ title: "新增成功", color: "success" });
  }
  open.value = false;
  getList();
}

function cancel() {
  open.value = false;
  reset();
}

function dataScopeSelectChange(value) {
  const scope = unwrapSelectValue(value) ?? value;
  // 统一写成字符串，便于和选项 value 比较
  form.dataScope = scope != null ? String(scope) : scope;
  if (String(scope) !== "2") {
    flatDeptNodes.value.forEach((n) => (n.checked = false));
  }
}

function handleDataScope(row) {
  reset();
  const deptTreePromise = getDeptTree(row.roleId);
  getRole(row.roleId).then((response) => {
    Object.assign(form, response.data);
    form.dataScope =
      form.dataScope != null ? String(form.dataScope) : form.dataScope;
    openDataScope.value = true;
    deptTreePromise.then((res) => {
      setDeptCheckedKeys(res.checkedKeys);
    });
    title.value = "分配数据权限";
  });
}

function submitDataScope() {
  if (form.roleId != undefined) {
    form.deptIds = getDeptAllCheckedKeys();
    form.dataScope = unwrapSelectValue(form.dataScope) ?? form.dataScope;
    dataScope(form).then(() => {
      toast.add({ title: "修改成功", color: "success" });
      openDataScope.value = false;
      getList();
    });
  }
}

function cancelDataScope() {
  openDataScope.value = false;
  reset();
}

const columns = [
  {
    id: "selection",
    header: () => h("span"),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "roleId",
    header: "角色编号",
    size: 120,
    cell: ({ row }) => h("span", String(row.original.roleId ?? "")),
  },
  {
    accessorKey: "roleName",
    header: "角色名称",
    size: 150,
    cell: ({ row }) => h("span", row.original.roleName ?? ""),
  },
  {
    accessorKey: "roleKey",
    header: "权限字符",
    size: 150,
    cell: ({ row }) => h("span", row.original.roleKey ?? ""),
  },
  {
    accessorKey: "roleSort",
    header: "显示顺序",
    size: 100,
    cell: ({ row }) => h("span", String(row.original.roleSort ?? "")),
  },
  {
    id: "status",
    header: "状态",
    size: 100,
    cell: ({ row }) =>
      h(resolveComponent("USwitch"), {
        modelValue: row.original.status,
        disabled: Number(row.original.roleId) === 1,
        "onUpdate:modelValue": (v) => {
          row.original.status = v;
          handleStatusChange(row.original);
        },
        trueValue: "0",
        falseValue: "1",
      }),
  },
  {
    accessorKey: "createTime",
    header: "创建时间",
    cell: ({ row }) =>
      h(
        "span",
        row.original.createTime ? parseTime(row.original.createTime) : "",
      ),
  },
  {
    id: "actions",
    header: "操作",
    enableSorting: false,
    cell: ({ row }) => {
      if (Number(row.original.roleId) === 1) {
        return h("span", { class: "text-xs text-muted" }, "内置角色");
      }
      return h("div", { class: "flex gap-1 items-center" }, [
        h(
          UButton,
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-edit",
            onClick: () => handleUpdate(row.original),
          },
          () => "",
        ),
        h(
          UButton,
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-trash",
            onClick: () => handleDelete(row.original),
          },
          () => "",
        ),
        h(
          UButton,
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-shield-check",
            onClick: () => handleDataScope(row.original),
          },
          () => "",
        ),
        h(
          UButton,
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-user",
            onClick: () => handleAuthUser(row.original),
          },
          () => "",
        ),
      ]);
    },
  },
];

onMounted(() => {
  getList();
});
</script>
