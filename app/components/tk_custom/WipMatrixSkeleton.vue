<template>
  <div class="matrix-skeleton" :class="{ 'is-idle': !loading }" aria-busy="true">
    <!-- 顶条交给 UProgress：loading 时 indeterminate 来回滑，idle 时收成空槽 -->
    <UProgress :model-value="loading ? null : 0" size="sm" />
    <div class="matrix-skeleton__stage">
      <div class="matrix-skeleton__row">
        <span class="matrix-skeleton__label is-head" />
        <span v-for="column in 8" :key="`h${column}`" class="matrix-skeleton__cell is-head" />
      </div>
      <div v-for="row in 6" :key="`r${row}`" class="matrix-skeleton__row">
        <span class="matrix-skeleton__label" />
        <span
          v-for="column in 8"
          :key="`c${row}-${column}`"
          class="matrix-skeleton__cell"
          :style="{ animationDelay: `${Math.min(row + column, 12) * 70}ms` }"
        />
      </div>
    </div>
    <p class="matrix-skeleton__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: true
  },
  /** 首屏要等 SQL Server 统计全厂在制（实测约 5 秒），把等待说清楚 */
  hint: {
    type: String,
    default: '正在统计全厂在制…（首次约 5 秒）'
  }
})
</script>

<style scoped>
.matrix-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface) 74%, transparent);
  backdrop-filter: blur(18px) saturate(170%);
  -webkit-backdrop-filter: blur(18px) saturate(170%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent),
    0 8px 24px -12px var(--app-shadow);
}

.matrix-skeleton__stage {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.matrix-skeleton__row {
  display: flex;
  gap: 4px;
}

.matrix-skeleton__label,
.matrix-skeleton__cell {
  display: block;
  height: 46px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-text) 9%, transparent);
  animation: skeletonPulse 1600ms ease-in-out infinite;
}

.matrix-skeleton__label {
  width: 148px;
  flex-shrink: 0;
}

.matrix-skeleton__cell {
  flex: 1;
}

.matrix-skeleton__label.is-head,
.matrix-skeleton__cell.is-head {
  height: 34px;
  background: color-mix(in srgb, var(--app-text) 15%, transparent);
  animation-delay: 0ms;
}

.matrix-skeleton__hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.matrix-skeleton.is-idle .matrix-skeleton__label,
.matrix-skeleton.is-idle .matrix-skeleton__cell {
  animation: none;
  opacity: 0.6;
}

@keyframes skeletonPulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .matrix-skeleton__label,
  .matrix-skeleton__cell {
    animation: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .matrix-skeleton {
    background: var(--app-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
