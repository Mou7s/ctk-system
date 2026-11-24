<template>
  <UForm ref="userInfoFormRef" :state="form" :rules="rules" class="space-y-7">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
      <UFormField label="用户姓名" name="nickName" required>
        <UInput v-model="form.nickName" :maxlength="30" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="手机号码" name="phonenumber" required>
        <UInput v-model="form.phonenumber" :maxlength="11" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="邮箱" name="email" required>
        <UInput v-model="form.email" :maxlength="50" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="性别" name="sex">
        <URadioGroup orientation="horizontal" v-model="form.sex" :items="[
          { label: '男', value: '0' },
          { label: '女', value: '1' },
        ]" />
      </UFormField>
    </div>
    <div class="flex flex-wrap gap-3 border-t border-default pt-5">
      <UButton size="lg" icon="i-lucide-check" color="primary" @click="submit">保存资料</UButton>
      <UButton size="lg" color="neutral" variant="ghost" @click="close">关闭页面</UButton>
    </div>
  </UForm>
</template>

<script setup>
import { getUserProfile, updateUserProfile } from '@/api/system/user'
const toast = useToast();
const emit = defineEmits(['saved'])

const { proxy } = getCurrentInstance()

const form = reactive({
  nickName: '',
  phonenumber: '',
  email: '',
  sex: '0',
})

const rules = ref({
  nickName: [{ required: true, message: '请输入用户姓名', trigger: 'blur' }],
  phonenumber: [
    { required: true, message: '请输入手机号码', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
  ],
})

const userInfoFormRef = ref(null)

onMounted(() => {
  getUserProfile().then((res) => {
    Object.assign(form, res.data || {})
  })
})

async function submit() {
  await userInfoFormRef.value?.validate?.()
  updateUserProfile(form).then(() => {
    toast.add({ title: '修改成功', color: 'success' })
    emit('saved')
  })
}

function close() {
  proxy.$tab.closePage()
}
</script>