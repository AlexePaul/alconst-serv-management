<script setup lang="ts">
/** Butoanele din subsolul unui formular afișat într-o fereastră. */
defineProps<{
  submitLabel: string
  loading?: boolean
}>()

defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="flex justify-end gap-2 pt-2">
    <UButton
      color="neutral"
      variant="outline"
      label="Renunță"
      :disabled="loading"
      @click="$emit('cancel')"
    />
    <UButton type="submit" :loading="loading" :label="submitLabel" />
  </div>
</template>
