<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useTkListQuery } from '@ctk-system/composables';
import { customerCardFields } from '@/packages/shared/customerCard';
import { listCustomerCards, getCustomerCard, getCustomerCardPhoto, checkCustomerCard, createCustomerCard, removeCustomerCard, reviewCustomerCard, addCustomerFollowup, recognizeCustomerCard } from '@/api/tk_custom/customerCard';
import useUserStore from '@/store/modules/user';
import { dateStringToCalendar, calendarToDateString } from '@/packages/shared/dateRange';
import { QUOTATION_COUNTRY_MENU_OPTIONS } from '@/packages/shared/quotationOptions';
import { createClientRequestUuid } from '@/utils/requestId';

const user = useUserStore();
const queryParams = ref({ pageNum: 1, pageSize: 10, keyword: '', status: 'all' });
const { list, total, loading, error, getList, handleQuery } = useTkListQuery({ queryParams, fetchList: () => listCustomerCards(queryParams.value) });
const form = reactive(Object.fromEntries(customerCardFields.map(([key]) => [key, ''])));
const countryOptions = computed(() => form.country && !QUOTATION_COUNTRY_MENU_OPTIONS.some(item => item.value === form.country)
  ? [{ label: form.country, value: form.country }, ...QUOTATION_COUNTRY_MENU_OPTIONS]
  : QUOTATION_COUNTRY_MENU_OPTIONS);
const selectedCountry = computed({ get: () => form.country || undefined, set: value => { form.country = value || ''; } });
const editorOpen = ref(false), detailOpen = ref(false), busy = ref(false), message = ref(''), matches = ref([]), rawText = ref(''), detail = ref(null), reviewNote = ref('');
const saveToken = ref(''), followupToken = ref('');
const deleteOpen = ref(false);
const canRemove = computed(() => detail.value && (Number(detail.value.owner_id) === Number(user.id) || Number(user.id) === 1) && (user.permissions?.includes('*:*:*') || user.permissions?.includes('tk_custom:customerCard:remove')));
async function removeCard() { await perform(async () => { await checked(await removeCustomerCard(detail.value.id)); deleteOpen.value = false; detailOpen.value = false; detail.value = null; await getList(); message.value = '客户已删除。'; }); }
const cardPhoto = ref(null), photoPreview = ref(''), detailPhoto = ref('');
function replacePhotoUrl(target, file) { if (target.value) URL.revokeObjectURL(target.value); target.value = file ? URL.createObjectURL(file) : ''; }
watch(editorOpen, open => { if (!open) { cardPhoto.value = null; replacePhotoUrl(photoPreview, null); } });
watch(detailOpen, open => { if (!open) replacePhotoUrl(detailPhoto, null); });
onBeforeUnmount(() => { replacePhotoUrl(photoPreview, null); replacePhotoUrl(detailPhoto, null); });
const cameraInput = ref(null), uploadInput = ref(null), recognizing = ref(false), recognitionStatus = ref('');
const followup = reactive({ weekStart: '', content: '', nextPlan: '' });
const weekCalendar = computed({ get: () => dateStringToCalendar(followup.weekStart), set: value => { followup.weekStart = calendarToDateString(value) || ''; } });
function loadWeek() { const record = detail.value?.followups?.find(item => String(item.week_start).slice(0, 10) === followup.weekStart); followup.content = record?.content || ''; followup.nextPlan = record?.next_plan || ''; followupToken.value = createClientRequestUuid(); }
watch(() => followup.weekStart, loadWeek);
watch(detailOpen, open => { if (open) loadWeek(); });
const states = { active: '正式客户', pending: '待部门负责人审核', rejected: '已驳回' };
const statusOptions = [{ label: '全部状态', value: 'all' }, ...Object.entries(states).map(([value, label]) => ({ value, label }))];
const canCreate = computed(() => user.permissions?.includes('*:*:*') || user.permissions?.includes('tk_custom:customerCard:add'));
const canFollowup = computed(() => detail.value?.status === 'active' && Number(detail.value?.owner_id) === Number(user.id) && (user.permissions?.includes('*:*:*') || user.permissions?.includes('tk_custom:customerCard:weekly')));
function checked(response) { if (response?.code !== 200) throw new Error(response?.msg || '操作失败'); return response.data; }
async function perform(task) { if (busy.value) return; busy.value = true; message.value = ''; try { await task(); } catch (e) { message.value = e.message || '操作失败'; } finally { busy.value = false; } }
function newCard() {
  Object.assign(form, Object.fromEntries(customerCardFields.map(([key]) => [key, ''])));
  matches.value = []; rawText.value = ''; message.value = ''; saveToken.value = createClientRequestUuid(); editorOpen.value = true;
  recognitionStatus.value = '';
}
async function recognize(event) {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  await perform(async () => {
    if (file.size > 10 * 1024 * 1024) throw new Error('照片不能超过10MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
    cardPhoto.value = file; replacePhotoUrl(photoPreview, file);
    recognizing.value = true; recognitionStatus.value = '';
    try {
      const data = new FormData(); data.append('photo', file);
      const result = checked(await recognizeCustomerCard(data)); rawText.value = result.text;
      let filled = 0;
      for (const [key] of customerCardFields) if (result.fields[key] && !form[key]) { form[key] = result.fields[key]; filled += 1; }
      recognitionStatus.value = filled ? `识别完成，已填写 ${filled} 个字段，请核对下方信息。` : '识别完成，请查看识别原文并补充下方信息。';
    } finally { recognizing.value = false; }
  });
}
async function check() { await perform(async () => { matches.value = checked(await checkCustomerCard({ ...form })); message.value = matches.value.length ? '发现冲突，保存后将交由部门负责人审核。' : '当前未发现冲突，保存时会再次检查。'; }); }
async function save() { await perform(async () => {
  const data = new FormData(); data.append('record', JSON.stringify({ ...form, requestId: saveToken.value }));
  if (cardPhoto.value) data.append('photo', cardPhoto.value);
  const result = checked(await createCustomerCard(data));
  editorOpen.value = false; await getList(); message.value = result.status === 'pending' ? '已提交部门负责人审核，审核通过后成为正式客户。' : '客户已录入。';
}); }
async function openDetail(id) { await perform(async () => { detail.value = checked(await getCustomerCard(id)); reviewNote.value = ''; followup.content = ''; followup.nextPlan = ''; const now = new Date(); now.setDate(now.getDate() - (now.getDay() + 6) % 7); followup.weekStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; followupToken.value = createClientRequestUuid(); detailOpen.value = true; }); }
async function review(decision) { await perform(async () => { checked(await reviewCustomerCard({ id: detail.value.id, decision, note: reviewNote.value })); detail.value = checked(await getCustomerCard(detail.value.id)); await getList(); }); }
async function saveFollowup() { await perform(async () => { checked(await addCustomerFollowup({ id: detail.value.id, ...followup, requestId: followupToken.value })); detail.value = checked(await getCustomerCard(detail.value.id)); loadWeek(); }); }
onMounted(getList);
watch(detail, async record => {
  replacePhotoUrl(detailPhoto, null);
  if (!record?.has_photo) return;
  try {
    const blob = await getCustomerCardPhoto(record.id);
    if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('名片图片加载失败');
    if (detail.value === record && detailOpen.value) replacePhotoUrl(detailPhoto, blob);
  } catch (e) { if (detail.value === record) message.value = e.message || '名片图片加载失败'; }
});
</script>

<template>
  <div class="absolute inset-0 overflow-y-auto p-4 sm:p-6 space-y-5">
    <div class="flex items-center justify-between gap-3">
      <div><h1 class="text-xl font-semibold">客户名片</h1><p class="text-sm text-muted mt-1">拍照录入 · 冲突审核 · 每周跟进</p></div>
      <UButton v-if="canCreate" icon="i-lucide-plus" @click="newCard">录入名片</UButton>
    </div>
    <UAlert v-if="message && !editorOpen && !detailOpen" :description="message" color="info" />
    <UAlert v-if="error" :description="String(error)" color="error" />
    <div class="flex flex-wrap gap-2">
      <UInput v-model="queryParams.keyword" placeholder="搜索公司名称" icon="i-lucide-search" @keyup.enter="handleQuery" />
      <USelect v-model="queryParams.status" :items="statusOptions" class="w-52" />
      <UButton :loading="loading" @click="handleQuery">查询</UButton>
    </div>
    <p class="text-sm text-muted">共 {{ total }} 条 · 显示本人客户及分配给本人的审核记录</p>
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <UCard v-for="row in list" :key="row.id">
        <div class="flex justify-between gap-2"><h2 class="font-semibold break-words">{{ row.payload.company }}</h2><UBadge :color="row.status === 'active' ? 'success' : row.status === 'pending' ? 'warning' : 'error'" variant="soft">{{ states[row.status] }}</UBadge></div>
        <p class="mt-3 text-sm">{{ row.payload.contact || '未填写联系人' }} <span class="text-muted">{{ row.payload.position }}</span></p>
        <p class="text-sm text-muted mt-1">业务员：{{ row.salesperson }}</p>
        <UButton class="mt-4" variant="soft" @click="openDetail(row.id)">客户详情 / 周动态</UButton>
      </UCard>
    </div>
    <p v-if="!loading && !list.length && !error" class="text-muted py-8 text-center">暂无客户记录</p>
    <UPagination v-model:page="queryParams.pageNum" :total="total" :items-per-page="queryParams.pageSize" @update:page="getList" />

    <UModal v-model:open="editorOpen" title="录入客户名片" :dismissible="!busy" :ui="{ content: 'sm:max-w-3xl max-h-[90dvh]', body: 'overflow-y-auto' }">
      <template #body>
        <div class="space-y-4">
          <section class="rounded-lg border border-default bg-elevated/50 p-4 space-y-3" aria-label="名片识别">
            <div><h3 class="font-medium">拍一张名片，快速填写客户信息</h3><p class="text-sm text-muted mt-1">自动填写识别到的空白字段，已有内容会保留。</p></div>
            <input ref="cameraInput" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" :disabled="busy" class="hidden" tabindex="-1" aria-hidden="true" @change="recognize">
            <input ref="uploadInput" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" class="hidden" tabindex="-1" aria-hidden="true" @change="recognize">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <UButton type="button" icon="i-lucide-camera" size="lg" block :disabled="busy" :loading="recognizing" @click="cameraInput?.click()">{{ recognizing ? '正在识别名片…' : '拍照识别' }}</UButton>
              <UButton type="button" icon="i-lucide-image-up" size="lg" variant="outline" block :disabled="busy" @click="uploadInput?.click()">从相册 / 电脑上传</UButton>
            </div>
            <p class="text-xs text-muted">手机可调用相机，电脑请选择上传。支持 JPG、PNG、WebP，最大 10MB。</p>
            <p v-if="recognitionStatus" role="status" class="text-sm text-success">{{ recognitionStatus }}</p>
            <p class="text-xs text-muted">请核对识别结果，并补充名片未提供的信息。</p>
            <div v-if="photoPreview" class="space-y-2">
              <img :src="photoPreview" alt="待保存的名片照片" class="max-h-56 rounded-lg object-contain">
              <p class="text-xs text-muted">这张照片将与客户信息一起保存。</p>
            </div>
          </section>
          <UFormField label="业务员"><UInput :model-value="user.nickName || user.name" disabled class="w-full" /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField v-for="[key, label] in customerCardFields" :key="key" :label="label" :required="key === 'company'">
              <USelectMenu v-if="key === 'country'" v-model="selectedCountry" :items="countryOptions" value-key="value" placeholder="请选择国家 / 地区" :search-input="{ placeholder: '搜索中文或英文名称…' }" class="w-full" clear />
              <UTextarea v-else-if="key === 'remark' || key === 'address'" v-model="form[key]" class="w-full" :maxlength="key === 'remark' ? 2000 : 300" />
              <UInput v-else v-model="form[key]" class="w-full" :maxlength="300" />
            </UFormField>
          </div>
          <details v-if="rawText"><summary class="text-sm cursor-pointer">查看识别原文</summary><pre class="text-sm whitespace-pre-wrap mt-2">{{ rawText }}</pre></details>
          <UAlert v-if="message" :description="message" color="info" />
          <UAlert v-for="match in matches" :key="match.id" color="warning" :description="`客户 #${match.id}（业务员：${match.salesperson}）存在冲突：${match.matches.join('、')}`" />
        </div>
      </template>
      <template #footer><div class="flex flex-wrap gap-2"><UButton variant="outline" :disabled="busy || !form.company" @click="check">检查冲突</UButton><UButton :loading="busy" :disabled="!form.company" @click="save">保存并自动检查冲突</UButton></div></template>
    </UModal>

    <UModal v-model:open="detailOpen" title="客户详情与周动态" :dismissible="!busy" :ui="{ content: 'sm:max-w-3xl max-h-[90dvh]', body: 'overflow-y-auto' }">
      <template #body>
        <div v-if="detail" class="space-y-5">
          <UAlert v-if="message" :description="message" color="error" />
          <div class="flex justify-between gap-3"><h2 class="text-lg font-semibold">{{ detail.payload.company }}</h2><UBadge variant="soft">{{ states[detail.status] }}</UBadge></div>
          <dl class="grid gap-3 sm:grid-cols-2"><div v-for="[key, label] in customerCardFields" :key="key"><dt class="text-xs text-muted">{{ label }}</dt><dd class="text-sm whitespace-pre-wrap break-words">{{ detail.payload[key] || '—' }}</dd></div></dl>
          <div class="flex items-center justify-between gap-3"><p class="text-sm">业务员：{{ detail.salesperson }}</p><UButton v-if="canRemove" color="error" variant="outline" icon="i-lucide-trash-2" :disabled="busy" @click="deleteOpen = true">删除客户</UButton></div>
          <a v-if="detailPhoto" :href="detailPhoto" target="_blank" rel="noopener" class="block space-y-2"><img :src="detailPhoto" alt="客户名片原图" class="max-h-72 rounded-lg object-contain"><span class="text-sm text-primary">查看名片原图</span></a>
          <UAlert v-for="match in detail.conflicts" :key="match.id" color="warning" :description="`客户 #${match.id}（${match.salesperson}）：${match.matches.join('、')}相同`" />
          <p v-if="detail.review_note" class="text-sm">审核意见：{{ detail.review_note }}</p>
          <div v-if="detail.canReview" class="space-y-3">
            <UFormField label="审核意见" required><UTextarea v-model="reviewNote" class="w-full" :maxlength="2000" /></UFormField>
            <div class="flex gap-2"><UButton :disabled="busy || !reviewNote.trim()" @click="review('approve')">允许录入</UButton><UButton color="error" :disabled="busy || !reviewNote.trim()" @click="review('reject')">驳回</UButton></div>
          </div>
          <div class="border-t border-default pt-4 space-y-3">
            <h3 class="font-semibold">每周跟进动态</h3>
            <div v-if="canFollowup" class="space-y-3">
              <UFormField label="跟进周（选择该周周一）"><UPopover><UButton variant="outline" icon="i-lucide-calendar">{{ followup.weekStart || '选择日期' }}</UButton><template #content><UCalendar v-model="weekCalendar" /></template></UPopover></UFormField>
              <UFormField label="本周跟进情况" required><UTextarea v-model="followup.content" class="w-full" :maxlength="2000" placeholder="沟通内容、客户反馈、进展等" /></UFormField>
              <UFormField label="下一步计划"><UTextarea v-model="followup.nextPlan" class="w-full" :maxlength="2000" /></UFormField>
              <p class="text-xs text-muted">每周保存一条动态，再次保存会更新该周内容。</p>
              <UButton :loading="busy" :disabled="!followup.content.trim()" @click="saveFollowup">保存本周动态</UButton>
            </div>
            <p v-if="!detail.followups.length" class="text-sm text-muted">暂无跟进动态</p>
            <div v-for="item in detail.followups" :key="item.id" class="border-l-2 border-default pl-4 space-y-1">
              <p class="text-sm font-medium">{{ String(item.week_start).slice(0, 10) }} 当周 · {{ item.author_name }}</p>
              <p class="text-sm whitespace-pre-wrap">{{ item.content }}</p>
              <p v-if="item.next_plan" class="text-sm text-muted whitespace-pre-wrap">下一步：{{ item.next_plan }}</p>
            </div>
          </div>
        </div>
      </template>
    </UModal>
    <UModal v-model:open="deleteOpen" title="确认删除客户" :dismissible="!busy">
      <template #body><p>确认删除“{{ detail?.payload.company }}”？删除后，该客户、名片图片和周动态将不再显示，也不再参与冲突检查。</p></template>
      <template #footer><div class="flex gap-2"><UButton variant="outline" :disabled="busy" @click="deleteOpen = false">取消</UButton><UButton color="error" :loading="busy" @click="removeCard">确认删除</UButton></div><UAlert v-if="message" :description="message" color="error" /></template>
    </UModal>
  </div>
</template>
