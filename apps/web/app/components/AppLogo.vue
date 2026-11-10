<script setup lang="ts">
defineProps<{
  /** Afișează doar simbolul, fără numele firmei (sidebar restrâns). */
  compact?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2.5 min-w-0">
    <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-inverted">
      <UIcon name="i-lucide-shield-check" class="size-5" />
    </div>
    <div v-if="!compact" class="min-w-0 leading-tight">
      <p class="truncate text-sm font-semibold text-highlighted">
        Alconst Serv
      </p>
      <p class="truncate text-xs text-muted">
        Management SSM · PSI
      </p>
    </div>
  </div>
</template>
