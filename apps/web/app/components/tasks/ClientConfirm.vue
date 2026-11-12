<script setup lang="ts">
import type { TaskDto } from '@alconst/shared'
import { isOpenTask } from '@alconst/shared'

/**
 * Confirmarea cu clientul a unei deplasări: cel care a vorbit cu clientul notează, dintr-o
 * apăsare, că ziua a fost stabilită. Aplicația nu trimite nimic clientului.
 */
const props = defineProps<{ task: TaskDto }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()
const loading = ref(false)

const applies = computed(() => props.task.kind === 'VISIT' && props.task.client !== null && isOpenTask(props.task.status))

async function confirm() {
  loading.value = true
  try {
    await api(`/tasks/${props.task.id}`, { method: 'PATCH', body: { clientConfirmed: true } })
    toast.add({
      title: 'Confirmat cu clientul',
      description: props.task.client?.name,
      color: 'success',
      icon: 'i-lucide-check'
    })
    emit('changed')
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <template v-if="applies">
    <UBadge
      v-if="task.clientConfirmed"
      label="Confirmat cu clientul"
      icon="i-lucide-phone-call"
      color="success"
      variant="subtle"
      size="sm"
    />
    <UButton
      v-else
      label="Am confirmat cu clientul"
      icon="i-lucide-phone"
      color="neutral"
      variant="outline"
      size="xs"
      :loading="loading"
      @click="confirm"
    />
  </template>
</template>
