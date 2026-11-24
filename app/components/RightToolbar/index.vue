<template>
  <div class="top-right-btn" :style="style">
    <div class="flex flex-wrap">
      <UTooltip
        class="item"
        effect="dark"
        text="显隐列"
        placement="top"
        v-if="columns"
      >
        <UButton
          circle
          icon="i-lucide-menu"
          @click="showColumn()"
          v-if="showColumnsType == 'transfer'"
        />
        <UDropdownMenu
          trigger="click"
          :items="columnItems"
          v-if="showColumnsType == 'checkbox'"
        >
          <UButton circle icon="i-lucide-menu" />
        </UDropdownMenu>
      </UTooltip>
    </div>
    <UModal v-model:open="open" :title="title">
      <template #body>
        <div v-if="showColumnsType == 'transfer'" class="space-y-2">
          <label v-for="(col, ci) in (columns || [])" :key="col.key || ci" class="flex items-center gap-2 cursor-pointer">
            <UCheckbox v-model="col.visible" :label="col.label" />
          </label>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  /* 是否显示检索条件 */
  showSearch: {
    type: Boolean,
    default: true,
  },
  /* 显隐列信息 */
  columns: {
    type: Array,
  },
  /* 是否显示检索图标 */
  search: {
    type: Boolean,
    default: true,
  },
  /* 显隐列类型（transfer穿梭框、checkbox复选框） */
  showColumnsType: {
    type: String,
    default: "checkbox",
  },
  /* 右外边距 */
  gutter: {
    type: Number,
    default: 10,
  },
});

const emits = defineEmits(["update:showSearch", "queryTable"]);

// 显隐数据
const value = ref([]);
// 弹出层标题
const title = ref("显示/隐藏");
// 是否显示弹出层
const open = ref(false);

const style = computed(() => {
  const ret = {};
  if (props.gutter) {
    ret.marginRight = `${props.gutter / 2}px`;
  }
  return ret;
});

// 搜索
function toggleSearch() {
  emits("update:showSearch", !props.showSearch);
}

// 刷新
function refresh() {
  emits("queryTable");
}

const columnItems = computed(() =>
  (props.columns || []).map((item) => ({
    label: item.label,
    type: "checkbox",
    checked: item.visible !== false,
    onSelect: () => checkboxChange(!(item.visible !== false), item.label),
  })),
);

// 右侧列表元素变化
function dataChange(data) {
  for (let item in props.columns) {
    const key = props.columns[item].key;
    props.columns[item].visible = !data.includes(key);
  }
}

// 打开显隐列dialog
function showColumn() {
  open.value = true;
}

if (props.showColumnsType == "transfer") {
  // 显隐列初始默认隐藏列
  for (let item in props.columns) {
    if (props.columns[item].visible === false) {
      value.value.push(parseInt(item));
    }
  }
}

// 勾选
function checkboxChange(event, label) {
  props.columns.filter((item) => item.label == label)[0].visible = event;
}
</script>

<style scoped></style>
