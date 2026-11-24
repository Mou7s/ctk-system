<template>
  <div class="flex flex-wrap items-center gap-2">
    <template v-for="(item, index) in options" :key="item.value || index">
      <template v-if="values.includes(item.value)">
        <span
          v-if="(item.elTagType == 'default' || item.elTagType == '') && (item.elTagClass == '' || item.elTagClass == null)"
          :class="item.elTagClass"
        >{{ item.label }}</span>
        <UBadge
          v-else
          :label="item.label"
          :color="mapTagColor(item.elTagType)"
          :class="item.elTagClass"
          size="sm"
          variant="solid"
        />
      </template>
    </template>
    <template v-if="unmatch && showValue">
      {{ unmatchArray | handleArray }}
    </template>
  </div>
</template>

<script setup>
const unmatchArray = ref([]);

const props = defineProps({
  options: {
    type: Array,
    default: null,
  },
  value: [Number, String, Array],
  showValue: {
    type: Boolean,
    default: true,
  },
  separator: {
    type: String,
    default: ",",
  }
});

const EL_TAG_COLOR_MAP = {
  'success': 'success',
  'warning': 'warning',
  'danger': 'error',
  'info': 'info',
  'primary': 'primary',
}

function mapTagColor(type) {
  return EL_TAG_COLOR_MAP[type] || 'neutral'
}

const values = computed(() => {
  if (props.value === null || typeof props.value === 'undefined' || props.value === '') return [];
  return Array.isArray(props.value) ? props.value.map(item => '' + item) : String(props.value).split(props.separator);
});

const unmatch = computed(() => {
  unmatchArray.value = [];
  if (props.value === null || typeof props.value === 'undefined' || props.value === '' || props.options.length === 0) return false
  let unmatch = false
  values.value.forEach(item => {
    if (!props.options.some(v => v.value === item)) {
      unmatchArray.value.push(item)
      unmatch = true
    }
  })
  return unmatch
});

function handleArray(array) {
  if (array.length === 0) return "";
  return array.reduce((pre, cur) => {
    return pre + " " + cur;
  });
}
</script>
