<template>
  <div class="login">
    <div class="login-overlay" aria-hidden="true" />

    <div class="login-shell">
      <header class="login-header">
        <div class="brand-mark" aria-hidden="true">
          <span class="brand-mark__text">{{ brand.brandMark }}</span>
        </div>
        <div class="brand-text">
          <h1 class="brand-title">{{ brand.brandTitle }}</h1>
          <p class="brand-subtitle">{{ brand.brandSubtitle }}</p>
        </div>
      </header>

      <div class="login-card">
        <form class="login-form" @submit.prevent="handleLogin">
          <div class="login-field">
            <label class="login-label">账号</label>
            <UInput
              v-model="loginForm.username"
              icon="i-lucide-user-round"
              placeholder="请输入账号"
              autocomplete="username"
              :disabled="loading"
              :color="submitted && loginErrors.username ? 'error' : 'neutral'"
              size="lg"
              @keyup.enter="handleLogin"
            />
            <p v-if="submitted && loginErrors.username" class="login-error">
              {{ loginErrors.username }}
            </p>
          </div>

          <div class="login-field">
            <label class="login-label">密码</label>
            <UInput
              v-model="loginForm.password"
              icon="i-lucide-lock-keyhole"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              :disabled="loading"
              :color="submitted && loginErrors.password ? 'error' : 'neutral'"
              size="lg"
              @keyup.enter="handleLogin"
            />
            <p v-if="submitted && loginErrors.password" class="login-error">
              {{ loginErrors.password }}
            </p>
          </div>

          <div v-if="captchaState === 'enabled'" class="login-field">
            <label class="login-label">验证码</label>
            <div class="captcha-row">
              <UInput
                v-model="loginForm.code"
                icon="i-lucide-shield-check"
                placeholder="请输入验证码"
                autocomplete="off"
                :disabled="loading"
                :color="submitted && loginErrors.code ? 'error' : 'neutral'"
                size="lg"
                class="flex-1"
                @keyup.enter="handleLogin"
              />
              <UButton
                type="button"
                variant="outline"
                color="neutral"
                class="login-code-btn"
                :disabled="loading"
                title="点击刷新验证码"
                @click="refreshCode"
              >
                <img
                  v-if="codeUrl"
                  :src="codeUrl"
                  class="login-code-img"
                  alt="验证码"
                />
                <span v-else class="text-xs">刷新</span>
              </UButton>
            </div>
            <p v-if="submitted && loginErrors.code" class="login-error">
              {{ loginErrors.code }}
            </p>
          </div>

          <div v-if="captchaState === 'loading'" role="status" class="text-sm text-muted">
            正在连接登录服务…
          </div>
          <div v-else-if="captchaState === 'error'" role="alert" class="login-field">
            <p class="login-error">登录服务连接失败，请检查网络后重试</p>
            <UButton type="button" variant="outline" color="neutral" @click="getCode">
              重新连接
            </UButton>
          </div>

          <div class="login-options">
            <UCheckbox
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
            class="login-submit"
          >
            登 录
          </UButton>

          <div v-if="register" class="register-link">
            <span>还没有账号？</span>
            <span class="link-type" @click="register = false">立即注册</span>
          </div>
        </form>
      </div>

      <p class="login-footer">
        <span>{{ brand.brandFooter }}</span>
        <span class="login-footer__sep">|</span>
        <span>内部管理系统</span>
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

import { getCodeImg } from "@/api/login";
import Cookies from "js-cookie";
import { encrypt, decrypt } from "@/utils/jsencrypt";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();
const route = useRoute();
// 品牌文案由 runtimeConfig 提供；登录页带 ?demo=1 时切换为中性演示品牌（不出现公司名与 logo）。
const publicConfig = useRuntimeConfig().public;
const isDemoEntry = computed(() => ["1", "true", "yes"].includes(String(route.query.demo || "").toLowerCase()));
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
const captchaState = ref('loading');
const register = ref(false);
const redirect = ref(undefined);
const submitted = ref(false);

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
  if (loginForm.value.rememberMe) {
    Cookies.set("username", loginForm.value.username, { expires: 30 });
    Cookies.set("password", encrypt(loginForm.value.password), { expires: 30 });
    Cookies.set("rememberMe", 1, { expires: 30 });
  } else {
    Cookies.remove("username");
    Cookies.remove("password");
    Cookies.remove("rememberMe");
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
      loginForm.value.password = "";
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

// Captcha and remembered credentials are browser concerns. Do not make the
// SSR request render wait on a self-request to the Nitro captcha endpoint.
onMounted(() => {
  getCode();
  getCookie();
});
</script>

<style scoped>
.login {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  height: 100%;
  padding: 32px 16px;
  overflow: hidden;
  background-color: #0f172a;
  background-image: url("@/assets/images/newFactory.webp");
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

.login-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.82) 0%,
    rgba(15, 23, 42, 0.55) 60%,
    rgba(15, 23, 42, 0.4) 100%
  );
  pointer-events: none;
}

:where(html.dark) .login-overlay {
  background: linear-gradient(
    135deg,
    rgba(2, 6, 18, 0.92) 0%,
    rgba(2, 6, 18, 0.78) 60%,
    rgba(2, 6, 18, 0.65) 100%
  );
}

.login-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: min(420px, calc(100vw - 32px));
}

.login-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  padding: 0 4px;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 58px;
  height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 4px 14px -2px rgba(37, 99, 235, 0.5);
}

:where(html.dark) .brand-mark {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 4px 14px -2px rgba(59, 130, 246, 0.5);
}

.brand-mark__text {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #ffffff;
}

.brand-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.brand-subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.login-card {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 28px 28px 20px;
  box-shadow: 0 8px 40px -10px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

:where(html.dark) .login-card {
  background: rgba(17, 24, 39, 0.88);
  border-color: rgba(255, 255, 255, 0.05);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-field {
  display: flex;
  flex-direction: column;
}

.login-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 6px;
  letter-spacing: 0.01em;
}

:where(html.dark) .login-label {
  color: #e5e7eb;
}

.login-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #dc2626;
}

:where(html.dark) .login-error {
  color: #f87171;
}

.captcha-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.login-code-btn {
  flex: 0 0 auto;
  width: 100px !important;
  padding: 0 !important;
  overflow: hidden;
  border-radius: 8px;
}

.login-code-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
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
  letter-spacing: 0.08em;
}

.register-link {
  margin-top: 4px;
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

:where(html.dark) .register-link {
  color: #9ca3af;
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

.login-footer {
  margin-top: 24px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  text-align: center;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

:where(html.dark) .login-footer {
  color: rgba(229, 231, 235, 0.78);
}

.login-footer__sep {
  margin: 0 6px;
  opacity: 0.6;
}

@media (max-width: 480px) {
  .login {
    padding: 24px 16px;
  }

  .login-header {
    margin-bottom: 18px;
    gap: 12px;
  }

  .brand-mark {
    min-width: 52px;
    height: 40px;
    padding: 0 12px;
    border-radius: 9px;
  }

  .brand-mark__text {
    font-size: 14px;
  }

  .brand-title {
    font-size: 18px;
  }

  .brand-subtitle {
    font-size: 12px;
  }

  .login-card {
    padding: 22px 20px 20px;
  }

  .captcha-row {
    display: flex;
    gap: 8px;
  }

  .login-code-btn {
    width: 88px !important;
  }
}
</style>
