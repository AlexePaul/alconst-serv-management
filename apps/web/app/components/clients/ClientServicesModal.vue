<script setup lang="ts">
import type { ClientDto } from '@alconst/shared'

/** Alegerea serviciilor prestate unui client, din catalogul firmei. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ client: ClientDto }>()
const emit = defineEmits<{ saved: [client: ClientDto] }>()

const api = useApi()
const toast = useToast()
const { isAdmin } = useAuth()

const selected = ref<string[]>([])
const loading = ref(false)

const { data: services, status, refresh } = useServices()

// Serviciile dezactivate apar doar dacă sunt deja asociate clientului (ca să poată fi scoase).
const items = computed(() => {
  const current = new Set(props.client.services.map(service => service.id))
  return services.value
    .filter(service => service.isActive || current.has(service.id))
    .map(service => ({
      label: service.isActive ? service.name : `${service.name} (dezactivat)`,
      description: service.description ?? undefined,
      value: service.id
    }))
})

watch(open, (isOpen) => {
  if (!isOpen) return
  selected.value = props.client.services.map(service => service.id)
  refresh()
})

async function save() {
  loading.value = true
  try {
    const saved = await api<ClientDto>(`/clients/${props.client.id}/services`, {
      method: 'PUT',
      body: { serviceIds: selected.value }
    })
    emit('saved', saved)
    toast.add({ title: 'Serviciile au fost actualizate', color: 'success', icon: 'i-lucide-check' })
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
    title="Servicii prestate"
    :description="`Alege serviciile pe care firma le prestează pentru ${client.name}.`"
    :dismissible="!loading"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div v-if="status === 'pending' && !services.length" class="space-y-3">
        <USkeleton v-for="index in 3" :key="index" class="h-10 w-full" />
      </div>
      <UEmpty
        v-else-if="items.length === 0"
        variant="naked"
        icon="i-lucide-briefcase"
        title="Catalogul de servicii este gol"
        :description="isAdmin ? 'Adaugă mai întâi serviciile oferite de firmă.' : 'Cere unui administrator să adauge serviciile oferite de firmă.'"
        :actions="isAdmin ? [{ label: 'Deschide catalogul de servicii', to: '/servicii' }] : []"
      />
      <UCheckboxGroup
        v-else
        v-model="selected"
        :items="items"
        variant="table"
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
      <UButton
        label="Salvează"
        :loading="loading"
        :disabled="items.length === 0"
        @click="save"
      />
    </template>
  </UModal>
</template>
