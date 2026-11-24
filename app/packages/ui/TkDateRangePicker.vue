<template>
  <div class="inline-flex min-w-0">
    <UPopover v-model:open="open" :content="{ align }">
      <UButton
        color="neutral"
        variant="outline"
        :size="size"
        :disabled="disabled"
        icon="i-lucide-calendar"
        trailing-icon="i-lucide-chevron-down"
        class="w-full min-w-0 justify-between font-normal"
        :title="displayText || placeholder"
      >
        <span class="min-w-0 truncate tabular-nums" :class="hasValue ? '' : 'text-dimmed'">
          {{ displayText || placeholder }}
        </span>
      </UButton>
      <template #content>
        <div>
          <div class="flex flex-wrap gap-1 border-b border-default p-2 sm:hidden">
            <UButton
              v-for="preset in presets"
              :key="preset.label"
              :label="preset.label"
              size="xs"
              :color="isPresetSelected(modelValue, preset, valueFormat) ? 'primary' : 'neutral'"
              :variant="isPresetSelected(modelValue, preset, valueFormat) ? 'soft' : 'ghost'"
              @click="applyPreset(preset)"
            />
            <UButton
              v-if="clearable && hasValue"
              :label="clearLabel"
              size="xs"
              color="error"
              variant="ghost"
              @click="clear"
            />
          </div>
          <div class="flex items-stretch divide-x divide-default">
            <div class="hidden sm:flex flex-col justify-center py-2">
              <UButton
                v-for="preset in presets"
                :key="preset.label"
                :label="preset.label"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4"
                :class="isPresetSelected(modelValue, preset, valueFormat) ? 'bg-elevated font-medium text-highlighted' : 'hover:bg-elevated/50'"
                truncate
                @click="applyPreset(preset)"
              />
              <UButton
                v-if="clearable && hasValue"
                :label="clearLabel"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4 text-error hover:bg-elevated/50"
                truncate
                @click="clear"
              />
            </div>
            <UCalendar
              :model-value="calendarValue"
              range
              :number-of-months="calendarMonths"
              :min-value="minCalendarValue"
              :max-value="maxCalendarValue"
              locale="zh-CN"
              class="p-2"
              @update:model-value="onCalendarPick"
            />
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import {
  DATE_RANGE_PRESETS,
  calendarToArray,
  dateStringToCalendar,
  isPresetSelected,
  presetToArray,
  rangeArrayToCalendar,
  rangeDisplayText,
  useCalendarMonths,
} from '../shared/dateRange'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  valueFormat: {
    type: String,
    default: 'date',
    validator: (v) => ['date', 'datetime'].includes(v),
  },
  placeholder: {
    type: String,
    default: '选择日期范围',
  },
  size: {
    type: String,
    default: undefined,
  },
  align: {
    type: String,
    default: 'start',
  },
  clearable: {
    type: Boolean,
    default: true,
  },
  clearLabel: {
    type: String,
    default: '清除',
  },
  presets: {
    type: Array,
    default: () => DATE_RANGE_PRESETS,
  },
  minValue: {
    type: String,
    default: '',
  },
  maxValue: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'change'])

const open = ref(false)
const calendarMonths = useCalendarMonths()
const calendarValue = shallowRef(rangeArrayToCalendar(props.modelValue))

const hasValue = computed(() => Array.isArray(props.modelValue) && Boolean(props.modelValue[0] && props.modelValue[1]))
const displayText = computed(() => rangeDisplayText(props.modelValue))
const minCalendarValue = computed(() => (props.minValue ? dateStringToCalendar(props.minValue) || undefined : undefined))
const maxCalendarValue = computed(() => (props.maxValue ? dateStringToCalendar(props.maxValue) || undefined : undefined))

watch(
  () => props.modelValue,
  (val) => {
    calendarValue.value = rangeArrayToCalendar(val)
  },
  { deep: true },
)

watch(open, (isOpen) => {
  if (isOpen) {
    calendarValue.value = rangeArrayToCalendar(props.modelValue)
  }
})

function onCalendarPick(range) {
  calendarValue.value = range ?? null
  if (!range?.start || !range?.end) return
  const next = calendarToArray(range, props.valueFormat)
  emit('update:modelValue', next)
  emit('change', next)
  open.value = false
}

function applyPreset(preset) {
  const next = presetToArray(preset, props.valueFormat)
  calendarValue.value = rangeArrayToCalendar(next)
  emit('update:modelValue', next)
  emit('change', next)
  open.value = false
}

function clear() {
  calendarValue.value = null
  emit('update:modelValue', [])
  emit('change', [])
  open.value = false
}
</script>
