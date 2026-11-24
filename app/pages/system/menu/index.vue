<template>
  <div class="app-container absolute inset-0 overflow-y-auto">
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <UInput
        v-model="queryParams.menuName"
        placeholder="请输入菜单名称"
        clearable
        class="w-52"
        @keyup.enter="handleQuery"
      />
      <USelect
        v-model="queryParams.status"
        :items="sys_normal_disable"
        placeholder="菜单状态"
        clearable
        class="w-52"
      />
      <UButton color="primary" icon="i-lucide-search" @click="handleQuery"
        >搜索</UButton
      >
      <UButton variant="outline" icon="i-lucide-rotate-ccw" @click="resetQuery"
        >重置</UButton
      >
    </div>

    <div class="flex items-center gap-2 mb-4">
      <UButton
        color="primary"
        variant="outline"
        icon="i-lucide-plus"
        @click="handleAdd()"
        >新增</UButton
      >
      <UButton
        color="info"
        variant="outline"
        icon="i-lucide-list-tree"
        @click="toggleExpandAll"
        >展开/折叠</UButton
      >
      <right-toolbar
        v-model:showSearch="showSearch"
        @queryTable="getList"
        class="ml-auto"
      />
    </div>

    <TkUTable
      :loading="loading"
      :data="menuList"
      :columns="columns"
      v-model:expanded="expandedRows"
      :expanded-options="expandedOptions"
      :get-sub-rows="getMenuSubRows"
      :get-row-id="getMenuRowId"
      :ui="{
        tbody: '[&>tr:has(td[colspan])]:hidden',
        td: 'p-2 text-sm text-default whitespace-nowrap',
        th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold',
      }"
    />

    <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <UForm
          ref="menuFormRef"
          :state="form"
          :rules="rules"
          class="space-y-4"
          @submit="submitForm"
        >
          <UFormField label="上级菜单">
            <UPopover class="w-full">
              <template #trigger>
                <UInput
                  :model-value="parentMenuLabel"
                  placeholder="选择上级菜单"
                  readonly
                  class="cursor-pointer"
                />
              </template>
              <div class="p-1 max-h-72 overflow-y-auto min-w-56">
                <UTree
                  :model-value="selectedTreeItem"
                  @update:model-value="onTreeSelect"
                  :items="treeMenuOptions"
                  :get-key="(item) => String(item.menuId)"
                  :default-expanded="treeDefaultExpanded"
                  color="primary"
                  size="sm"
                />
              </div>
            </UPopover>
          </UFormField>
          <UFormField label="菜单类型" name="menuType" required>
            <URadioGroup
              v-model="form.menuType"
              :items="[
                { label: '目录', value: 'M' },
                { label: '菜单', value: 'C' },
              ]"
            />
          </UFormField>
          <UFormField
            label="菜单图标"
            name="icon"
            class="grid grid-cols-1 sm:grid-cols-2"
          >
            <UPopover placement="bottom-start" :width="540" trigger="click">
              <template #reference>
                <UInput
                  v-model="form.icon"
                  placeholder="点击选择图标"
                  @blur="showSelectIcon"
                  readonly
                >
                  <template #leading>
                    <svg-icon
                      v-if="form.icon"
                      :icon-class="form.icon"
                      style="height: 32px; width: 16px"
                    />
                    <UIcon name="i-lucide-search" class="size-4" />
                  </template>
                </UInput>
              </template>
              <icon-select
                ref="iconSelectRef"
                @selected="selected"
                :active-icon="form.icon"
              />
            </UPopover>
          </UFormField>
          <UFormField label="显示排序" name="orderNum" required>
            <UInputNumber v-model="form.orderNum" :min="0" />
          </UFormField>
          <UFormField label="菜单名称" name="menuName" required>
            <UInput v-model="form.menuName" placeholder="请输入菜单名称" />
          </UFormField>
          <UFormField v-if="form.menuType != 'M'">
            <template #label>
              <span class="inline-flex items-center gap-1">
                权限字符
                <UTooltip
                  text="页面菜单的权限标识，用于菜单和数据范围关联"
                  placement="top"
                >
                  <UIcon name="i-lucide-help-circle" class="size-4" />
                </UTooltip>
              </span>
            </template>
            <UInput
              v-model="form.perms"
              placeholder="请输入权限标识"
              :maxlength="100"
            />
          </UFormField>
          <UFormField>
            <template #label>
              <span class="inline-flex items-center gap-1">
                显示状态
                <UTooltip
                  text="选择隐藏则权限目录不会出现在管理列表中"
                  placement="top"
                >
                  <UIcon name="i-lucide-help-circle" class="size-4" />
                </UTooltip>
              </span>
            </template>
            <URadioGroup v-model="form.visible" :items="sys_show_hide" />
          </UFormField>
          <UFormField>
            <template #label>
              <span class="inline-flex items-center gap-1">
                菜单状态
                <UTooltip
                  text="选择停用则该权限标识不可再用于授权"
                  placement="top"
                >
                  <UIcon name="i-lucide-help-circle" class="size-4" />
                </UTooltip>
              </span>
            </template>
            <URadioGroup v-model="form.status" :items="sys_normal_disable" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton color="neutral" @click="cancel">取 消</UButton>
        <UButton color="primary" @click="submitForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="Menu">
import { h } from "vue";
import {
  addMenu,
  delMenu,
  getMenu,
  listMenu,
  updateMenu,
} from "@/api/system/menu";
import SvgIcon from "@/components/SvgIcon";
import IconSelect from "@/components/IconSelect";
import { useDict } from "@/utils/dict";
import { TkUTable } from "@ctk-system/ui";
import { parseTime } from "@/utils/helpers";
const toast = useToast();

const { proxy } = getCurrentInstance();
const { sys_show_hide, sys_normal_disable } = useDict(
  "sys_show_hide",
  "sys_normal_disable",
);

const menuList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const title = ref("");
const menuOptions = ref([]);
const expandedRows = ref({});
const iconSelectRef = ref(null);
const menuFormRef = ref(null);

const queryParams = reactive({
  menuName: undefined,
  status: undefined,
});
const form = reactive({});
const rules = {
  menuName: [{ required: true, message: "菜单名称不能为空", trigger: "blur" }],
  orderNum: [{ required: true, message: "菜单顺序不能为空", trigger: "blur" }],
};

// --- custom tree-select helpers ---
function findMenuItem(items, id) {
  for (const item of items) {
    if (item.menuId === id) return item;
    if (item.children?.length) {
      const found = findMenuItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getPathToItem(items, id, path = []) {
  for (const item of items) {
    if (item.menuId === id) return [...path, String(item.menuId)];
    if (item.children?.length) {
      const found = getPathToItem(item.children, id, [
        ...path,
        String(item.menuId),
      ]);
      if (found) return found;
    }
  }
  return null;
}

const parentMenuLabel = computed(() => {
  if (!form.parentId || form.parentId === 0) return "";
  const item = findMenuItem(menuOptions.value, form.parentId);
  return item?.menuName ?? "";
});

const treeMenuOptions = computed(() => {
  const transform = (items) =>
    items.map((item) => ({
      ...item,
      label: item.menuName,
      children: item.children ? transform(item.children) : [],
    }));
  return transform(menuOptions.value);
});

const selectedTreeItem = computed(() => {
  if (!form.parentId || form.parentId === 0) return undefined;
  return findMenuItem(treeMenuOptions.value, form.parentId);
});

const treeDefaultExpanded = computed(() => {
  const keys = getPathToItem(menuOptions.value, form.parentId) ?? [];
  if (!keys.includes("0") && menuOptions.value.length > 0) {
    keys.unshift("0");
  }
  return keys;
});

function onTreeSelect(item) {
  if (item) {
    form.parentId = item.menuId;
  }
}

function getList() {
  loading.value = true;
  listMenu(queryParams).then((response) => {
    const tree = proxy.handleTree(response.data, "menuId");
    menuList.value = tree;
    expandedRows.value = Object.fromEntries(
      tree
        .filter((item) => item.children?.length)
        .map((item) => [String(item.menuId), true]),
    );
    loading.value = false;
  });
}

function getTreeselect() {
  menuOptions.value = [];
  listMenu().then((response) => {
    const menu = { menuId: 0, menuName: "主类目", children: [] };
    menu.children = proxy.handleTree(response.data, "menuId");
    menuOptions.value.push(menu);
  });
}

function cancel() {
  open.value = false;
  reset();
}

function reset() {
  Object.assign(form, {
    menuId: undefined,
    parentId: 0,
    menuName: undefined,
    icon: undefined,
    menuType: "M",
    orderNum: undefined,
    isFrame: "1",
    isCache: "0",
    visible: "0",
    status: "0",
  });
  menuFormRef.value?.clear?.();
}

function showSelectIcon() {
  iconSelectRef.value?.reset();
}

function selected(name) {
  form.icon = name;
}

function handleQuery() {
  getList();
}

function resetQuery() {
  queryParams.menuName = undefined;
  queryParams.status = undefined;
  getList();
}

function getMenuSubRows(row) {
  return row.children || [];
}

function getMenuRowId(row) {
  return String(row.menuId);
}

const expandedOptions = {
  getRowCanExpand: (row) => Boolean(row.original.children?.length),
};

function handleAdd(row) {
  reset();
  getTreeselect();
  if (row != null && row.menuId) {
    form.parentId = row.menuId;
  } else {
    form.parentId = 0;
  }
  open.value = true;
  title.value = "添加菜单";
}

function toggleExpandAll() {
  expandedRows.value = expandedRows.value === true ? {} : true;
}

async function handleUpdate(row) {
  reset();
  await getTreeselect();
  getMenu(row.menuId).then((response) => {
    Object.assign(form, response.data);
    open.value = true;
    title.value = "修改菜单";
  });
}

async function submitForm() {
  for (const [field, ruleList] of Object.entries(rules)) {
    for (const rule of ruleList) {
      if (rule.required && !form[field]) {
        toast.add({ title: rule.message, color: "error" });
        return;
      }
    }
  }
  if (form.menuId != undefined) {
    await updateMenu(form);
    toast.add({ title: "修改成功", color: "success" });
  } else {
    await addMenu(form);
    toast.add({ title: "新增成功", color: "success" });
  }
  open.value = false;
  getList();
}

function handleDelete(row) {
  if (!confirm(`是否确认删除名称为"${row.menuName}"的数据项?`)) return;
  delMenu(row.menuId).then(() => {
    getList();
    toast.add({ title: "删除成功", color: "success" });
  });
}

const dictLabel = (list, value) =>
  list?.find?.((d) => d.value === value)?.label ?? value ?? "";

const columns = [
  {
    accessorKey: "menuName",
    header: "菜单名称",
    minSize: 160,
    cell: ({ row }) => {
      const canExpand = row.getCanExpand();
      const expanded = row.getIsExpanded();
      const toggleButton = canExpand
        ? h(resolveComponent("UButton"), {
            variant: "ghost",
            color: "neutral",
            size: "xs",
            icon: expanded
              ? "i-lucide-chevron-down"
              : "i-lucide-chevron-right",
            class: "shrink-0",
            "aria-label": expanded ? "折叠菜单" : "展开菜单",
            onClick: (event) => {
              event.stopPropagation();
              row.toggleExpanded();
            },
          })
        : h("span", { class: "inline-block size-6 shrink-0" });

      return h(
        "div",
        {
          class: "flex items-center gap-1",
          style: { paddingLeft: `${row.depth * 1.25}rem` },
        },
        [
          toggleButton,
          h(
            "span",
            { class: row.depth === 0 ? "font-semibold" : "" },
            row.original.menuName ?? "",
          ),
        ],
      );
    },
  },
  {
    accessorKey: "icon",
    header: "图标",
    size: 100,
    cell: ({ row }) =>
      h(
        "span",
        { class: "inline-flex items-center" },
        h(SvgIcon, {
          iconClass: row.original.icon,
          style: "height: 18px;width: 18px;",
        }),
      ),
  },
  {
    accessorKey: "orderNum",
    header: "排序",
    size: 60,
    cell: ({ row }) => h("span", String(row.original.orderNum ?? "")),
  },
  {
    accessorKey: "perms",
    header: "权限标识",
    cell: ({ row }) => h("span", row.original.perms ?? ""),
  },
  {
    accessorKey: "status",
    header: "状态",
    size: 80,
    cell: ({ row }) =>
      h("span", dictLabel(sys_normal_disable.value, row.original.status)),
  },
  {
    accessorKey: "createTime",
    header: "创建时间",
    size: 160,
    cell: ({ row }) =>
      h(
        "span",
        row.original.createTime ? parseTime(row.original.createTime) : "",
      ),
  },
  {
    id: "actions",
    header: "操作",
    size: 210,
    enableSorting: false,
    cell: ({ row }) =>
      h("div", { class: "flex gap-1 items-center" }, [
        h(
          resolveComponent("UButton"),
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-edit",
            onClick: () => handleUpdate(row.original),
          },
          () => "修改",
        ),
        h(
          resolveComponent("UButton"),
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-plus",
            onClick: () => handleAdd(row.original),
          },
          () => "新增",
        ),
        h(
          resolveComponent("UButton"),
          {
            variant: "link",
            color: "primary",
            icon: "i-lucide-trash",
            onClick: () => handleDelete(row.original),
          },
          () => "删除",
        ),
      ]),
  },
];

onMounted(() => {
  getList();
});
</script>
