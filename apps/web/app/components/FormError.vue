<script setup lang="ts">
defineProps<{ message: string | null }>()
</script>

<template>
  <UAlert
    v-if="message"
    data-form-error
    role="alert"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="message"
  />
</template>
