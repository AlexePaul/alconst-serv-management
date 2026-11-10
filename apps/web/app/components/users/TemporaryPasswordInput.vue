<script setup lang="ts">
/** Câmp pentru parola temporară stabilită de administrator, cu generare automată. */
const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="flex gap-2">
    <UInput
      v-model="model"
      type="text"
      autocomplete="off"
      spellcheck="false"
      class="min-w-0 flex-1 font-mono"
    />
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-dices"
      label="Generează"
      @click="model = generateTemporaryPassword()"
    />
  </div>
</template>
