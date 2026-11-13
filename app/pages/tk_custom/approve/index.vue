<!--
  Converted: el-form → div (no validation used), el-form-item → removed wrapper
-->
<template>
<div style="display: flex;align-items: center;justify-content: center;height: 100vh;flex-direction:column">
    <div class="form-container">
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <div class="form-field">
                    <label class="form-label">入厂日期</label>
                    <span>123</span>
                </div>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="访客姓名" name="vName">
                    <UInput v-model="form.vName" clearable placeholder="请输入访客姓名" maxlength="100" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="房间" name="room">
                    <USelect v-model="form.room" placeholder="请选择" :items="tk_visit_room" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="来访公司" name="company">
                    <UInput v-model="form.company" clearable placeholder="请输入来访公司" maxlength="100" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="电话号码" name="vTelephone">
                    <UInput v-model.trim="form.vTelephone" clearable placeholder="请输入电话号码" maxlength="20" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="身份证号" name="vCardid">
                    <UInput v-model.trim="form.vCardid" clearable placeholder="请输入身份证号码" maxlength="18" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="车牌号" name="carNumber">
                    <UInput v-model.trim="form.carNumber" clearable placeholder="请输入车牌号" onblur="this.value=this.value.toUpperCase()" maxlength="10" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="来访人数" name="peoplecount">
                    <UInput type="number" v-model="form.peoplecount" clearable placeholder="请输入来访人数" maxlength="100" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="需要鞋套" name="needshoes">
                    <USelect v-model="form.needshoes" placeholder="请选择" :items="is_or_not" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="来访事由" name="vReason">
                    <UInput v-model="form.vReason" clearable placeholder="请输入来访事由" maxlength="200" />
                </UFormField>
            </div>
        </div>
        <div class="grid">
            <div class="col-span-12 col-span-12">
                <UFormField label="被访人" name="receiver">
                    <UInput v-model.trim="form.receiver" clearable placeholder="请输入被访人" maxlength="20" />
                </UFormField>
            </div>
        </div>
    </div>
</div>

</template>

<script setup name="approve">
    import {parseTime} from '@/utils/helpers'

    const form = ref({
      vName: '',
      room: '',
      company: '',
      vTelephone: '',
      vCardid: '',
      carNumber: '',
      peoplecount: 1,
      needshoes: '',
      vReason: '',
      receiver: ''
    })
    const tk_visit_room = ref([])
    const is_or_not = ref([])
</script>

<style>
.form-container {
  width: 100%;
  max-width: 500px;
  padding: 10px;
}
.form-field {
  margin-bottom: 12px;
}
.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--ui-text-dimmed);
}
</style>
