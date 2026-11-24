<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12 relative overflow-hidden">
    <!-- 装饰用柔光背景光晕 -->
    <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-400/20 dark:bg-primary-500/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]"></div>
    <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-400/20 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[10000ms] delay-1000"></div>

    <div class="max-w-2xl text-center z-10 space-y-8">
      <!-- 带有渐变与发光微动效的 404 巨幅数字 -->
      <div class="relative inline-block select-none">
        <h1 class="text-9xl md:text-[11rem] font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary-500 via-purple-500 to-emerald-500 dark:from-primary-400 dark:via-purple-400 dark:to-emerald-400 animate-gradient">
          404
        </h1>
        <div class="absolute inset-0 text-9xl md:text-[11rem] font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-primary-500 via-purple-500 to-emerald-500 dark:from-primary-400 dark:via-purple-400 dark:to-emerald-400 blur-xl opacity-40 select-none animate-gradient">
          404
        </div>
      </div>

      <!-- 描述文字 -->
      <div class="space-y-3">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          哎呀，找不到网页了！
        </h2>
        <p class="text-sm md:text-base text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
          对不起，您正在寻找的页面可能已经被移除、重命名，或者暂时不可用。请检查您的 URL 拼写是否正确。
        </p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <UButton
          to="/"
          size="xl"
          color="primary"
          icon="i-lucide-house"
          class="px-8 py-3 rounded-xl font-medium shadow-lg shadow-primary-500/20 dark:shadow-primary-500/10 hover:shadow-primary-500/30 transform hover:-translate-y-0.5 transition-all duration-200"
        >
          返回首页
        </UButton>
        <UButton
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          class="px-8 py-3 rounded-xl font-medium transform hover:-translate-y-0.5 transition-all duration-200"
          @click="refreshPage"
        >
          重新加载
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup>
function refreshPage() {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
</script>

<style scoped>
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.animate-gradient {
  background-size: 200% auto;
  animation: gradient-shift 6s ease infinite;
}
</style>
