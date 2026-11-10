<script setup lang="ts">
/** Dialog de confirmare pentru operațiuni importante sau ireversibile. */
const open = defineModel<boolean>('open', { default: false })

withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  color?: 'primary' | 'error' | 'warning'
  loading?: boolean
}>(), {
  confirmLabel: 'Confirmă',
  color: 'primary'
})

defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Renunță"
        :disabled="loading"
        @click="open = false"
      />
      <UButton
        :color="color"
        :label="confirmLabel"
        :loading="loading"
        @click="$emit('confirm')"
      />
    </template>
  </UModal>
</template>
