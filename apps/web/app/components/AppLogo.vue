<script setup lang="ts">
withDefaults(defineProps<{
  /** Afișează doar simbolul, fără numele firmei (sidebar restrâns). */
  compact?: boolean
  size?: 'md' | 'lg'
}>(), {
  size: 'md'
})
</script>

<template>
  <div class="flex min-w-0 items-center" :class="size === 'lg' ? 'gap-3' : 'gap-2.5'">
    <img
      src="/logo-mark.png"
      alt=""
      width="96"
      height="96"
      class="shrink-0"
      :class="size === 'lg' ? 'size-12 rounded-xl' : 'size-8 rounded-lg'"
    >
    <div v-if="!compact" class="min-w-0 leading-tight">
      <p class="truncate font-semibold text-highlighted" :class="size === 'lg' ? 'text-lg' : 'text-sm'">
        Alconst Serv
      </p>
      <p class="truncate text-muted" :class="size === 'lg' ? 'text-sm' : 'text-xs'">
        Management SSM · PSI
      </p>
    </div>
  </div>
</template>
