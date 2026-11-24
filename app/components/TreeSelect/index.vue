<template>
  <div class="el-tree-select">
    <USelect
      style="width: 100%"
      v-model="valueId"
      ref="treeSelect"
      :filterable="true"
      :clearable="true"
      @clear="clearHandle"
      :filter-method="selectFilterData"
      :placeholder="placeholder"
    >
      <USelectOption :value="valueId" :label="valueTitle">
        <UTree
          id="tree-option"
          ref="selectTree"
          :accordion="accordion"
          :items="options"
          :get-key="(item) => item[objMap.value]"
          label-key="label"
          
          :default-expanded="defaultExpandedKey"
          @select="handleNodeClick"
        ></UTree>
      </USelectOption>
    </USelect>
  </div>
</template>

<script setup>

const { proxy } = getCurrentInstance();

const props = defineProps({
  /* 配置项 */
  objMap: {
    type: Object,
    default: () => {
      return {
        value: 'id', // ID字段名
        label: 'label', // 显示名称
        children: 'children' // 子级字段名
      }
    }
  },
  /* 自动收起 */
  accordion: {
    type: Boolean,
    default: () => {
      return false
    }
  },
  /**当前双向数据绑定的值 */
  value: {
    type: [String, Number],
    default: ''
  },
  /**当前的数据 */
  options: {
    type: Array,
    default: () => []
  },
  /**输入框内部的文字 */
  placeholder: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:value']);

const valueId = computed({
  get: () => props.value,
  set: (val) => {
    emit('update:value', val)
  }
});
const valueTitle = ref('');
const defaultExpandedKey = ref([]);

function initHandle() {
  nextTick(() => {
    const selectedValue = valueId.value;
    if(selectedValue !== null && typeof (selectedValue) !== 'undefined') {
      const node = null /* TODO: UTree needs different approach */
      if (node) {
        valueTitle.value = node.data[props.objMap.label]
        /* TODO: UTree needs set current */ // 设置默认选中
        defaultExpandedKey.value = [selectedValue] // 设置默认展开
      }
    } else {
      clearHandle()
    }
  })
}
function handleNodeClick(node) {
  valueTitle.value = node[props.objMap.label]
  valueId.value = node[props.objMap.value];
  defaultExpandedKey.value = [];
  proxy.$refs.treeSelect.blur()
  selectFilterData('')
}
function selectFilterData(val) {
  /* filter via input */
}
function filterNode(value, data) {
  if (!value) return true
  return data[props.objMap['label']].indexOf(value) !== -1
}
function clearHandle() {
  valueTitle.value = ''
  valueId.value = ''
  defaultExpandedKey.value = [];
}
onMounted(() => {
  initHandle()
})

watch(valueId, () => {
  initHandle();
})
</script>

<style  scoped>:deep(.nuxt-tree-node__content:hover),
:deep(.nuxt-tree-node__content:active),
:deep(.is-current > div:first-child),
:deep(.nuxt-tree-node__content:focus) {
  background-color: color-mix(in srgb, #fff 90%, var(--ui-primary) 10%);
  color: var(--ui-primary);
}
</style>
