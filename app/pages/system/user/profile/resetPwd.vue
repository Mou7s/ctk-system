<template>
  <UForm ref="pwdFormRef" :state="user" :rules="rules" class="space-y-5">
    <UFormField label="旧密码" name="oldPassword" required>
      <UInput v-model="user.oldPassword" placeholder="请输入旧密码" type="password" :maxlength="20" size="lg" class="w-full" />
    </UFormField>
    <UFormField description="使用 6–20 个字符，建议组合字母、数字与符号。" label="新密码" name="newPassword" required>
      <UInput v-model="user.newPassword" placeholder="请输入新密码" type="password" :maxlength="20" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="确认密码" name="confirmPassword" required>
      <UInput v-model="user.confirmPassword" placeholder="请确认新密码" type="password" :maxlength="20" size="lg" class="w-full" />
    </UFormField>
    <div class="flex flex-wrap gap-3 border-t border-default pt-5">
      <UButton size="lg" icon="i-lucide-lock-keyhole" color="primary" @click="submit">更新密码</UButton>
      <UButton size="lg" color="neutral" variant="ghost" @click="close">关闭页面</UButton>
    </div>
  </UForm>
</template>

<script setup>
import { updateUserPwd } from '@/api/system/user'
const toast = useToast();

const { proxy } = getCurrentInstance()

const user = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const rules = ref({
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }, { min: 6, max: 20, message: '长度在 6 到 20 个字符', trigger: 'blur' }],
  confirmPassword: [{ required: true, message: '请确认新密码', trigger: 'blur' }],
})

const pwdFormRef = ref(null)

function equalToPassword(rule, value, callback) {
  if (value !== user.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

async function submit() {
  if (user.newPassword !== user.confirmPassword) {
    toast.add({ title: '两次输入的密码不一致', color: 'error' })
    return
  }
  await pwdFormRef.value?.validate?.()
  updateUserPwd(user.oldPassword, user.newPassword).then(() => {
    toast.add({ title: '修改成功', color: 'success' })
  })
}

function close() {
  proxy.$tab.closePage()
}
</script>