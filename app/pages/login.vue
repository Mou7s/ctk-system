<template>
  <div class="login-layout">
    <div class="login-mobile-overlay" aria-hidden="true" />

    <!-- 桌面端左栏：园区建筑视觉与品牌展示区 -->
    <section class="login-hero" aria-label="品牌展示">
      <div class="login-hero__bg" aria-hidden="true" />
      <div class="login-hero__scrim" aria-hidden="true" />

      <div class="login-hero__top">
        <div v-if="brandLogo" class="hero-brand-logo">
          <img :src="brandLogo" :alt="brand.brandTitle" class="hero-brand-logo__img" />
        </div>
        <div v-else class="hero-brand-mark" aria-hidden="true">
          <span>{{ brand.brandMark }}</span>
        </div>
        <span class="hero-env-pill">
          <span class="hero-env-pill__dot" aria-hidden="true" />
          {{ isDemoEntry ? '演示环境' : '内部管理系统' }}
        </span>
      </div>

      <div class="login-hero__bottom">
        <div class="hero-accent-bar" aria-hidden="true" />
        <h1 class="hero-title">{{ brand.brandTitle }}</h1>
        <p class="hero-subtitle">{{ brand.brandSubtitle }}</p>
      </div>
    </section>

    <!-- 右栏（移动端居中悬浮卡片）：高对比纯净登录区 -->
    <main class="login-panel">
      <!-- 桌面端顶栏：主题切换 -->
      <div class="login-panel__topbar">
        <ClientOnly>
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            size="sm"
            square
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            aria-label="切换浅色/深色主题"
            @click="toggleColorMode"
          />
          <template #fallback>
            <span class="login-theme-placeholder" aria-hidden="true" />
          </template>
        </ClientOnly>
      </div>

      <!-- 平板/移动端内置品牌头 -->
      <header class="login-mobile-header">
        <div class="login-mobile-header__brand">
          <div v-if="brandLogo" class="mobile-brand-logo">
            <img :src="brandLogo" :alt="brand.brandTitle" class="mobile-brand-logo__img" />
          </div>
          <div v-else class="mobile-brand-mark" aria-hidden="true">
            <span>{{ brand.brandMark }}</span>
          </div>
          <div class="mobile-brand-text">
            <h1 class="mobile-brand-title">{{ brand.brandTitle }}</h1>
            <p class="mobile-brand-subtitle">{{ brand.brandSubtitle }}</p>
          </div>
        </div>
        <ClientOnly>
          <UButton
            type="button"
            variant="ghost"
            color="neutral"
            size="sm"
            square
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            aria-label="切换浅色/深色主题"
            @click="toggleColorMode"
          />
          <template #fallback>
            <span class="login-theme-placeholder" aria-hidden="true" />
          </template>
        </ClientOnly>
      </header>

      <!-- 中部表单区 -->
      <div class="login-panel__body">
        <div class="login-form-header">
          <h2 class="login-form-title">欢迎登录</h2>
          <p class="login-form-desc">
            {{ isDemoEntry ? '演示环境已就绪，请核对信息后进入体验' : '请使用您的系统账号登录工作台' }}
          </p>
        </div>

        <div
          v-if="isDemoEntry && demoAutofillStatus === 'ready'"
          role="status"
          class="demo-autofill-tip"
        >
          <UIcon name="i-lucide-sparkles" class="size-4 shrink-0" />
          <span>已自动填入演示账号，直接点击登录即可体验</span>
        </div>
        <div
          v-else-if="isDemoEntry && demoAutofillStatus === 'unavailable'"
          role="status"
          class="demo-autofill-tip demo-autofill-tip--muted"
        >
          <UIcon name="i-lucide-info" class="size-4 shrink-0" />
          <span>未启用演示账号自动填充，请手动输入演示账号密码</span>
        </div>

        <form class="login-form" novalidate @submit.prevent="handleLogin">
          <div class="login-field">
            <label for="login-username" class="login-label">账号</label>
            <UInput
              id="login-username"
              v-model="loginForm.username"
              icon="i-lucide-user-round"
              placeholder="请输入账号"
              autocomplete="username"
              :disabled="loading"
              :color="submitted && loginErrors.username ? 'error' : 'neutral'"
              size="lg"
              class="w-full"
              :ui="{ base: 'h-11' }"
              @keyup.enter="handleLogin"
            />
            <p v-if="submitted && loginErrors.username" class="login-error">
              <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" />
              <span>{{ loginErrors.username }}</span>
            </p>
          </div>

          <div class="login-field">
            <label for="login-password" class="login-label">密码</label>
            <UInput
              id="login-password"
              v-model="loginForm.password"
              icon="i-lucide-lock-keyhole"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
              :disabled="loading"
              :color="submitted && loginErrors.password ? 'error' : 'neutral'"
              size="lg"
              class="w-full"
              :ui="{ base: 'h-11', trailing: 'pe-1.5' }"
              @keyup.enter="handleLogin"
            >
              <template #trailing>
                <UButton
                  type="button"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showPassword"
                  :disabled="loading"
                  @click="togglePasswordVisibility"
                />
              </template>
            </UInput>
            <p v-if="submitted && loginErrors.password" class="login-error">
              <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" />
              <span>{{ loginErrors.password }}</span>
            </p>
          </div>

          <div v-if="captchaState === 'enabled'" class="login-field">
            <label for="login-captcha" class="login-label">验证码</label>
            <div class="captcha-row">
              <UInput
                id="login-captcha"
                v-model="loginForm.code"
                icon="i-lucide-shield-check"
                placeholder="请输入验证码"
                autocomplete="off"
                :disabled="loading"
                :color="submitted && loginErrors.code ? 'error' : 'neutral'"
                size="lg"
                class="flex-1"
                :ui="{ base: 'h-11' }"
                @keyup.enter="handleLogin"
              />
              <UButton
                type="button"
                variant="outline"
                color="neutral"
                class="login-code-btn"
                :disabled="loading"
                title="点击刷新验证码"
                aria-label="点击刷新验证码"
                @click="refreshCode"
              >
                <img
                  v-if="codeUrl"
                  :src="codeUrl"
                  class="login-code-img"
                  alt="验证码"
                />
                <span v-else class="text-xs text-zinc-600">刷新</span>
              </UButton>
            </div>
            <p v-if="submitted && loginErrors.code" class="login-error">
              <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" />
              <span>{{ loginErrors.code }}</span>
            </p>
          </div>

          <div v-if="captchaState === 'loading'" role="status" class="captcha-status">
            <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin" />
            <span>正在连接登录服务…</span>
          </div>
          <div v-else-if="captchaState === 'error'" role="alert" class="captcha-error-card">
            <div class="captcha-error-card__text">
              <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0" />
              <span>登录服务连接失败，请检查网络后重试</span>
            </div>
            <UButton
              type="button"
              variant="outline"
              color="neutral"
              size="sm"
              class="self-start"
              @click="getCode"
            >
              重新连接
            </UButton>
          </div>

          <div v-if="!isDemoEntry || register" class="login-options">
            <UCheckbox
              v-if="!isDemoEntry"
              v-model="loginForm.rememberMe"
              label="记住我"
              :disabled="loading"
            />
            <span v-if="register" class="login-help">帮助</span>
          </div>

          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loading"
            :disabled="captchaState === 'loading' || captchaState === 'error'"
            class="login-submit h-11 font-semibold"
          >
            {{ isDemoEntry && demoAutofillStatus === 'ready' ? '进入演示环境' : '登 录' }}
          </UButton>

          <div v-if="register" class="register-link">
            <span>还没有账号？</span>
            <span class="link-type" @click="register = false">立即注册</span>
          </div>
        </form>
      </div>

      <!-- 底部版权 -->
      <footer class="login-panel__footer">
        <span>{{ brand.brandFooter }}</span>
        <span class="login-footer__sep" aria-hidden="true">·</span>
        <span>{{ isDemoEntry ? '演示环境' : '内部管理系统' }}</span>
      </footer>
    </main>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

import { getCodeImg, getDemoAutofill } from "@/api/login";
import defaultLogo from "@/assets/logo/logo.webp";
import Cookies from "js-cookie";
import { encrypt, decrypt } from "@/utils/jsencrypt";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();
const route = useRoute();
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

function toggleColorMode() {
  colorMode.preference = isDark.value ? "light" : "dark";
}

// 品牌文案由 runtimeConfig 提供；登录页带 ?demo=1 时切换为中性演示品牌（不出现公司名与 logo）。
const publicConfig = useRuntimeConfig().public;
const isDemoEntry = computed(() => ["1", "true", "yes"].includes(String(route.query.demo || "").toLowerCase()));
const brandLogo = computed(() => (isDemoEntry.value ? "" : defaultLogo));
const brand = computed(() =>
  isDemoEntry.value
    ? {
        brandMark: "DEMO",
        brandTitle: publicConfig.demoTitle,
        brandSubtitle: "演示环境 · 页面数据均为虚构样例",
        brandFooter: "Demo environment · all data is fictional",
      }
    : publicConfig
);
useHead({
  title: computed(() =>
    isDemoEntry.value ? `${publicConfig.demoTitle}（演示数据）` : publicConfig.appTitle
  ),
});

const loginForm = ref({
  username: "",
  password: "",
  rememberMe: false,
  code: "",
  uuid: "",
});

const loginErrors = reactive({
  username: "",
  password: "",
  code: "",
});

const codeUrl = ref("");
const loading = ref(false);
const showPassword = ref(false);
const captchaState = ref('loading');
const register = ref(false);
const redirect = ref(undefined);
const submitted = ref(false);
const demoAutofillStatus = ref('idle');

function togglePasswordVisibility() {
  if (!loading.value) {
    showPassword.value = !showPassword.value;
  }
}

watch(
  route,
  (newRoute) => {
    redirect.value = newRoute.query && newRoute.query.redirect;
  },
  { immediate: true },
);

watch(
  () => loginForm.value.username,
  () => { loginErrors.username = ""; },
);

watch(
  () => loginForm.value.password,
  () => { loginErrors.password = ""; },
);

watch(
  () => loginForm.value.code,
  () => { loginErrors.code = ""; },
);

function validateLoginForm() {
  loginErrors.username = loginForm.value.username ? "" : "请输入您的账号";
  loginErrors.password = loginForm.value.password ? "" : "请输入您的密码";
  loginErrors.code =
    captchaState.value === 'enabled' && !loginForm.value.code ? "请输入验证码" : "";
  return !loginErrors.username && !loginErrors.password && !loginErrors.code;
}

function handleLogin() {
  if (loading.value || !['enabled', 'disabled'].includes(captchaState.value)) return;
  submitted.value = true;
  if (!validateLoginForm()) return;

  loading.value = true;
  if (!isDemoEntry.value) {
    if (loginForm.value.rememberMe) {
      Cookies.set("username", loginForm.value.username, { expires: 30 });
      Cookies.set("password", encrypt(loginForm.value.password), { expires: 30 });
      Cookies.set("rememberMe", 1, { expires: 30 });
    } else {
      Cookies.remove("username");
      Cookies.remove("password");
      Cookies.remove("rememberMe");
    }
  }

  userStore
    .login(loginForm.value)
    .then(() => {
      const query = route.query;
      const otherQueryParams = Object.keys(query).reduce((acc, cur) => {
        if (cur !== "redirect") { acc[cur] = query[cur]; }
        return acc;
      }, {});
      navigateTo({ path: redirect.value || "/", query: otherQueryParams });
    })
    .catch(() => {
      loading.value = false;
      showPassword.value = false;
      if (!isDemoEntry.value) {
        loginForm.value.password = "";
      }
      loginForm.value.code = "";
      if (captchaState.value === 'enabled') { getCode(); }
    });
}

function refreshCode() {
  if (!loading.value) { getCode(); }
}

let captchaRequestPending = false;
async function getCode() {
  if (captchaRequestPending) return;
  captchaRequestPending = true;
  captchaState.value = 'loading';
  codeUrl.value = '';
  loginForm.value.code = '';
  loginForm.value.uuid = '';
  loginErrors.code = '';
  try {
    const res = await getCodeImg();
    if (res?.code !== 200) throw new Error('Invalid captcha response');
    if (res.captchaEnabled === false) {
      captchaState.value = 'disabled';
    } else {
      if (!res.img || !res.uuid) throw new Error('Incomplete captcha response');
      codeUrl.value = "data:image/svg+xml;base64," + res.img;
      loginForm.value.uuid = res.uuid;
      captchaState.value = 'enabled';
    }
  } catch {
    captchaState.value = 'error';
  } finally {
    captchaRequestPending = false;
  }
}

function getCookie() {
  const username = Cookies.get("username");
  const password = Cookies.get("password");
  const rememberMe = Cookies.get("rememberMe");
  loginForm.value = {
    username: username === undefined ? loginForm.value.username : username,
    password:
      password === undefined ? loginForm.value.password : decrypt(password),
    rememberMe: rememberMe == 1 ? true : false,
    code: loginForm.value.code,
    uuid: loginForm.value.uuid,
  };
}

let demoAutofillRequestId = 0;
async function loadDemoAutofill() {
  const requestId = ++demoAutofillRequestId;
  loginForm.value.rememberMe = false;
  try {
    const res = await getDemoAutofill();
    if (requestId !== demoAutofillRequestId || !isDemoEntry.value) return;
    if (res?.code === 200 && res.enabled && res.username && res.password) {
      if (!loginForm.value.username && !loginForm.value.password) {
        loginForm.value.username = res.username;
        loginForm.value.password = res.password;
      }
      demoAutofillStatus.value = "ready";
    } else {
      demoAutofillStatus.value = "unavailable";
    }
  } catch {
    if (requestId === demoAutofillRequestId) {
      demoAutofillStatus.value = "unavailable";
    }
  }
}

watch(isDemoEntry, (demo) => {
  showPassword.value = false;
  if (demo) {
    loginForm.value.username = "";
    loginForm.value.password = "";
    loadDemoAutofill();
  } else {
    demoAutofillRequestId += 1;
    demoAutofillStatus.value = "idle";
    loginForm.value.username = "";
    loginForm.value.password = "";
    getCookie();
  }
});

// Captcha and remembered credentials are browser concerns. Do not make the
// SSR request render wait on a self-request to the Nitro captcha endpoint.
onMounted(() => {
  getCode();
  if (isDemoEntry.value) {
    loadDemoAutofill();
  } else {
    getCookie();
  }
});
</script>

<style scoped>
/* ==========================================================================
   桌面端双栏布局（>= 1024px）
   ========================================================================== */
.login-layout {
  position: relative;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(440px, 36vw, 520px);
  background-color: #ffffff;
}

:where(html.dark) .login-layout {
  background-color: #0f1114;
}

.login-mobile-overlay {
  display: none;
}

/* 左栏：园区建筑视觉与品牌展示区 */
.login-hero {
  position: relative;
  overflow: hidden;
  background-color: #0f172a;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100dvh;
}

.login-hero__bg {
  position: absolute;
  inset: 0;
  background-image: url("@/assets/images/newFactory.webp");
  background-size: cover;
  background-position: 62% 45%;
  transition: filter 0.3s ease;
}

:where(html.dark) .login-hero__bg {
  filter: brightness(0.72) contrast(1.04);
}

.login-hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.22) 0%,
    rgba(15, 23, 42, 0.04) 40%,
    rgba(15, 23, 42, 0.72) 100%
  );
  pointer-events: none;
}

:where(html.dark) .login-hero__scrim {
  background: linear-gradient(
    180deg,
    rgba(9, 9, 11, 0.42) 0%,
    rgba(9, 9, 11, 0.18) 42%,
    rgba(9, 9, 11, 0.88) 100%
  );
}

.login-hero__top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 40px;
}

.hero-brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.hero-brand-logo__img {
  height: 24px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1) drop-shadow(0 1px 4px rgba(15, 23, 42, 0.35));
}

.hero-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.24);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.hero-env-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.hero-env-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
}

.login-hero__bottom {
  position: relative;
  z-index: 1;
  padding: 40px 44px;
}

.hero-accent-bar {
  width: 32px;
  height: 3px;
  border-radius: 999px;
  background-color: #3b82f6;
  margin-bottom: 14px;
}

.hero-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
  color: #ffffff;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.32);
}

.hero-subtitle {
  margin: 8px 0 0;
  max-width: 420px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
}

/* 右栏：高对比纯净登录区 */
.login-panel {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px 48px;
  background-color: #ffffff;
  border-left: 1px solid #e4e4e7;
}

:where(html.dark) .login-panel {
  background-color: #0f1114;
  border-left-color: #27272a;
}

.login-panel__topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 32px;
}

.login-theme-placeholder {
  display: inline-block;
  width: 32px;
  height: 32px;
}

.login-mobile-header {
  display: none;
}

.login-panel__body {
  width: 100%;
  max-width: 360px;
  margin: auto;
  padding: 24px 0;
  animation: loginPanelEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes loginPanelEnter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 表单引导头 */
.login-form-header {
  margin-bottom: 24px;
}

.login-form-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: #18181b;
}

:where(html.dark) .login-form-title {
  color: #f4f4f5;
}

.login-form-desc {
  margin: 6px 0 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: #71717a;
}

:where(html.dark) .login-form-desc {
  color: #a1a1aa;
}

/* 演示模式提示条 */
.demo-autofill-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.22);
  color: #1d4ed8;
  font-size: 12.5px;
  line-height: 1.45;
}

.demo-autofill-tip--muted {
  background: #f4f4f5;
  border-color: #e4e4e7;
  color: #52525b;
}

:where(html.dark) .demo-autofill-tip {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(96, 165, 250, 0.3);
  color: #93c5fd;
}

:where(html.dark) .demo-autofill-tip--muted {
  background: rgba(39, 39, 42, 0.72);
  border-color: #3f3f46;
  color: #d4d4d8;
}

/* 表单与字段 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.login-field {
  display: flex;
  flex-direction: column;
}

.login-label {
  font-size: 13px;
  font-weight: 500;
  color: #3f3f46;
  margin-bottom: 6px;
  letter-spacing: 0.01em;
}

:where(html.dark) .login-label {
  color: #d4d4d8;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #dc2626;
}

:where(html.dark) .login-error {
  color: #f87171;
}

/* 验证码行与按钮 */
.captcha-row {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.login-code-btn {
  flex: 0 0 auto;
  width: 116px !important;
  height: 44px;
  padding: 0 !important;
  overflow: hidden;
  border-radius: 8px;
  background-color: #f4f4f5 !important;
  border-color: #d4d4d8 !important;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.login-code-btn:hover:not(:disabled) {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
}

:where(html.dark) .login-code-btn {
  background-color: #f4f4f5 !important;
  border-color: #52525b !important;
}

:where(html.dark) .login-code-btn:hover:not(:disabled) {
  border-color: #60a5fa !important;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18);
}

.login-code-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 验证码 loading / error 状态条 */
.captcha-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background-color: #f4f4f5;
  color: #52525b;
  font-size: 13px;
  line-height: 1.4;
}

:where(html.dark) .captcha-status {
  background-color: rgba(39, 39, 42, 0.7);
  color: #d4d4d8;
}

.captcha-error-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

:where(html.dark) .captcha-error-card {
  background-color: rgba(127, 29, 29, 0.24);
  border-color: rgba(248, 113, 113, 0.32);
}

.captcha-error-card__text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: #b91c1c;
}

:where(html.dark) .captcha-error-card__text {
  color: #fca5a5;
}

/* 选项与提交按钮 */
.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -4px;
}

.login-help {
  font-size: 13px;
  font-weight: 500;
  color: #2563eb;
  cursor: pointer;
  transition: color 0.18s ease;
}

:where(html.dark) .login-help {
  color: #60a5fa;
}

.login-help:hover {
  text-decoration: underline;
}

.login-submit {
  margin-top: 4px;
  border-radius: 10px;
  letter-spacing: 0.06em;
}

.register-link {
  text-align: center;
  font-size: 13px;
  color: #71717a;
}

:where(html.dark) .register-link {
  color: #a1a1aa;
}

.register-link .link-type {
  color: #2563eb;
  font-weight: 500;
  cursor: pointer;
}

:where(html.dark) .register-link .link-type {
  color: #60a5fa;
}

.register-link .link-type:hover {
  text-decoration: underline;
}

/* 底部版权 */
.login-panel__footer {
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: #71717a;
  letter-spacing: 0.01em;
}

:where(html.dark) .login-panel__footer {
  color: #a1a1aa;
}

.login-footer__sep {
  margin: 0 6px;
  opacity: 0.6;
}

/* ==========================================================================
   平板与移动端（< 1024px）：全屏背景 + 品牌一体化悬浮卡片
   ========================================================================== */
@media (max-width: 1023px) {
  .login-layout {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background-color: #0f172a;
    background-image: url("@/assets/images/newFactory.webp");
    background-size: cover;
    background-position: 65% center;
  }

  .login-mobile-overlay {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.56);
    pointer-events: none;
  }

  :where(html.dark) .login-mobile-overlay {
    background: rgba(9, 9, 11, 0.78);
  }

  .login-hero {
    display: none;
  }

  .login-panel {
    position: relative;
    z-index: 1;
    width: min(420px, calc(100vw - 32px));
    min-height: auto;
    border-radius: 16px;
    padding: 28px 28px 22px;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.35);
  }

  :where(html.dark) .login-panel {
    background: rgba(15, 17, 20, 0.94);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .login-panel__topbar {
    display: none;
  }

  .login-mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 18px;
    margin-bottom: 20px;
    border-bottom: 1px solid #e4e4e7;
  }

  :where(html.dark) .login-mobile-header {
    border-bottom-color: #27272a;
  }

  .login-mobile-header__brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .mobile-brand-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .mobile-brand-logo__img {
    height: 22px;
    width: auto;
    max-width: 112px;
    object-fit: contain;
    display: block;
  }

  :where(html.dark) .mobile-brand-logo__img {
    filter: brightness(0) invert(1);
  }

  .mobile-brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border-radius: 10px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    box-shadow: 0 4px 12px -2px rgba(37, 99, 235, 0.45);
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  :where(html.dark) .mobile-brand-mark {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
  }

  .mobile-brand-text {
    min-width: 0;
  }

  .mobile-brand-title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    color: #18181b;
  }

  :where(html.dark) .mobile-brand-title {
    color: #f4f4f5;
  }

  .mobile-brand-subtitle {
    margin: 2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: #71717a;
  }

  :where(html.dark) .mobile-brand-subtitle {
    color: #a1a1aa;
  }

  .login-panel__body {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .login-form-header {
    margin-bottom: 20px;
  }

  .login-form-title {
    font-size: 20px;
  }

  .login-panel__footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #f4f4f5;
  }

  :where(html.dark) .login-panel__footer {
    border-top-color: #27272a;
  }
}

/* ==========================================================================
   窄屏移动端（<= 480px）
   ========================================================================== */
@media (max-width: 480px) {
  .login-layout {
    padding: 16px;
  }

  .login-panel {
    padding: 22px 20px 20px;
  }

  .login-code-btn {
    width: 96px !important;
  }
}

/* ==========================================================================
   减少动态效果偏好
   ========================================================================== */
@media (prefers-reduced-motion: reduce) {
  .login-panel__body {
    animation: none;
  }
}
</style>
