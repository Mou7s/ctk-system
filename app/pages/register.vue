<!--
  Converted: el-form → UForm with zod schema, removed ElMessageBox import
-->
<template>
  <div class="register">
    <UForm ref="registerRef" :state="registerForm" :schema="registerSchema" class="register-form" @submit="handleRegister">
      <h3 class="title">{{ brandTitle }}</h3>

      <UFormField name="username">
        <UInput
          v-model="registerForm.username"
          type="text"
          size="lg"
          auto-complete="off"
          placeholder="请输入姓名拼音，如zhangsan"
        />
      </UFormField>

      <UFormField name="password">
        <UInput
          v-model="registerForm.password"
          type="password"
          size="lg"
          auto-complete="off"
          placeholder="密码"
          @keyup.enter="handleRegister"
        />
      </UFormField>

      <UFormField name="confirmPassword">
        <UInput
          v-model="registerForm.confirmPassword"
          type="password"
          size="lg"
          auto-complete="off"
          placeholder="确认密码"
          @keyup.enter="handleRegister"
        />
      </UFormField>

      <UFormField name="code">
        <UInput
          size="lg"
          v-model="registerForm.code"
          auto-complete="off"
          placeholder="验证码"
          style="width: 63%"
          @keyup.enter="handleRegister"
        />
      </UFormField>
      <div class="register-code">
        <img :src="codeUrl" @click="getCode" class="register-code-img"/>
      </div>

      <UButton
        :loading="loading"
        size="lg"
        color="primary"
        style="width:100%;"
        type="submit"
      >
        <span v-if="!loading">注 册</span>
        <span v-else>注 册 中...</span>
      </UButton>
      <div style="float: right;">
        <router-link class="link-type" :to="'/login'">使用已有账户登录</router-link>
      </div>
    </UForm>
    <!--  底部  -->
    <div class="el-register-footer">
      <span>{{ brandFooter }}</span>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

import { getCodeImg, register } from "@/api/login";
import { z } from "zod";

const router = useRouter();
const publicConfig = useRuntimeConfig().public;
const brandTitle = computed(() => publicConfig.brandTitle || "内部管理系统");
const brandFooter = computed(() => publicConfig.brandFooter || "Copyright © 2026");

const registerForm = ref({
  username: "",
  password: "",
  confirmPassword: "",
  code: "",
  uuid: ""
});

const registerSchema = z.object({
  username: z.string().min(2, "用户账号长度必须介于 2 和 20 之间").max(20, "用户账号长度必须介于 2 和 20 之间"),
  password: z.string()
    .min(5, "用户密码长度必须介于 5 和 20 之间")
    .max(20, "用户密码长度必须介于 5 和 20 之间")
    .regex(new RegExp("^[^<>\"'|\\\\]+$"), "不能包含非法字符：< > 双引号 单引号 反斜杠 竖线"),
  confirmPassword: z.string().min(1, "请再次输入您的密码"),
  code: z.string().min(1, "请输入验证码"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
});

const codeUrl = ref("");
const loading = ref(false);
const captchaEnabled = ref(true);
const registerRef = ref(null);

async function handleRegister() {
  try {
    await registerRef.value?.validate();
  } catch {
    return;
  }
  loading.value = true;
  register(registerForm.value).then(res => {
    const username = registerForm.value.username;
    alert("您的账号 " + username + " 注册成功！请联系管理员审核！");
    router.push("/login");
  }).catch(() => {
    loading.value = false;
    if (captchaEnabled.value) {
      getCode();
    }
  });
}

function getCode() {
  getCodeImg().then(res => {
    captchaEnabled.value = res.captchaEnabled === undefined ? true : res.captchaEnabled;
    if (captchaEnabled.value) {
      codeUrl.value = "data:image/gif;base64," + res.img;
      registerForm.value.uuid = res.uuid;
    }
  });
}

getCode();
</script>

<style scoped>
.register {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  background-image: url("../assets/images/login-background.webp");
  background-size: cover;
}

html.dark {
  .register {
    &::before {
      position: absolute;
      inset: 0;
      content: "";
      background: rgba(0, 0, 0, 0.4);
    }
  }

  .register-form {
    position: relative;
    z-index: 1;
    background: rgba(27, 29, 33, 0.85) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55) !important;
  }

  .register-form .title {
    color: #ffffff !important;
  }
}
.title {
  margin: 0px auto 30px auto;
  text-align: center;
  color: #707070;
}

.register-form {
  border-radius: 6px;
  background: #ffffff;
  width: 400px;
  padding: 25px 25px 5px 25px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.register-form .input-icon {
  height: 39px;
  width: 14px;
  margin-left: 0px;
}
.register-tip {
  font-size: 13px;
  text-align: center;
  color: #bfbfbf;
}
.register-code {
  width: 33%;
  height: 40px;
  float: right;
}
.register-code img {
  cursor: pointer;
  vertical-align: middle;
}.el-register-footer {
  height: 40px;
  line-height: 40px;
  position: fixed;
  bottom: 0;
  width: 100%;
  text-align: center;
  color: #fff;
  font-family: Arial;
  font-size: 12px;
  letter-spacing: 1px;
}
.register-code-img {
  height: 40px;
  padding-left: 12px;
}
</style>
