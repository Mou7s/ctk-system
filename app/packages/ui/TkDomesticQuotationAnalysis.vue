<template>
  <TkQuotationAnalysis ref="analysisView" business-type="DOMESTIC" :can-export="canExport" />
</template>

<script setup>
import { computed, ref } from 'vue'
import TkQuotationAnalysis from './TkQuotationAnalysis.vue'
defineProps({ canExport: { type: Boolean, default: false } })
const analysisView = ref(null)

const analysisLoading = computed(() => analysisView.value?.analysisLoading || false)
function loadAnalysis() { return analysisView.value?.loadAnalysis() }
defineExpose({ loadAnalysis, analysisLoading })
</script>
