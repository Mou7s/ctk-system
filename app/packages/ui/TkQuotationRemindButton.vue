<template>
  <UButton
    v-if="quotation?.canRemind"
    :size="size"
    color="warning"
    :variant="variant"
    icon="i-lucide-bell-ring"
    :loading="sending"
    :disabled="sending || sent"
    :title="sent ? '已催审批，一小时内请勿重复发送' : '提醒当前环节审批人，同一环节每小时最多一次'"
    @click.stop="send"
  >{{ sent ? '已催审批' : '催审批' }}</UButton>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { remindQuotation } from '@/api/tk_custom/quotation'
import { remindDomesticQuotation } from '@/api/tk_custom/domesticQuotation'

const props = defineProps({
  quotation: { type: Object, default: null },
  businessType: { type: String, default: 'FOREIGN' },
  size: { type: String, default: 'xs' },
  variant: { type: String, default: 'soft' },
})
const toast = useToast()
const sending = ref(false)
const sent = ref(false)
let cooldownTimer
watch(() => [props.quotation?.id, props.quotation?.status, props.businessType], () => { clearTimeout(cooldownTimer); sent.value = false })
onBeforeUnmount(() => clearTimeout(cooldownTimer))
async function send() {
  if (sending.value || sent.value || !props.quotation?.canRemind) return
  const identity = [props.quotation.id, props.quotation.status, props.businessType].join(':')
  sending.value = true
  try {
    const api = props.businessType === 'DOMESTIC' ? remindDomesticQuotation : remindQuotation
    const response = await api(props.quotation.id)
    if (response?.code !== 200) throw new Error(response?.msg || '催审批失败')
    if (identity === [props.quotation?.id, props.quotation?.status, props.businessType].join(':')) {
      sent.value = true
      cooldownTimer = setTimeout(() => { sent.value = false }, 60 * 60 * 1000)
    }
    toast.add({ title: '已提醒当前审批人', color: 'success' })
  } catch (error) {
    toast.add({ title: error?.message || '催审批失败，请稍后重试', color: 'error' })
  } finally { sending.value = false }
}
</script>
