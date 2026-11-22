<script setup lang="ts">
/** Bandă vizibilă cât timp telefonul nu are internet: altfel salvările ar eșua fără explicație. */
const online = ref(true)

function update() {
  online.value = navigator.onLine
}

onMounted(() => {
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>

<template>
  <div
    v-if="!online"
    role="status"
    class="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-center text-sm font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-50"
  >
    <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0" />
    Nu ești conectat la internet. Ce modifici acum nu se poate salva până revine conexiunea.
  </div>
</template>
