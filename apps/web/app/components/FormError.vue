<script setup lang="ts">
defineProps<{ message: string | null }>()
</script>

<template>
  <UAlert
    v-if="message"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="message"
  />
</template>
