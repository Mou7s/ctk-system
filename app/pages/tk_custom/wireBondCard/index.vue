<template>
  <div class="wire-bond-page absolute inset-0 overflow-y-auto p-4 md:p-6 flex flex-col gap-5 bg-gray-50/70 dark:bg-gray-900/70">
    <!-- 顶部标题区 -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200 dark:border-gray-800">
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <UIcon name="i-lucide-printer" class="w-6 h-6 text-primary-500" />
            焊线机工卡打印 (70×40mm)
          </h1>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
            <UIcon name="i-lucide-shield-alert" class="w-3.5 h-3.5 mr-1" />
            管理员专属
          </span>
        </div>
        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
          为焊线部指定员工随机生成无规律 6 位数字登录密码，生成专属密码 Code 128 条形码，打印贴在工卡上用于机台快捷扫码登入。
        </p>
      </div>

      <!-- 右侧快速统计与操作 -->
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="fetchUserList"
        >
          刷新
        </UButton>
        <UButton
          icon="i-lucide-printer"
          color="primary"
          :disabled="selectedUsers.length === 0"
          @click="triggerBatchPrint"
        >
          批量打印选中标签 ({{ selectedUsers.length }})
        </UButton>
      </div>
    </header>

    <!-- 指标概览卡片 -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
        <div>
          <div class="text-xs text-gray-500 dark:text-gray-400 font-medium">焊线部在册员工</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ userList.length }}</div>
        </div>
        <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <UIcon name="i-lucide-users" class="w-5 h-5" />
        </div>
      </div>

      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
        <div>
          <div class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">已设置登录密码</div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{{ readyCount }}</div>
        </div>
        <div class="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <UIcon name="i-lucide-key-round" class="w-5 h-5" />
        </div>
      </div>

      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
        <div>
          <div class="text-xs text-amber-600 dark:text-amber-400 font-medium">待生成密码</div>
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{{ missingCount }}</div>
        </div>
        <div class="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <UIcon name="i-lucide-alert-circle" class="w-5 h-5" />
        </div>
      </div>

      <div class="p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
        <div>
          <div class="text-xs text-primary-600 dark:text-primary-400 font-medium">当前已选中打印</div>
          <div class="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">{{ selectedUsers.length }}</div>
        </div>
        <div class="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center">
          <UIcon name="i-lucide-check-square" class="w-5 h-5" />
        </div>
      </div>
    </div>

    <!-- 主体区域：左侧列表表格 + 右侧实时 80x40 拟真预览 -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- 左侧：员工列表与操作 -->
      <div class="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
        <!-- 工具栏 -->
        <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-2.5 flex-1 min-w-[200px]">
            <UInput
              v-model="searchKeyword"
              placeholder="搜索员工姓名..."
              icon="i-lucide-search"
              clearable
              class="w-full sm:w-64"
            />
            <div class="flex items-center gap-1">
              <UButton
                size="xs"
                :color="filterMode === 'all' ? 'primary' : 'neutral'"
                :variant="filterMode === 'all' ? 'solid' : 'ghost'"
                @click="filterMode = 'all'"
              >
                全部 ({{ userList.length }})
              </UButton>
              <UButton
                size="xs"
                :color="filterMode === 'missing' ? 'warning' : 'neutral'"
                :variant="filterMode === 'missing' ? 'solid' : 'ghost'"
                @click="filterMode = 'missing'"
              >
                待生成 ({{ missingCount }})
              </UButton>
              <UButton
                size="xs"
                :color="filterMode === 'ready' ? 'success' : 'neutral'"
                :variant="filterMode === 'ready' ? 'solid' : 'ghost'"
                @click="filterMode = 'ready'"
              >
                已就绪 ({{ readyCount }})
              </UButton>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              size="sm"
              color="warning"
              variant="soft"
              icon="i-lucide-sparkles"
              :loading="generatingBatch"
              @click="handleResetAllRandomPasswords"
            >
              一键随机重置全员数字密码
            </UButton>

            <UButton
              v-if="selectedUsers.length > 0"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-key"
              :loading="generatingBatch"
              @click="handleRegenerateSelectedPasswords"
            >
              随机重置选中人员密码
            </UButton>
          </div>
        </div>

        <!-- 员工列表表格 -->
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-xs overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs md:text-sm border-collapse">
              <thead>
                <tr class="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs">
                  <th class="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      :checked="isAllFilteredSelected"
                      :indeterminate="isIndeterminate"
                      @change="toggleSelectAllFiltered"
                      class="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </th>
                  <th class="p-3 font-semibold">员工姓名</th>
                  <th class="p-3 font-semibold">机台登录密码</th>
                  <th class="p-3 font-semibold">状态</th>
                  <th class="p-3 font-semibold text-right pr-4">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800/80">
                <tr v-if="loading" class="text-center">
                  <td colspan="5" class="p-8 text-gray-400">
                    <div class="flex items-center justify-center gap-2">
                      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-primary-500" />
                      <span>正在加载焊线部员工通讯录...</span>
                    </div>
                  </td>
                </tr>

                <tr v-else-if="filteredList.length === 0" class="text-center">
                  <td colspan="5" class="p-8 text-gray-400">
                    未找到符合条件的员工记录
                  </td>
                </tr>

                <tr
                  v-for="item in filteredList"
                  :key="item.userid"
                  class="hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors cursor-pointer"
                  :class="{ 'bg-primary-50/30 dark:bg-primary-950/30': previewUser?.userid === item.userid }"
                  @click="previewUser = item"
                >
                  <td class="p-3 text-center" @click.stop>
                    <input
                      type="checkbox"
                      :value="item.userid"
                      v-model="selectedUserIds"
                      class="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </td>
                  <td class="p-3 font-medium text-gray-900 dark:text-white">
                    <div class="flex items-center gap-2">
                      <span class="inline-block w-2 h-2 rounded-full" :class="item.hasPassword ? 'bg-emerald-500' : 'bg-amber-400'"></span>
                      <span>{{ item.name }}</span>
                    </div>
                  </td>
                  <td class="p-3 font-mono" @click.stop>
                    <div v-if="item.password" class="flex items-center gap-1.5">
                      <span class="font-bold tracking-wider text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/60 px-2 py-0.5 rounded text-xs">
                        {{ showPasswordPlain ? item.password : '••••••' }}
                      </span>
                      <button
                        title="复制密码"
                        @click="copyText(item.password)"
                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <UIcon name="i-lucide-copy" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="重新随机生成"
                        @click="handleRegenerateSinglePassword(item)"
                        class="text-gray-400 hover:text-primary-500"
                      >
                        <UIcon name="i-lucide-refresh-cw" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span v-else class="text-xs text-amber-500 italic">尚未配置</span>
                  </td>
                  <td class="p-3">
                    <span
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="item.hasPassword ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'"
                    >
                      {{ item.hasPassword ? '已就绪' : '待生成' }}
                    </span>
                  </td>
                  <td class="p-3 text-right pr-4" @click.stop>
                    <div class="flex items-center justify-end gap-1.5">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-edit-2"
                        @click="openEditModal(item)"
                      >
                        编辑
                      </UButton>
                      <UButton
                        size="xs"
                        color="primary"
                        variant="soft"
                        icon="i-lucide-printer"
                        @click="printSingleUser(item)"
                      >
                        打印
                      </UButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 右侧：70x40 真实物理比例拟真预览 -->
      <div class="lg:col-span-5 xl:col-span-4 sticky top-6 flex flex-col gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700/80 shadow-sm flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-scan" class="w-5 h-5 text-primary-500" />
              <h2 class="text-base font-bold text-gray-900 dark:text-white">标签效果实时预览</h2>
            </div>
            <span class="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              70mm × 40mm
            </span>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400">
            下方为 70×40mm 物理热敏标签的 1:1 等比例拟真预览（仅保留员工姓名与单一密码 Code 128 矢量条码）：
          </p>

          <!-- 拟真标签卡片实体 (70x40 宽高比 7:4) -->
          <div v-if="previewTarget" class="w-full flex justify-center py-2">
            <div class="relative w-full max-w-[315px] aspect-[70/40] bg-white text-black rounded-lg border-2 border-dashed border-gray-300 shadow-md p-3 flex flex-col justify-between select-none overflow-hidden font-sans">
              <!-- 顶部 Header: 标题 + 员工姓名与部门 -->
              <div class="flex items-center justify-between border-b border-gray-300 pb-1.5">
                <span class="text-[11px] font-semibold text-gray-800 tracking-tight">
                  {{ printHeaderTitle }}
                </span>
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-bold text-black">{{ previewTarget.name }}</span>
                  <span class="text-[10px] text-gray-700 border border-gray-300 px-1 py-0.2 rounded font-medium">焊线部</span>
                </div>
              </div>

              <!-- 中下部：单一放大的密码条形码 -->
              <div class="flex flex-col items-center justify-center flex-1 py-1">
                <div class="w-full flex items-center justify-between text-[10px] text-gray-600 px-1 mb-1 font-mono">
                  <span class="font-semibold">登录密码 PWD:</span>
                  <span class="font-bold text-gray-400 tracking-widest">{{ previewTarget.password ? '••••••' : '未配置' }}</span>
                </div>
                <!-- 密码矢量条码 -->
                <div
                  v-if="previewTarget.password"
                  class="w-full h-20 flex items-center justify-center overflow-hidden"
                  v-html="renderBarcode(previewTarget.password, 60)"
                ></div>
                <div v-else class="h-20 flex items-center justify-center text-xs text-amber-500 italic">
                  点击左侧按钮生成随机数字密码后即可预览条码
                </div>
              </div>
            </div>
          </div>

          <div v-else class="w-full aspect-[70/40] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 text-xs p-4 text-center">
            <UIcon name="i-lucide-mouse-pointer-click" class="w-6 h-6 mb-2" />
            <span>请在左侧列表中点击选择一位员工进行预览</span>
          </div>

          <!-- 预览控制选项 -->
          <div class="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">后台表格显示明文密码</span>
              <input
                type="checkbox"
                v-model="showPasswordPlain"
                class="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-500 dark:text-gray-400">卡片抬头文本</span>
              <input
                type="text"
                v-model="printHeaderTitle"
                class="border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-xs w-44 bg-transparent text-gray-800 dark:text-gray-200"
              />
            </div>
            <div class="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded flex items-center gap-1">
              <UIcon name="i-lucide-shield-check" class="w-3.5 h-3.5 shrink-0" />
              <span>安全规范：打印工卡标签时已彻底屏蔽明文密码，仅输出供扫码枪扫描的纯条码。</span>
            </div>
          </div>

          <!-- 快速打印预览中的这张 -->
          <UButton
            block
            color="primary"
            icon="i-lucide-printer"
            :disabled="!previewTarget || !previewTarget.password"
            @click="printSingleUser(previewTarget)"
          >
            打印当前预览标签 ({{ previewTarget ? previewTarget.name : '未选' }})
          </UButton>
        </div>
      </div>
    </div>

    <!-- 弹窗：手动编辑密码 -->
    <UModal v-model:open="editModalOpen" title="修改员工机台登录密码">
      <template #content>
        <div class="p-6 flex flex-col gap-4">
          <div class="flex items-center justify-between border-b pb-3">
            <h3 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-key-round" class="w-5 h-5 text-primary-500" />
              修改机台登录密码
            </h3>
            <span class="text-xs text-gray-500">{{ editTarget?.name }}</span>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-gray-700 dark:text-gray-300">
              机台登录密码 (随机 6 位纯数字，无规律防猜解)
            </label>
            <div class="flex items-center gap-2">
              <UInput
                v-model="editPasswordInput"
                placeholder="请输入 6 位数字密码..."
                class="flex-1 font-mono text-base"
                maxlength="16"
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-sparkles"
                @click="editPasswordInput = generateRandomDigitPassword(6)"
              >
                随机生成 6 位数字
              </UButton>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t">
            <UButton color="neutral" variant="ghost" @click="editModalOpen = false">
              取消
            </UButton>
            <UButton color="primary" :loading="savingPassword" @click="handleSavePassword">
              保存密码
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 真实浏览器打印专用输出区域 (通过 Teleport 挂载到 body 下，彻底脱离 Nuxt 页面文档流) -->
    <Teleport to="body">
      <div v-if="usersToPrint.length > 0" class="wire-bond-print-portal">
        <div
          v-for="user in usersToPrint"
          :key="user.userid"
          class="wire-bond-label-page"
        >
          <!-- 标签顶部 Header -->
          <div class="label-header">
            <span class="company-title">{{ printHeaderTitle }}</span>
            <div class="user-info">
              <span class="user-name">{{ user.name }}</span>
              <span class="dept-badge">焊线部</span>
            </div>
          </div>

          <!-- 单一放大的密码条形码区 (严格保密，仅打印条码，不输出明文密码) -->
          <div class="barcode-block">
            <div class="barcode-meta">
              <span>登录密码 PWD:</span>
            </div>
            <div class="barcode-svg-wrap" v-html="renderBarcode(user.password || '000000', 60)"></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { generateCode128Svg, generateRandomDigitPassword } from '@ctk-system/shared'
import { generatePasswords, listWireBondUsers, updatePassword } from '@/api/tk_custom/wireBondCard'

const toast = useToast()

// 状态定义
const loading = ref(false)
const userList = ref([])
const searchKeyword = ref('')
const filterMode = ref('all') // 'all' | 'missing' | 'ready'
const selectedUserIds = ref([])
const previewUser = ref(null)

const showPasswordPlain = ref(false)
const printHeaderTitle = ref('车间 · 焊线机登录工卡')

const generatingBatch = ref(false)
const usersToPrint = ref([])

// 手动编辑密码弹窗
const editModalOpen = ref(false)
const editTarget = ref(null)
const editPasswordInput = ref('')
const savingPassword = ref(false)

// 统计数据
const readyCount = computed(() => userList.value.filter((u) => u.hasPassword).length)
const missingCount = computed(() => userList.value.filter((u) => !u.hasPassword).length)

// 过滤后的列表
const filteredList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return userList.value.filter((item) => {
    if (filterMode.value === 'missing' && item.hasPassword) return false
    if (filterMode.value === 'ready' && !item.hasPassword) return false
    if (!kw) return true
    return (item.name && item.name.toLowerCase().includes(kw))
      || (item.userid && item.userid.toLowerCase().includes(kw))
  })
})

// 选中的人员对象列表
const selectedUsers = computed(() => {
  const set = new Set(selectedUserIds.value)
  return userList.value.filter((u) => set.has(u.userid))
})

// 当前右侧预览目标
const previewTarget = computed(() => {
  if (previewUser.value) return previewUser.value
  if (filteredList.value.length > 0) return filteredList.value[0]
  return null
})

// 表头全选状态
const isAllFilteredSelected = computed(() => {
  if (filteredList.value.length === 0) return false
  const set = new Set(selectedUserIds.value)
  return filteredList.value.every((u) => set.has(u.userid))
})

const isIndeterminate = computed(() => {
  if (filteredList.value.length === 0) return false
  const set = new Set(selectedUserIds.value)
  const count = filteredList.value.filter((u) => set.has(u.userid)).length
  return count > 0 && count < filteredList.value.length
})

function toggleSelectAllFiltered() {
  if (isAllFilteredSelected.value) {
    const removeSet = new Set(filteredList.value.map((u) => u.userid))
    selectedUserIds.value = selectedUserIds.value.filter((id) => !removeSet.has(id))
  } else {
    const newSet = new Set(selectedUserIds.value)
    filteredList.value.forEach((u) => newSet.add(u.userid))
    selectedUserIds.value = Array.from(newSet)
  }
}

// 获取员工通讯录与机台凭证
async function fetchUserList() {
  loading.value = true
  try {
    const res = await listWireBondUsers()
    if (res && res.code === 200) {
      userList.value = res.rows || []
      // 默认选中第一个
      if (!previewUser.value && userList.value.length > 0) {
        previewUser.value = userList.value[0]
      }
    } else {
      toast.add({ title: res?.msg || '加载员工列表失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '加载焊线部员工列表失败', color: 'error' })
  } finally {
    loading.value = false
  }
}

// 渲染条码 SVG
function renderBarcode(text, height = 26) {
  if (!text) return ''
  try {
    return generateCode128Svg(text, {
      height,
      moduleWidth: 1.35,
      quietZone: 5,
      showText: false,
    })
  } catch {
    return '<span class="text-xs text-red-500">条码生成错误</span>'
  }
}

// 一键将所有焊线部员工重置为随机 6 位纯数字密码
async function handleResetAllRandomPasswords() {
  generatingBatch.value = true
  try {
    const res = await generatePasswords({ forceAll: true })
    if (res && res.code === 200) {
      toast.add({ title: res.msg || '全员随机数字密码重置成功', color: 'success' })
      await fetchUserList()
    } else {
      toast.add({ title: res?.msg || '密码生成失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '密码生成请求失败', color: 'error' })
  } finally {
    generatingBatch.value = false
  }
}

// 批量为选中的人员重新生成密码
async function handleRegenerateSelectedPasswords() {
  if (selectedUsers.value.length === 0) return
  generatingBatch.value = true
  try {
    const res = await generatePasswords({ userids: selectedUsers.value.map((u) => u.userid) })
    if (res && res.code === 200) {
      toast.add({ title: res.msg || '密码重置成功', color: 'success' })
      await fetchUserList()
    } else {
      toast.add({ title: res?.msg || '重置失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '密码重置请求失败', color: 'error' })
  } finally {
    generatingBatch.value = false
  }
}

// 单人重新生成密码
async function handleRegenerateSinglePassword(user) {
  try {
    const res = await generatePasswords({ userids: [user.userid] })
    if (res && res.code === 200) {
      toast.add({ title: `已为 ${user.name} 随机重置数字密码`, color: 'success' })
      await fetchUserList()
    } else {
      toast.add({ title: res?.msg || '重置密码失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '重置密码请求失败', color: 'error' })
  }
}

// 打开手动编辑弹窗
function openEditModal(user) {
  editTarget.value = user
  editPasswordInput.value = user.password || generateRandomDigitPassword(6)
  editModalOpen.value = true
}

// 保存手动编辑的密码
async function handleSavePassword() {
  const pwd = editPasswordInput.value.trim()
  if (!pwd) {
    toast.add({ title: '密码不能为空', color: 'warning' })
    return
  }
  savingPassword.value = true
  try {
    const res = await updatePassword({
      userid: editTarget.value.userid,
      password: pwd,
    })
    if (res && res.code === 200) {
      toast.add({ title: '密码已成功保存', color: 'success' })
      editModalOpen.value = false
      await fetchUserList()
    } else {
      toast.add({ title: res?.msg || '保存失败', color: 'error' })
    }
  } catch {
    toast.add({ title: '保存密码请求失败', color: 'error' })
  } finally {
    savingPassword.value = false
  }
}

// 复制文本
function copyText(val) {
  if (!val) return
  navigator.clipboard?.writeText(val).then(() => {
    toast.add({ title: '已复制密码到剪贴板', color: 'success' })
  })
}

// 执行真实打印
function executePrint(users) {
  usersToPrint.value = users
  nextTick(() => {
    setTimeout(() => {
      window.print()
    }, 150)
  })
}

// 单张打印
function printSingleUser(user) {
  if (!user) return
  if (!user.password) {
    toast.add({ title: '该员工尚未配置登录密码，请先生成密码后再打印', color: 'warning' })
    return
  }
  executePrint([user])
}

// 批量打印已选中的人员
function triggerBatchPrint() {
  const valid = selectedUsers.value.filter((u) => Boolean(u.password))
  if (valid.length === 0) {
    toast.add({ title: '所选员工均尚未配置密码，请先点击“生成密码”', color: 'warning' })
    return
  }
  if (valid.length < selectedUsers.value.length) {
    toast.add({
      title: `注意：已选 ${selectedUsers.value.length} 人中有 ${selectedUsers.value.length - valid.length} 人未配置密码，本次仅打印已就绪的 ${valid.length} 人`,
      color: 'info',
    })
  }
  executePrint(valid)
}

onMounted(() => {
  fetchUserList()
})
</script>

<!-- 全局打印样式：彻底屏蔽 Nuxt 页面所有背景和无关 DOM，仅打印 Teleport 出来的标签 -->
<style>
@media print {
  @page {
    size: 70mm 40mm;
    margin: 0mm !important;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  /* 彻底隐藏 body 下除了打印容器以外的所有直接子节点 (例如 #__nuxt) */
  body > *:not(.wire-bond-print-portal) {
    display: none !important;
  }

  .wire-bond-print-portal {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 70mm !important;
    background: transparent !important;
  }

  .wire-bond-label-page {
    width: 70mm !important;
    height: 40mm !important;
    max-height: 40mm !important;
    page-break-after: always !important;
    break-after: page !important;
    box-sizing: border-box !important;
    padding: 2mm 3.5mm !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    overflow: hidden !important;
    background: #ffffff !important;
    color: #000000 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  }

  .label-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    border-bottom: 0.25mm solid #333333 !important;
    padding-bottom: 0.4mm !important;
    line-height: 1.1 !important;
  }

  .company-title {
    font-size: 7.5pt !important;
    font-weight: 600 !important;
    color: #222222 !important;
  }

  .user-info {
    display: flex !important;
    align-items: center !important;
    gap: 1.5mm !important;
  }

  .user-name {
    font-size: 9.5pt !important;
    font-weight: 800 !important;
    color: #000000 !important;
  }

  .dept-badge {
    font-size: 6.5pt !important;
    border: 0.2mm solid #555555 !important;
    padding: 0.2mm 0.8mm !important;
    border-radius: 0.8mm !important;
    font-weight: 500 !important;
  }

  .barcode-block {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    margin: 0 !important;
    padding: 1mm 0 !important;
  }

  .barcode-meta {
    width: 100% !important;
    display: flex !important;
    justify-content: space-between !important;
    font-size: 7pt !important;
    font-family: monospace, monospace !important;
    color: #111111 !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    margin-bottom: 1mm !important;
  }

  .barcode-svg-wrap {
    width: 100% !important;
    height: 20mm !important;
    max-height: 20mm !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;
  }

  .barcode-svg-wrap svg {
    width: 100% !important;
    height: 100% !important;
    max-height: 20mm !important;
  }
}

/* 屏幕上预览时隐藏 portal */
@media screen {
  .wire-bond-print-portal {
    display: none !important;
  }
}
</style>
