<template>
  <UBreadcrumb :items="breadcrumbItems" class="app-breadcrumb" />
</template>

<script setup>
const route = useRoute();
const router = useRouter();
const levelList = ref([])

const breadcrumbItems = computed(() =>
  levelList.value.map((item, index) => ({
    label: item.meta.title,
    to: (item.redirect === 'noRedirect' || index === levelList.value.length - 1) ? undefined : item.path,
  }))
)

function getBreadcrumb() {
  let matched = route.matched.filter(item => item.meta && item.meta.title);
  const first = matched[0]
  if (!isDashboard(first)) {
    matched = [{ path: '/', meta: { title: '首页' } }].concat(matched)
  }
  levelList.value = matched.filter(item => item.meta && item.meta.title && item.meta.breadcrumb !== false)
}

function isDashboard(route) {
  const name = route && route.name
  if (!name) return false
  return name.trim() === 'Index'
}

watchEffect(() => {
  if (route.path.startsWith('/redirect/')) return
  getBreadcrumb()
})
getBreadcrumb();
</script>

<style scoped>
.app-breadcrumb {
  display: inline-block;
  font-size: 14px;
  line-height: 50px;
  margin-left: 8px;
}
</style>
