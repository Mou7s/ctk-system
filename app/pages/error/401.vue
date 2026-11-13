<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12 relative overflow-hidden"
  >
    <!-- 装饰用警告柔光背景光晕 -->
    <div
      class="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-400/20 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]"
    ></div>
    <div
      class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-400/20 dark:bg-red-500/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[10000ms] delay-1000"
    ></div>

    <div
      class="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center z-10"
    >
      <!-- 左侧文本描述 -->
      <div class="space-y-6 text-center md:text-left order-2 md:order-1">
        <div class="relative inline-block select-none">
          <h1
            class="text-7xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 dark:from-red-400 dark:via-amber-400 dark:to-orange-400 animate-gradient"
          >
            401
          </h1>
          <div
            class="absolute inset-0 text-7xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 dark:from-red-400 dark:via-amber-400 dark:to-orange-400 blur-lg opacity-30 select-none animate-gradient"
          >
            401
          </div>
        </div>

        <div class="space-y-3">
          <h2
            class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight"
          >
            您没有访问权限！
          </h2>
          <p
            class="text-sm md:text-base text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto md:mx-0"
          >
            抱歉，您当前所持有的角色账户暂无权限查看此页面内容，请不要进行越权或非法操作。您可以尝试返回上一页或返回系统主页。
          </p>
        </div>

        <!-- 按钮控制区 -->
        <div
          class="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-4 pt-4"
        >
          <UButton
            to="/"
            size="xl"
            color="primary"
            icon="i-lucide-house"
            class="px-8 py-3 rounded-xl font-medium shadow-lg shadow-primary-500/20 dark:shadow-primary-500/10 hover:shadow-primary-500/30 transform hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto justify-center"
          >
            回首页
          </UButton>
          <UButton
            size="xl"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
            class="px-8 py-3 rounded-xl font-medium transform hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto justify-center"
            @click="back"
          >
            返回上一页
          </UButton>
        </div>
      </div>

      <!-- 右侧图示动图（掉落的冰淇淋） -->
      <div class="flex justify-center order-1 md:order-2">
        <div
          class="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700/60 shadow-xl max-w-xs transform hover:rotate-2 hover:scale-105 transition-all duration-300"
        >
          <img
            :src="errGif"
            class="rounded-2xl w-full h-auto"
            alt="Girl has dropped her ice cream."
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import errImage from "@/assets/401_images/401.gif";

const { proxy } = getCurrentInstance();
const errGif = ref(errImage + "?" + +new Date());

function back() {
  if (proxy.$route.query.noGoBack) {
    proxy.$router.push({ path: "/" });
  } else {
    proxy.$router.go(-1);
  }
}
</script>

<style scoped>
@keyframes gradient-shift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
.animate-gradient {
  background-size: 200% auto;
  animation: gradient-shift 6s ease infinite;
}
</style>
