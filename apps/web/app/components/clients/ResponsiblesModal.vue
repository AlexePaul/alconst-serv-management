<script setup lang="ts">
import type { ClientDto } from '@alconst/shared'

/** Stabilirea responsabililor unui client (doar pentru administratori). */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ client: ClientDto }>()
const emit = defineEmits<{ saved: [client: ClientDto] }>()

const api = useApi()
const toast = useToast()

const selected = ref<string[]>([])
const loading = ref(false)

const { data: users, status } = useUserOptions()

const items = computed(() =>
  users.value.map(user => ({
    label: `${user.firstName} ${user.lastName}`,
    description: USER_ROLE_LABELS[user.role],
    value: user.id
  }))
)

watch(open, (isOpen) => {
  if (isOpen) selected.value = props.client.responsibles.map(user => user.id)
})

async function save() {
  loading.value = true
  try {
    const saved = await api<ClientDto>(`/clients/${props.client.id}/responsibles`, {
      method: 'PUT',
      body: { userIds: selected.value }
    })
    emit('saved', saved)
    toast.add({ title: 'Responsabilii au fost actualizați', color: 'success', icon: 'i-lucide-check' })
    open.value = false
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Responsabili"
    :description="`Utilizatorii care pot vedea și modifica ${client.name}. Administratorii au acces la toți clienții.`"
    :dismissible="!loading"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div v-if="status === 'pending' && !users.length" class="space-y-3">
        <USkeleton v-for="index in 3" :key="index" class="h-10 w-full" />
      </div>
      <UCheckboxGroup
        v-else
        v-model="selected"
        :items="items"
        variant="table"
      />
      <UAlert
        v-if="selected.length === 0"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        description="Fără responsabili, clientul va fi vizibil doar administratorilor."
        class="mt-4"
      />
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Renunță"
        :disabled="loading"
        @click="open = false"
      />
      <UButton label="Salvează" :loading="loading" @click="save" />
    </template>
  </UModal>
</template>
