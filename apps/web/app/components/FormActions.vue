<script setup lang="ts">
/**
 * Butoanele din subsolul unui formular afișat într-o fereastră. Rămân lipite de marginea de jos
 * cât timp formularul se derulează, ca pe telefon să nu fie nevoie de derulare până la capăt.
 */
defineProps<{
  submitLabel: string
  loading?: boolean
}>()

defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="sticky -bottom-4 z-10 -mx-4 -mb-4 flex justify-end gap-2 border-t border-default bg-default px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
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
