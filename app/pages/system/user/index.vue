<template>
  <div class="user-page app-container absolute inset-0 flex min-h-0 gap-2 sm:gap-2 overflow-hidden px-2 pt-2 pb-0 sm:px-3 sm:pt-3 sm:pb-0">
    <div class="user-mobile-dept-trigger items-center gap-2">
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-building-2"
        class="min-w-0 flex-1 justify-start"
        @click="mobileDeptOpen = true"
      >
        <span class="truncate">{{ selectedDeptId ? `部门：${selectedDeptLabel}` : '选择部门筛选用户' }}</span>
      </UButton>
      <UButton
        v-if="selectedDeptId"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        aria-label="清除部门筛选"
        @click="resetQuery"
      />
    </div>

    <div class="user-dept-panel flex min-h-0 w-1/5 min-w-[260px] flex-col rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800">
      <UInput v-model="deptName" placeholder="请输入部门名称" clearable class="mb-4" icon="i-lucide-search" />
      <div class="flex-1 overflow-y-auto pr-1">
        <div class="space-y-0.5">
          <div
            v-for="node in displayedDeptNodes"
            :key="node.id"
            :style="{ paddingLeft: `${node.level * 16}px` }"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors group"
            :class="[
              selectedDeptId === node.id 
                ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 font-medium' 
                : 'text-default hover:bg-gray-50 dark:hover:bg-gray-800/40'
            ]"
            @click="handleNodeClick(node)"
          >
            <!-- 展开折叠按钮 -->
            <span v-if="node.children.length > 0" class="flex items-center justify-center w-4 h-4 cursor-pointer text-gray-400 hover:text-primary" @click.stop="toggleNode(node)">
              <UIcon :name="node.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
            </span>
            <span v-else class="w-4"></span>
            
            <UIcon :name="node.children.length > 0 ? 'i-lucide-folder' : 'i-lucide-file-text'" class="size-4 shrink-0" :class="selectedDeptId === node.id ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'" />
            <span class="truncate flex-1">{{ node.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="user-content flex min-h-0 min-w-0 flex-1 flex-col">
      <div v-show="showSearch" class="user-query mb-3 flex flex-wrap items-end gap-2 sm:mb-4">
        <UInput v-model="queryParams.userName" placeholder="请输入登录账号" clearable class="user-query__field w-60" @keyup.enter="handleQuery" />
        <UInput v-model="queryParams.phonenumber" placeholder="请输入手机号码" clearable class="user-query__field w-60" @keyup.enter="handleQuery" />
        <USelect v-model="queryParams.status" :items="sys_normal_disable" placeholder="用户状态" clearable class="user-query__field w-60" />
        <div class="user-query__date">
          <TkDateRangePicker v-model="dateRange" class="w-full" />
        </div>
        <UButton color="primary" icon="i-lucide-search" class="user-query__button" @click="handleQuery">搜索</UButton>
        <UButton variant="outline" icon="i-lucide-rotate-ccw" class="user-query__button" @click="resetQuery">重置</UButton>
      </div>

      <div class="user-actions mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <UButton color="primary" variant="outline" icon="i-lucide-plus" class="user-action-button" @click="handleAdd">新增</UButton>
        <UButton color="success" variant="outline" icon="i-lucide-edit" class="user-action-button" :disabled="single" @click="handleUpdate">修改</UButton>
        <UButton color="error" variant="outline" icon="i-lucide-trash" class="user-action-button" :disabled="multiple" @click="handleDelete">删除</UButton>
        <UButton color="info" variant="outline" icon="i-lucide-upload" class="user-action-button" @click="handleImport">导入</UButton>
        <UButton color="warning" variant="outline" icon="i-lucide-download" class="user-action-button" @click="handleExport">导出</UButton>
        <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" :columns="columns" class="user-column-toggle ml-auto" />
      </div>

      <div class="user-table-container min-h-0 flex-1 overflow-hidden">
        <TkUTable
          :get-row-id="row => String(row.userId)"
          :loading="loading"
          :data="userList"
          :columns="columnsTable"
          wrapper-class="user-table-scroll"
          :ui="{ td: 'p-2 text-sm text-default whitespace-nowrap', th: 'px-3 py-2 text-sm text-highlighted text-left font-semibold' }"
          style="height: 100%"
          @selection-change="handleSelectionChange"
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
    </div>

    <USlideover
      v-model:open="mobileDeptOpen"
      side="left"
      :ui="{ content: '!w-[min(88vw,22rem)] !max-w-none rounded-r-2xl rounded-l-none' }"
    >
      <template #content>
        <div class="flex h-full min-h-0 flex-col bg-app-surface p-3">
          <div class="mb-3 flex shrink-0 items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-semibold text-highlighted">选择部门</h2>
              <p class="mt-0.5 truncate text-xs text-muted">{{ selectedDeptId ? selectedDeptLabel : '当前为全部部门' }}</p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="关闭部门筛选" @click="mobileDeptOpen = false" />
          </div>
          <UInput v-model="deptName" placeholder="请输入部门名称" clearable class="mb-3 shrink-0" icon="i-lucide-search" />
          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <div class="space-y-0.5">
              <div
                v-for="node in displayedDeptNodes"
                :key="`mobile-${node.id}`"
                :style="{ paddingLeft: `${node.level * 16}px` }"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-colors"
                :class="[
                  selectedDeptId === node.id
                    ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
                    : 'text-default hover:bg-gray-50 dark:hover:bg-gray-800/40'
                ]"
                @click="handleNodeClick(node)"
              >
                <span v-if="node.children.length > 0" class="flex size-4 cursor-pointer items-center justify-center text-gray-400 hover:text-primary" @click.stop="toggleNode(node)">
                  <UIcon :name="node.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
                </span>
                <span v-else class="w-4"></span>
                <UIcon :name="node.children.length > 0 ? 'i-lucide-folder' : 'i-lucide-file-text'" class="size-4 shrink-0" :class="selectedDeptId === node.id ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'" />
                <span class="flex-1 truncate">{{ node.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="open" :title="title" :ui="{ content: 'w-[calc(100vw-2rem)] max-w-3xl max-h-[90dvh]', header: 'px-5 py-4 sm:px-6', body: 'overflow-y-auto px-5 py-5 sm:px-6', footer: 'px-5 py-4 sm:px-6' }">
      <template #body>
        <UForm ref="userFormRef" :state="form" :rules="rules" class="space-y-5" @submit="submitForm">
          <!-- 仅「添加用户」时展示企微开通说明 -->
          <div
            v-if="form.userId == undefined"
            class="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/80 dark:bg-blue-950/30 px-3 py-2.5 text-xs text-app-text-secondary leading-relaxed"
          >
            <div class="font-semibold text-blue-700 dark:text-blue-300 mb-1">企业微信开通通知</div>
            <p class="m-0 text-app-muted">
              勾选下方通知后，系统会用填写的<strong class="text-app-text">手机号</strong>在企微通讯录中匹配成员，
              并把<strong class="text-app-text">登录账号 + 本次设置的密码</strong>发到对方企微。
              手机号须与企微绑定手机一致；不勾选则只建账号、不发通知。
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <UFormField label="用户姓名" name="nickName" required>
              <UInput class="w-full" v-model="form.nickName" placeholder="请输入用户姓名" :maxlength="30" />
            </UFormField>
            <UFormField label="归属部门" name="deptId" class="w-full">
              <USelectMenu
                v-model="form.deptId"
                :items="flattenedDeptOptions"
                value-key="value"
                label-key="label"
                placeholder="请选择归属部门"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="手机号码"
              name="phonenumber"
              :required="form.userId == undefined && sendWecomNotify"
              :help="form.userId == undefined
                ? (sendWecomNotify
                  ? '必填：须与企业微信通讯录中的手机号一致'
                  : '选填：若需企微通知请先勾选下方选项')
                : undefined"
            >
              <UInput
                class="w-full"
                v-model="form.phonenumber"
                :placeholder="sendWecomNotify && form.userId == undefined ? '企微绑定的手机号（必填）' : '请输入手机号码'"
                :maxlength="11"
              />
            </UFormField>
            <UFormField label="邮箱" name="email">
              <UInput class="w-full" v-model="form.email" placeholder="请输入邮箱" :maxlength="50" />
            </UFormField>
            <UFormField label="登录账号" name="userName" required>
              <UInput class="w-full" v-model="form.userName" placeholder="请输入登录账号" :maxlength="20" />
            </UFormField>
            <UFormField
              v-if="form.userId == undefined"
              label="用户密码"
              name="password"
              required
              :help="sendWecomNotify ? '此密码将随企微开通通知一并发送给对方' : '仅用于系统登录，不会通过企微发送'"
            >
              <UInput class="w-full" v-model="form.password" placeholder="请输入用户密码" type="password" :maxlength="20" />
            </UFormField>
            <UFormField label="用户性别">
              <USelect
                class="w-full"
                v-model="form.sex"
                :items="sys_user_sex"
                value-key="value"
                label-key="label"
                placeholder="请选择"
              />
            </UFormField>
            <UFormField label="状态">
              <URadioGroup
                orientation="horizontal"
                v-model="form.status"
                :items="sys_normal_disable"
                value-key="value"
                label-key="label"
              />
            </UFormField>
          </div>

          <div
            v-if="form.userId == undefined"
            class="rounded-lg border border-app-border bg-app-bg px-3 py-2.5 space-y-1.5"
          >
            <UCheckbox v-model="sendWecomNotify" label="通过企业微信发送开通通知" />
            <p class="m-0 pl-6 text-xs text-app-muted">
              发送内容含登录账号、密码与系统地址。取消勾选则只建账号、不发通知。
            </p>
          </div>

          <UFormField label="角色">
            <USelectMenu
              class="w-full"
              v-model="form.roleIds"
              multiple
              :items="roleSelectItems"
              value-key="value"
              label-key="label"
              placeholder="请选择角色，可多选"
            />
          </UFormField>
          <UFormField label="备注">
            <UTextarea v-model="form.remark" class="w-full" :rows="3" autoresize placeholder="补充用户说明（选填）" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="cancel">取消</UButton>
          <UButton color="primary" icon="i-lucide-check" :loading="saving" @click="submitForm">保存</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="upload.open" :title="upload.title" :ui="{ content: 'max-w-sm' }">
      <template #body>
        <div class="text-center p-4 border-2 border-dashed border-default rounded">
          <UIcon name="i-lucide-upload" class="size-8 mx-auto text-muted" />
          <div class="mt-2 text-sm">
            将文件拖到此处，或<em class="text-primary not-italic">点击上传</em>
          </div>
          <UCheckbox v-model="upload.updateSupport" class="mt-3" label="是否更新已经存在的用户数据" />
          <div class="text-xs text-muted mt-2">仅允许导入xls、xlsx格式文件。</div>
          <UButton variant="link" size="sm" class="mt-1" @click="importTemplate">下载模板</UButton>
        </div>
        <input ref="uploadInputRef" type="file" accept=".xlsx,.xls" class="hidden" @change="handleFileInput" />
      </template>
      <template #footer>
        <UButton color="neutral" @click="upload.open = false">取 消</UButton>
        <UButton color="primary" :loading="upload.isUploading" @click="submitFileForm">确 定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup name="User">
import { h, resolveComponent } from 'vue'
import request from '@/utils/request'
import { changeUserStatus, listUser, resetUserPwd, delUser, getUser, updateUser, addUser, deptTreeSelect } from '@/api/system/user'
import { getConfigKey } from '@/api/system/config'
import { useDict } from '@/utils/dict'
import { TkUTable } from '@ctk-system/ui'
import { parseTime } from '@/utils/helpers'
import useSettingsStore from '@/store/modules/settings'
const toast = useToast();

const UButton = resolveComponent('UButton')

const settingsStore = useSettingsStore()
const containerHeight = computed(() => {
  let headerHeight = 50
  if (settingsStore.tagsView) headerHeight += 34
  if (settingsStore.fixedHeader) return `calc(100vh - ${headerHeight * 2}px)`
  return `calc(100vh - ${headerHeight}px)`
})

const router = useRouter()
const { proxy } = getCurrentInstance()
const { sys_normal_disable, sys_user_sex } = useDict('sys_normal_disable', 'sys_user_sex')

const userList = ref([])
const saving = ref(false)
const currentRowId = ref(null)
const open = ref(false)
const loading = ref(true)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const total = ref(0)
const title = ref('')
const dateRange = ref([])
const deptName = ref('')
const deptOptions = ref(undefined)
const initPassword = ref(undefined)
/** 添加用户时是否发送企微开通通知（默认开启） */
const sendWecomNotify = ref(true)
const mobileDeptOpen = ref(false)
const roleOptions = ref([])
const deptTreeRef = ref(null)
const upload = reactive({
  open: false,
  title: '',
  isUploading: false,
  updateSupport: false,
})
const uploadInputRef = ref(null)

const columns = ref([
  { key: 0, label: '用户编号', visible: true },
  { key: 1, label: '登录账号', visible: true },
  { key: 2, label: '用户姓名', visible: true },
  { key: 3, label: '部门', visible: true },
  { key: 4, label: '手机号码', visible: true },
  { key: 5, label: '状态', visible: true },
  { key: 6, label: '创建时间', visible: true },
])

const queryParams = reactive({
  pageNum: 1,
  pageSize: 100,
  userName: undefined,
  phonenumber: undefined,
  status: undefined,
  deptId: undefined,
})
const form = reactive({})
const rules = {
  userName: [{ required: true, message: '登录账号不能为空', trigger: 'blur' }, { min: 2, max: 20, message: '登录账号长度必须介于 2 和 20 之间', trigger: 'blur' }],
  nickName: [{ required: true, message: '用户姓名不能为空', trigger: 'blur' }],
  password: [{ required: true, message: '用户密码不能为空', trigger: 'blur' }, { min: 5, max: 20, message: '用户密码长度必须介于 5 和 20 之间', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: ['blur', 'change'] }],
  phonenumber: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }],
}

const userFormRef = ref(null)

const flatDeptNodes = ref([]);
const selectedDeptId = ref(null);

const selectedDeptLabel = computed(() =>
  flatDeptNodes.value.find((node) => node.id === selectedDeptId.value)?.label || '全部部门',
)

function buildFlatTree(nodes, level = 0, parent = null) {
  let list = [];
  for (const node of nodes) {
    const flatNode = reactive({
      id: node.id,
      label: node.label,
      level,
      parent,
      expanded: true,
      children: []
    });
    list.push(flatNode);
    if (node.children && node.children.length > 0) {
      flatNode.children = buildFlatTree(node.children, level + 1, flatNode);
      list = list.concat(flatNode.children);
    }
  }
  return list;
}

const displayedDeptNodes = computed(() => {
  return flatDeptNodes.value.filter(node => {
    if (deptName.value) {
      const match = node.label.toLowerCase().includes(deptName.value.toLowerCase());
      if (!match) {
        const hasMatchingDescendant = (n) => {
          if (n.children && n.children.length > 0) {
            return n.children.some(child => 
              child.label.toLowerCase().includes(deptName.value.toLowerCase()) || hasMatchingDescendant(child)
            );
          }
          return false;
        };
        if (!hasMatchingDescendant(node)) {
          return false;
        }
      }
    }
    
    let p = node.parent;
    while (p) {
      if (!p.expanded) return false;
      p = p.parent;
    }
    return true;
  });
});

const flattenedDeptOptions = computed(() => {
  const result = [];
  function flatten(nodes, depth = 0) {
    for (const node of nodes || []) {
      result.push({
        label: '　'.repeat(depth) + (depth > 0 ? '├─ ' : '') + node.label,
        value: node.id,
      });
      if (node.children && node.children.length > 0) {
        flatten(node.children, depth + 1);
      }
    }
  }
  flatten(deptOptions.value);
  return result;
});

/** 角色下拉（value 为 roleId，避免提交整对象导致 Long 反序列化失败） */
const roleSelectItems = computed(() =>
  (roleOptions.value || []).map((r) => ({
    label: r.roleName,
    value: r.roleId,
    disabled: r.status == 1,
  })),
);

/**
 * 把 USelect / USelectMenu 可能绑定的 {label,value} 对象收敛成后端要的标量。
 */
function unwrapSelectValue(v) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('value' in v) return v.value;
    if ('id' in v) return v.id;
    if ('roleId' in v) return v.roleId;
    return undefined;
  }
  return v;
}

function unwrapSelectArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(unwrapSelectValue).filter((x) => x != null && x !== '');
}

/** 组装提交后端的用户 payload，保证 deptId / roleIds 等是数字而不是对象 */
function buildUserPayload(raw, isCreate) {
  const payload = {
    userId: raw.userId,
    deptId: unwrapSelectValue(raw.deptId),
    userName: raw.userName,
    nickName: raw.nickName,
    phonenumber: raw.phonenumber || undefined,
    email: raw.email || undefined,
    sex: unwrapSelectValue(raw.sex),
    status: unwrapSelectValue(raw.status) ?? raw.status,
    remark: raw.remark,
    roleIds: unwrapSelectArray(raw.roleIds),
    postIds: unwrapSelectArray(raw.postIds),
  };
  if (isCreate) {
    payload.password = raw.password;
    payload.sendWecomNotify = sendWecomNotify.value;
  }
  return payload;
}

function toggleNode(node) {
  node.expanded = !node.expanded;
}

function getDeptTree() {
  deptTreeSelect().then((response) => {
    deptOptions.value = response.data;
    flatDeptNodes.value = buildFlatTree(response.data);
  });
}

function getList() {
  loading.value = true
  return listUser(proxy.addDateRange(queryParams, dateRange.value)).then((res) => {
    loading.value = false
    userList.value = res.rows
    total.value = res.total
    currentRowId.value = null
  })
}

function handleNodeClick(node) {
  selectedDeptId.value = node.id
  queryParams.deptId = node.id
  mobileDeptOpen.value = false
  handleQuery()
}

function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

function resetQuery() {
  dateRange.value = []
  queryParams.deptId = undefined
  selectedDeptId.value = null
  handleQuery()
}

function handleDelete(row) {
  const userIds = row?.userId || ids.value
  if (!confirm(`是否确认删除用户编号为"${userIds}"的数据项？`)) return
  delUser(userIds).then(() => {
    getList()
    toast.add({ title: '删除成功', color: 'success' })
  })
}

function handleExport() {
  proxy.download('system/user/export', { ...queryParams }, `user_${Date.now()}.xlsx`)
}

function handleStatusChange(row) {
  const text = row.status === '0' ? '启用' : '停用'
  if (!confirm(`确认要"${text}""${row.userName}"用户吗?`)) {
    row.status = row.status === '0' ? '1' : '0'
    return
  }
  changeUserStatus(row.userId, row.status).then(() => {
    toast.add({ title: `${text}成功`, color: 'success' })
  }).catch(() => {
    row.status = row.status === '0' ? '1' : '0'
  })
}

function handleAuthRole(row) {
  router.push('/system/user-auth/role/' + row.userId)
}

function handleResetPwd(row) {
  const newPwd = window.prompt(`请输入"${row.userName}"的新密码 (5-20位, 不能含 < > " ' \\ |)`)
  if (!newPwd) return
  if (newPwd.length < 5 || newPwd.length > 20) {
    toast.add({ title: '用户密码长度必须介于 5 和 20 之间', color: 'error' })
    return
  }
  if (/<|>|"|'|\||\\/.test(newPwd)) {
    toast.add({ title: '不能包含非法字符：< > " \' \\ |', color: 'error' })
    return
  }
  resetUserPwd(row.userId, newPwd).then(() => {
    toast.add({ title: '修改成功', color: 'success' })
  })
}

function handleSelectionChange(selection) {
  ids.value = selection.map((item) => item.userId)
  currentRowId.value = selection.length === 1 ? selection[0].userId : null
  single.value = selection.length != 1
  multiple.value = !selection.length
}


function handleImport() {
  upload.title = '用户导入'
  upload.open = true
}

function importTemplate() {
  proxy.download('system/user/importTemplate', {}, `user_template_${Date.now()}.xlsx`)
}

function handleFileInput(event) {
  const file = event.target.files[0]
  if (!file) return
  upload.isUploading = true
  const formData = new FormData()
  formData.append('file', file)
  formData.append('updateSupport', upload.updateSupport)
  request({
    url: '/system/user/importData',
    method: 'post',
    data: formData,
  }).then((response) => {
    upload.open = false
    upload.isUploading = false
    toast.add({ title: response?.msg || '导入成功', color: 'success' })
    getList()
  }).catch(() => {
    upload.isUploading = false
    toast.add({ title: '导入失败', color: 'error' })
  })
  event.target.value = ''
}

function submitFileForm() {
  uploadInputRef.value?.click()
}

function reset() {
  Object.assign(form, {
    userId: undefined,
    deptId: undefined,
    userName: undefined,
    nickName: undefined,
    password: undefined,
    phonenumber: undefined,
    email: undefined,
    sex: undefined,
    status: '0',
    remark: undefined,
    postIds: [],
    roleIds: [],
  })
  userFormRef.value?.clear?.()
}

function cancel() {
  open.value = false
  reset()
}

function handleAdd() {
  reset()
  sendWecomNotify.value = true
  getUser().then((response) => {
    roleOptions.value = response.roles
    open.value = true
    title.value = '添加用户'
    form.password = initPassword.value
  })
}

function handleUpdate(row) {
  reset()
  sendWecomNotify.value = false
  const userId = row?.userId || ids.value
  getUser(userId).then((response) => {
    Object.assign(form, response.data)
    roleOptions.value = response.roles
    form.postIds = response.postIds
    form.roleIds = response.roleIds
    open.value = true
    title.value = '修改用户'
    form.password = ''
  })
}

async function submitForm() {
  if (saving.value) return
  const isCreate = form.userId == undefined
  for (const [field, ruleList] of Object.entries(rules)) {
    // 修改用户时不校验密码必填
    if (!isCreate && field === 'password') continue
    for (const rule of ruleList) {
      if (rule.required && !form[field]) {
        toast.add({ title: rule.message, color: 'error' })
        return
      }
      if (rule.pattern && form[field] && !rule.pattern.test(form[field])) {
        toast.add({ title: rule.message, color: 'error' })
        return
      }
    }
  }
  // 勾选企微通知时，手机号必填且格式正确
  if (isCreate && sendWecomNotify.value) {
    if (!form.phonenumber) {
      toast.add({ title: '已勾选企业微信通知，请填写手机号码', color: 'error' })
      return
    }
    if (!/^1[3-9]\d{9}$/.test(form.phonenumber)) {
      toast.add({ title: '请输入正确的手机号码', color: 'error' })
      return
    }
  } else if (form.phonenumber && !/^1[3-9]\d{9}$/.test(form.phonenumber)) {
    toast.add({ title: '请输入正确的手机号码', color: 'error' })
    return
  }

  saving.value = true
  try {
    const payload = buildUserPayload(form, isCreate)
    if (!isCreate) {
      await updateUser(payload)
      toast.add({ title: '修改成功', color: 'success' })
    } else {
      const res = await addUser(payload)
      const msg = res?.msg || res?.wecomNotifyMsg || '新增成功'
      // 通知失败时用 warning 颜色，成功/跳过用 success
      const failed = typeof msg === 'string' && (msg.includes('未发送') || msg.includes('发送失败'))
      toast.add({
        title: msg,
        color: failed ? 'warning' : 'success',
        duration: 8000,
      })
    }
    open.value = false
    await getList()
  } catch (error) {
    toast.add({ title: error?.message || '用户保存失败，请重试', color: 'error' })
  } finally {
    saving.value = false
  }
}

function getInitPassword() {
  getConfigKey('sys.user.initPassword').then((response) => {
    initPassword.value = response.msg
  })
}

const USwitch = resolveComponent('USwitch')
const UCheckbox = resolveComponent('UCheckbox')
const columnsTable = computed(() => [
  {
    id: 'select',
    header: ({ table }) => h(UCheckbox, {
      modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': value => table.toggleAllPageRowsSelected(!!value),
      'aria-label': '选择当前页用户',
    }),
    cell: ({ row }) => h(UCheckbox, {
      modelValue: row.getIsSelected(),
      'onUpdate:modelValue': value => row.toggleSelected(!!value),
      'aria-label': '选择用户',
    }),
    enableSorting: false,
    enableHiding: false,
  },
  { id: 'userId', header: '用户编号', cell: ({ row }) => h('span', String(row.original.userId ?? '')) },
  { id: 'userName', header: '登录账号', cell: ({ row }) => h('span', row.original.userName ?? '') },
  { id: 'nickName', header: '用户姓名', cell: ({ row }) => h('span', row.original.nickName ?? '') },
  { id: 'deptName', header: '部门', cell: ({ row }) => h('span', row.original.dept?.deptName ?? '') },
  { id: 'phonenumber', header: '手机号码', size: 120, cell: ({ row }) => h('span', row.original.phonenumber ?? '') },
  {
    id: 'status',
    header: '状态',
    cell: ({ row }) => h(USwitch, {
      modelValue: row.original.status,
      'onUpdate:modelValue': (v) => { row.original.status = v; handleStatusChange(row.original) },
      trueValue: '0',
      falseValue: '1',
    }),
  },
  { id: 'createTime', header: '创建时间', size: 160, cell: ({ row }) => h('span', row.original.createTime ? parseTime(row.original.createTime) : '') },
  {
    id: 'actions',
    header: '操作',
    size: 150,
    enableSorting: false,
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1 items-center' }, [
        row.original.userId !== 1 ? h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-edit', onClick: () => handleUpdate(row.original) }, () => '') : null,
        row.original.userId !== 1 ? h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-trash', onClick: () => handleDelete(row.original) }, () => '') : null,
        row.original.userId !== 1 ? h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-key', onClick: () => handleResetPwd(row.original) }, () => '') : null,
        row.original.userId !== 1 ? h(UButton, { variant: 'link', color: 'primary', icon: 'i-lucide-shield-check', onClick: () => handleAuthRole(row.original) }, () => '') : null,
      ]),
  },
])

onMounted(() => {
  getDeptTree()
  getList()
  getInitPassword()
})
</script>

<style scoped>
.user-page {
  min-width: 0;
}

.user-dept-panel,
.user-content,
.user-table-container,
.user-table-scroll {
  min-height: 0;
}

.user-mobile-dept-trigger {
  display: none;
}

.user-query__date {
  min-width: 0;
}

.user-action-button {
  white-space: nowrap;
}

@media (max-width: 899px) {
  .user-page {
    flex-direction: column;
    gap: 0.75rem;
  }

  .user-mobile-dept-trigger {
    display: flex;
    flex: 0 0 auto;
  }

  .user-dept-panel {
    display: none;
  }

  .user-query {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .user-query > * {
    width: 100%;
    min-width: 0;
  }

  .user-query__date {
    grid-column: 1 / -1;
  }

  .user-query__button {
    justify-content: center;
  }

  .user-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .user-action-button {
    width: 100%;
    min-width: 0;
    justify-content: center;
  }

  .user-column-toggle {
    grid-column: 2;
    justify-self: end;
    margin-left: 0;
  }

  .user-table-scroll {
    overflow: auto;
  }

  .user-table-scroll :deep(table) {
    min-width: 760px;
  }

  .user-table-scroll :deep(th),
  .user-table-scroll :deep(td) {
    white-space: nowrap;
  }
}

@media (max-width: 520px) {
  .user-page {
    padding: 0.5rem;
  }

  .user-query {
    grid-template-columns: minmax(0, 1fr);
  }

  .user-query__date {
    grid-column: auto;
  }
}
</style>
