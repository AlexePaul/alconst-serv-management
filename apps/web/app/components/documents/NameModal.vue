<script setup lang="ts">
import { documentNameError, fileExtension } from '@alconst/shared'

/** Fereastră pentru numele unui dosar nou sau pentru redenumirea unui dosar ori a unui fișier. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title: string
  /** Numele curent, la redenumire. */
  initial?: string
  /** La redenumirea unui fișier: extensia lui, care nu poate fi schimbată. */
  extension?: string
  confirmLabel?: string
  /** Salvează numele; aruncă o eroare dacă serverul îl refuză. */
  save: (name: string) => Promise<void>
}>()

const name = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.initial ?? ''
  error.value = null
})

async function onSubmit() {
  const value = name.value.trim()
  const problem = documentNameError(value)
    ?? (props.extension && fileExtension(value) !== props.extension ? `Păstrează extensia „.${props.extension}”.` : null)
  if (problem) {
    error.value = problem
    return
  }
  loading.value = true
  error.value = null
  try {
    await props.save(value)
    open.value = false
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :dismissible="!loading">
    <template #body>
      <form class="space-y-5" @submit.prevent="onSubmit">
        <UFormField label="Nume" :error="error ?? undefined" required>
          <UInput
            v-model="name"
            autofocus
            class="w-full"
            maxlength="200"
          />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Renunță"
            :disabled="loading"
            @click="open = false"
          />
          <UButton type="submit" :loading="loading" :label="confirmLabel ?? 'Salvează'" />
        </div>
      </form>
    </template>
  </UModal>
</template>
