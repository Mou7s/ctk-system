<template>
  <div class="absolute inset-0 overflow-y-auto bg-muted/30">
    <div class="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <header class="mb-6">
        <p class="mb-1 text-xs font-medium tracking-widest text-primary">账号设置</p>
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">个人中心</h1>
        <p class="mt-2 text-sm text-muted">管理个人资料、头像与账号安全。</p>
      </header>

      <section class="mb-6 flex flex-wrap items-center gap-5 rounded-xl border border-default bg-default p-6 sm:p-8" aria-label="个人身份">
        <userAvatar />
        <div class="min-w-0 flex-1">
          <h2 class="break-words text-xl font-semibold text-highlighted">{{ state.user.nickName || state.user.userName || '我的账号' }}</h2>
          <p class="mt-1 break-words text-sm text-muted">{{ state.user.userName || '—' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UBadge v-if="state.user.dept?.deptName" color="neutral" variant="soft" :label="state.user.dept.deptName" />
            <UBadge v-if="state.postGroup" color="neutral" variant="soft" :label="state.postGroup" />
            <UBadge v-if="state.roleGroup" variant="subtle" :label="state.roleGroup" />
          </div>
        </div>
        <p class="flex items-center gap-2 text-xs text-muted"><UIcon name="i-lucide-camera" class="size-4" />点击头像更换图片</p>
      </section>

      <div class="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="min-w-0 rounded-xl border border-default bg-default p-6">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-contact" class="size-4 text-primary" />账号概览</h2>
          <dl class="mt-5 space-y-5">
            <div v-for="item in accountDetails" :key="item.label" class="min-w-0">
              <dt class="flex items-center gap-2 text-xs text-muted"><UIcon :name="item.icon" class="size-3.5" />{{ item.label }}</dt>
              <dd class="mt-1.5 break-words pl-5.5 text-sm text-default">{{ item.value || '未设置' }}</dd>
            </div>
          </dl>
        </aside>
        <section class="min-w-0 overflow-hidden rounded-xl border border-default bg-default" aria-label="资料设置">
          <UTabs v-model="activeTab" :items="tabItems" variant="link" :ui="{ list: 'w-full border-b border-default px-4 sm:px-6', trigger: 'px-4 py-4', content: 'p-6 sm:p-8' }" class="w-full gap-0">
            <template #userinfo>
              <div class="mb-7"><h2 class="text-lg font-semibold text-highlighted">基本资料</h2><p class="mt-1 text-sm text-muted">完善联系方式，让同事更方便找到你。</p></div>
              <userInfo @saved="getUser" />
            </template>
            <template #resetpwd>
              <div class="mb-7"><h2 class="text-lg font-semibold text-highlighted">修改密码</h2><p class="mt-1 text-sm text-muted">定期更新密码，保护你的账号安全。</p></div>
              <resetPwd />
            </template>
          </UTabs>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup name="Profile">
import { useRoute } from "vue-router";
import userAvatar from "./userAvatar";
import userInfo from "./userInfo";
import resetPwd from "./resetPwd";
import { getUserProfile } from "@/api/system/user";

const route = useRoute();
const activeTab = ref(route.query.tab === "resetpwd" ? "resetpwd" : "userinfo");
const state = reactive({
  user: {},
  roleGroup: '',
  postGroup: ''
});

const tabItems = [
  { label: '基本资料', icon: 'i-lucide-user-round', value: 'userinfo', slot: 'userinfo' },
  { label: '账号安全', icon: 'i-lucide-shield-check', value: 'resetpwd', slot: 'resetpwd' },
]

const accountDetails = computed(() => [
  { label: '登录账号', icon: 'i-lucide-user-round', value: state.user.userName },
  { label: '手机号码', icon: 'i-lucide-phone', value: state.user.phonenumber },
  { label: '用户邮箱', icon: 'i-lucide-mail', value: state.user.email },
  { label: '所属角色', icon: 'i-lucide-shield', value: state.roleGroup },
  { label: '创建日期', icon: 'i-lucide-calendar-days', value: formatDate(state.user.createTime) },
])

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getUser() {
  getUserProfile().then(response => {
    state.user = response.data;
    state.roleGroup = response.data?.roleGroup || '';
    state.postGroup = response.data?.postGroup || '';
  });
};

getUser();
</script>
