<template>
  <div class="absolute inset-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
    <div class="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div class="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div class="flex items-center gap-3 min-w-0">
          <div class="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shrink-0">
            <UIcon name="i-lucide-network" class="size-5" />
          </div>
          <div class="min-w-0">
            <h1 class="text-base font-bold sm:text-lg truncate">企业微信组织架构</h1>
            <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span v-if="lastSync">最后同步 {{ formatSyncTime(lastSync.finishedAt) }} · {{ lastSync.remoteCount }}人</span>
              <span v-else>实时拉取企微部门 + 本地成员快照</span>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UBadge v-if="data" color="neutral" variant="soft" class="hidden sm:inline-flex">{{ data.totalDepartments }} 部门 · {{ data.totalEmployees }} 人</UBadge>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loading" @click="load">刷新</UButton>
        </div>
      </div>
    </div>

    <div class="mx-auto max-w-[1600px] p-3 sm:p-4">
      <div v-if="data" class="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
        <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">部门总数</div>
          <div class="mt-1 text-xl font-black">{{ data.totalDepartments }}</div>
          <div class="text-xs text-slate-400">含根部门</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">在职成员</div>
          <div class="mt-1 text-xl font-black text-emerald-600">{{ data.totalEmployees }}</div>
          <div class="text-xs text-slate-400">status=active</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">一级部门</div>
          <div class="mt-1 text-xl font-black">{{ firstLevelCount }}</div>
          <div class="text-xs text-slate-400">挂在根下</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div class="text-xs text-slate-500">未匹配</div>
          <div class="mt-1 text-xl font-black" :class="unassignedEmployees.length ? 'text-amber-600' : 'text-slate-400'">{{ unassignedEmployees.length }}</div>
          <div class="text-xs text-slate-400">dept 文本未命中</div>
        </div>
      </div>

      <div v-if="loading" class="grid gap-3 lg:grid-cols-[380px_1fr]">
        <USkeleton class="h-[620px] rounded-xl" />
        <USkeleton class="h-[620px] rounded-xl" />
      </div>

      <div v-else-if="errorMsg" class="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
        <p class="text-sm text-red-700 dark:text-red-300">{{ errorMsg }}</p>
        <UButton class="mt-3" color="error" variant="soft" @click="load">重试</UButton>
      </div>

      <div v-else-if="data" class="grid gap-3 lg:grid-cols-[380px_1fr] items-start">
        <!-- left -->
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col max-h-[calc(100vh-140px)] lg:sticky lg:top-[72px]">
          <div class="p-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-semibold text-sm">部门结构</h2>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevrons-up-down" @click="toggleAll">{{ allExpanded ? '全部折叠' : '全部展开' }}</UButton>
            </div>
            <UInput v-model="deptKeyword" placeholder="搜索部门..." icon="i-lucide-search" size="sm" clearable />
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
            <div v-if="!filteredVisibleRows.length" class="py-10 text-center text-sm text-slate-400">无匹配部门</div>
            <div
              v-for="row in filteredVisibleRows"
              :key="row.node.id"
              class="flex items-center gap-1 rounded-lg px-1.5 py-1.5 cursor-pointer"
              :class="selectedDeptId === row.node.id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
              :style="{ marginLeft: `${row.depth * 14}px` }"
              @click="selectDept(row.node.id)"
            >
              <button
                v-if="row.hasChildren"
                class="grid size-6 place-items-center rounded shrink-0 hover:bg-black/5 dark:hover:bg-white/10"
                @click.stop="toggleDept(row.node.id)"
              >
                <UIcon :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
              </button>
              <span v-else class="size-6 shrink-0" />
              <UIcon :name="row.hasChildren ? 'i-lucide-folder' : 'i-lucide-building-2'" class="size-3.5 shrink-0" :class="selectedDeptId === row.node.id ? 'text-indigo-500' : 'text-slate-400'" />
              <span class="flex-1 truncate text-sm font-medium">{{ row.node.name }}</span>
              <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" :class="selectedDeptId === row.node.id ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
                {{ row.node.employeeCount }}
              </span>
              <span v-if="row.node.directEmployeeCount" class="shrink-0 text-[10px] text-slate-400">直属{{ row.node.directEmployeeCount }}</span>
            </div>
            <button
              v-if="unassignedEmployees.length"
              class="mt-2 w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm border"
              :class="selectedDeptId === -1 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800' : 'border-amber-100 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 hover:bg-amber-50'"
              @click="selectedDeptId = -1"
            >
              <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
              <span class="flex-1 truncate font-medium">未分配 ({{ unassignedEmployees.length }})</span>
            </button>
          </div>
        </section>

        <!-- right -->
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col min-h-[420px]">
          <div class="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="font-bold text-base flex items-center gap-2">
                  <span class="truncate">{{ selectedTitle }}</span>
                  <UBadge color="neutral" variant="soft">{{ filteredMembers.length }} 人</UBadge>
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span v-if="selectedDept">ID {{ selectedDept.id }} · 直属 {{ selectedDept.directEmployeeCount }}人 · 含子部门 {{ selectedDept.employeeCount }}人</span>
                  <span v-else-if="selectedDeptId === -1">部门文本未命中现有架构的成员</span>
                  <span v-else>请选择左侧部门</span>
                </p>
              </div>
              <label v-if="selectedDept && hasChildren(selectedDept)" class="flex items-center gap-1.5 text-xs select-none cursor-pointer">
                <UCheckbox v-model="includeChildren" />
                含子部门
              </label>
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <UInput v-model="memberKeyword" placeholder="搜索姓名 / UserID / 职位..." icon="i-lucide-search" size="sm" class="flex-1" clearable />
              <USelect v-model="sortBy" :items="sortItems" size="sm" class="w-full sm:w-36" />
            </div>
          </div>

          <div class="flex-1">
            <div v-if="!selectedDept && selectedDeptId !== -1" class="grid place-items-center py-16 text-center">
              <div>
                <div class="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 dark:bg-slate-800"><UIcon name="i-lucide-users" class="size-6 text-slate-400" /></div>
                <p class="mt-3 text-sm text-slate-500">从左侧选择部门查看成员</p>
              </div>
            </div>
            <div v-else-if="!filteredMembers.length" class="py-12 text-center text-sm text-slate-400">无成员</div>
            <div v-else>
              <div class="hidden sm:block overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500">
                    <tr>
                      <th class="px-3 py-2 text-left font-semibold w-10">#</th>
                      <th class="px-3 py-2 text-left font-semibold">姓名</th>
                      <th class="px-3 py-2 text-left font-semibold">UserID</th>
                      <th class="px-3 py-2 text-left font-semibold">部门</th>
                      <th class="px-3 py-2 text-left font-semibold">职位</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(m, idx) in filteredMembers" :key="m.userid" class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td class="px-3 py-2.5 text-slate-400 text-xs">{{ idx + 1 }}</td>
                      <td class="px-3 py-2.5">
                        <div class="flex items-center gap-2">
                          <span class="grid size-7 place-items-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 shrink-0">{{ initials(m.name) }}</span>
                          <span class="font-medium truncate max-w-[120px]">{{ m.name }}</span>
                        </div>
                      </td>
                      <td class="px-3 py-2.5 font-mono text-xs text-slate-500">
                        <span class="inline-flex items-center gap-1">
                          {{ m.userid }}
                          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-copy" class="size-6 p-0" @click="copyText(m.userid)" />
                        </span>
                      </td>
                      <td class="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-[160px] truncate">{{ m.dept || '-' }}</td>
                      <td class="px-3 py-2.5"><UBadge v-if="m.position" color="neutral" variant="soft" size="xs">{{ m.position }}</UBadge><span v-else class="text-xs text-slate-400">-</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
                <div v-for="m in filteredMembers" :key="m.userid" class="flex items-center gap-3 px-4 py-3">
                  <span class="grid size-9 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 shrink-0">{{ initials(m.name) }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm truncate">{{ m.name }}</div>
                    <div class="text-xs text-slate-500 font-mono truncate">{{ m.userid }} · {{ m.position || '无职位' }}</div>
                    <div class="text-xs text-slate-400 truncate">{{ m.dept }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <p class="mt-3 text-center text-xs text-slate-400">生成于 {{ generatedAtText }} · 每小时自动同步 · 数据来自企业微信通讯录</p>
    </div>
  </div>
</template>

<script setup>
import { getOrganizationStructure } from '@/composables/autoGeneratedApis'

definePageMeta({ title: '组织架构', permission: 'system:organization:list' })

const loading = ref(false)
const errorMsg = ref('')
const data = ref(null)
const deptKeyword = ref('')
const memberKeyword = ref('')
const includeChildren = ref(true)
const sortBy = ref('name')
const sortItems = [
  { label: '按姓名', value: 'name' },
  { label: '按 UserID', value: 'userid' },
  { label: '按职位', value: 'position' },
]

const selectedDeptId = ref(null)
const expandedIds = ref(new Set())

const rootDepartments = computed(() => data.value?.departments ?? [])
const firstLevelCount = computed(() => {
  const roots = rootDepartments.value
  if (!roots.length) return 0
  // 若根是公司（id=1），一级部门是其 children
  if (roots.length === 1 && roots[0].children?.length) return roots[0].children.length
  return roots.length
})
const unassignedEmployees = computed(() => data.value?.unassignedEmployees ?? [])
const lastSync = computed(() => data.value?.lastSync ?? null)
const generatedAtText = computed(() => {
  const v = data.value?.generatedAt
  if (!v) return '-'
  try { return new Date(v).toLocaleString('zh-CN', { hour12: false }) } catch { return String(v) }
})

function formatSyncTime(v) {
  if (!v) return '-'
  try { return new Date(v).toLocaleString('zh-CN', { hour12: false }) } catch { return String(v) }
}

function collectIds(nodes, set) {
  for (const n of nodes) {
    if (n.children?.length) { set.add(n.id); collectIds(n.children, set) }
  }
}
const allDeptIds = computed(() => {
  const s = new Set()
  collectIds(rootDepartments.value, s)
  return s
})
const allExpanded = computed(() => expandedIds.value.size > 0 && [...allDeptIds.value].every(id => expandedIds.value.has(id)))

function toggleAll() {
  if (allExpanded.value) expandedIds.value = new Set()
  else expandedIds.value = new Set(allDeptIds.value)
}
function toggleDept(id) {
  const s = new Set(expandedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedIds.value = s
}
function selectDept(id) { selectedDeptId.value = id }

function findDept(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n
    const c = findDept(n.children || [], id)
    if (c) return c
  }
  return null
}
const selectedDept = computed(() => {
  if (selectedDeptId.value == null || selectedDeptId.value === -1) return null
  return findDept(rootDepartments.value, selectedDeptId.value)
})
const selectedTitle = computed(() => {
  if (selectedDeptId.value === -1) return '未分配部门'
  if (selectedDept.value) return selectedDept.value.name
  return '组织成员'
})
function hasChildren(node) { return !!(node.children && node.children.length) }

function collectMembers(node, includeChild) {
  if (!node) return []
  const own = [...(node.employees || [])]
  if (!includeChild) return own
  const out = [...own]
  const seen = new Set(own.map(x => x.userid))
  function walk(n) {
    for (const ch of (n.children || [])) {
      for (const e of (ch.employees || [])) if (!seen.has(e.userid)) { seen.add(e.userid); out.push(e) }
      walk(ch)
    }
  }
  walk(node)
  return out
}

const rawMembers = computed(() => {
  if (selectedDeptId.value === -1) return [...unassignedEmployees.value]
  if (!selectedDept.value) return []
  return collectMembers(selectedDept.value, includeChildren.value)
})

const filteredMembers = computed(() => {
  let list = [...rawMembers.value]
  const kw = memberKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(m =>
      String(m.name || '').toLowerCase().includes(kw) ||
      String(m.userid || '').toLowerCase().includes(kw) ||
      String(m.position || '').toLowerCase().includes(kw) ||
      String(m.dept || '').toLowerCase().includes(kw)
    )
  }
  if (sortBy.value === 'userid') list.sort((a,b) => String(a.userid).localeCompare(String(b.userid)))
  else if (sortBy.value === 'position') list.sort((a,b) => String(a.position||'').localeCompare(String(b.position||''), 'zh-CN') || String(a.name||'').localeCompare(String(b.name||''), 'zh-CN'))
  else list.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'zh-CN') || String(a.userid).localeCompare(String(b.userid)))
  return list
})

function filterTree(nodes, kw) {
  if (!kw) return nodes
  const lower = kw.toLowerCase()
  function matchNode(n) {
    const selfMatch = n.name.toLowerCase().includes(lower)
    const filteredChildren = (n.children || []).map(c => matchNode(c)).filter(Boolean)
    if (selfMatch || filteredChildren.length) {
      return { ...n, children: filteredChildren }
    }
    return null
  }
  return nodes.map(n => matchNode(n)).filter(Boolean)
}
const filteredRoots = computed(() => filterTree(rootDepartments.value, deptKeyword.value.trim()))

const filteredVisibleRows = computed(() => {
  const roots = filteredRoots.value
  const isSearching = !!deptKeyword.value.trim()
  const rows = []
  function walk(nodes, depth) {
    for (const n of nodes) {
      const hasChildren = !!(n.children && n.children.length)
      const expanded = isSearching ? true : expandedIds.value.has(n.id)
      rows.push({ node: n, depth, hasChildren, expanded })
      if (hasChildren && expanded) walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return rows
})

function initials(name) {
  const s = String(name || '').trim()
  if (!s) return '?'
  return s.slice(0, 1)
}
function copyText(t) {
  if (navigator.clipboard) navigator.clipboard.writeText(t)
  const toast = useToast()
  toast.add({ title: `已复制 ${t}`, color: 'success' })
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await getOrganizationStructure()
    if (res?.code !== 200) throw new Error(res?.msg || '加载失败')
    data.value = res.data
    if (data.value?.departments?.length && selectedDeptId.value == null) {
      const firstLevel = new Set()
      for (const r of data.value.departments) if (r.children?.length) firstLevel.add(r.id)
      expandedIds.value = firstLevel
      selectedDeptId.value = data.value.departments[0]?.id ?? null
    }
  } catch (e) {
    errorMsg.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
