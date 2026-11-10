<script setup lang="ts">
const model = defineModel<string>({ default: '' })

defineProps<{
  autocomplete?: 'current-password' | 'new-password' | 'off'
  placeholder?: string
  disabled?: boolean
}>()

const visible = ref(false)
</script>

<template>
  <UInput
    v-model="model"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :disabled="disabled"
    :ui="{ trailing: 'pe-1' }"
    class="w-full"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Ascunde parola' : 'Arată parola'"
        :aria-pressed="visible"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
