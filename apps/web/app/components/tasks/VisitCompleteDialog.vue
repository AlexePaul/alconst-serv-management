<script setup lang="ts">
import type { TaskDto } from '@alconst/shared'

/**
 * La finalizarea unei deplasări se întreabă dacă fișele au fost completate.
 * Deplasarea poate fi finalizată și fără ele; rămâne atunci semnalată până la confirmare.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ task: TaskDto | null }>()
const emit = defineEmits<{ done: [] }>()

const api = useApi()
const toast = useToast()
const loading = ref<'with' | 'without' | null>(null)

async function finish(sheetsCompleted: boolean) {
  if (!props.task) return
  loading.value = sheetsCompleted ? 'with' : 'without'
  try {
    await api(`/tasks/${props.task.id}`, { method: 'PATCH', body: { status: 'DONE', sheetsCompleted } })
    toast.add({
      title: 'Deplasare finalizată',
      description: sheetsCompleted ? 'Fișele sunt marcate drept completate.' : 'Fișele rămân de confirmat.',
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
    emit('done')
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Finalizezi deplasarea?"
    :description="task ? [task.title, task.client?.name].filter(Boolean).join(' · ') : undefined"
    :dismissible="loading === null"
  >
    <template #body>
      <p class="text-sm text-default">
        Au fost completate fișele la această deplasare?
      </p>
      <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="outline"
          label="Nu încă – finalizează fără fișe"
          :loading="loading === 'without'"
          :disabled="loading === 'with'"
          @click="finish(false)"
        />
        <UButton
          icon="i-lucide-clipboard-check"
          label="Da, fișele sunt completate"
          :loading="loading === 'with'"
          :disabled="loading === 'without'"
          @click="finish(true)"
        />
      </div>
    </template>
  </UModal>
</template>
