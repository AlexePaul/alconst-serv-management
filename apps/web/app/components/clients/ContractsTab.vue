<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ContractDto } from '@alconst/shared'

/** Contractele unui client, cu tarifele convenite. */
const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const { data: contracts, status, error, refresh } = useLazyAsyncData(
  `contracts:${props.clientId}`,
  () => api<ContractDto[]>('/contracts', { query: { clientId: props.clientId } }),
  { default: () => [] }
)

const formOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<ContractDto | null>(null)
const deleting = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(contract: ContractDto) {
  selected.value = contract
  formOpen.value = true
}

function openDelete(contract: ContractDto) {
  selected.value = contract
  deleteOpen.value = true
}

async function onSaved() {
  await refresh()
  emit('changed')
}

async function confirmDelete() {
  const contract = selected.value
  if (!contract) return
  deleting.value = true
  try {
    await api(`/contracts/${contract.id}`, { method: 'DELETE' })
    toast.add({ title: 'Contractul a fost șters', color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await onSaved()
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}

function actions(contract: ContractDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(contract) }],
    [{ label: 'Șterge', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(contract) }]
  ]
}

function title(contract: ContractDto): string {
  return contract.number ? `Contract nr. ${contract.number}` : 'Contract fără număr'
}

function period(contract: ContractDto): string {
  return contract.endDate
    ? `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`
    : `Din ${formatDate(contract.startDate)}, pe perioadă nedeterminată`
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        Perioadele contractuale și sumele încasate de la client.
      </p>
      <UButton icon="i-lucide-plus" label="Adaugă contract" @click="openCreate" />
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Contractele nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="status === 'pending' && !contracts.length" class="space-y-3">
      <USkeleton v-for="index in 2" :key="index" class="h-32 w-full" />
    </div>

    <UEmpty
      v-else-if="contracts.length === 0"
      icon="i-lucide-file-signature"
      title="Niciun contract"
      description="Adaugă contractul pentru a ține evidența perioadei și a sumelor încasate: lunar, la 3 luni, la deplasare sau combinat."
      :actions="[{ label: 'Adaugă contract', icon: 'i-lucide-plus', onClick: openCreate }]"
      variant="naked"
    />

    <ul v-else class="space-y-4">
      <li v-for="contract in contracts" :key="contract.id" class="rounded-lg border border-default bg-default">
        <div class="flex items-start gap-3 p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium text-highlighted">
                {{ title(contract) }}
              </p>
              <UBadge :label="CONTRACT_STATUS_LABELS[contract.status]" :color="CONTRACT_STATUS_COLORS[contract.status]" variant="subtle" />
              <UBadge
                v-if="contractExpiryWarning(contract)"
                :label="contractExpiryWarning(contract)?.label"
                :color="contractExpiryWarning(contract)?.color"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ period(contract) }}
            </p>
          </div>
          <UDropdownMenu :items="actions(contract)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${title(contract)}`"
            />
          </UDropdownMenu>
        </div>

        <div v-if="contract.fees.length > 0" class="border-t border-default">
          <ul class="divide-y divide-default">
            <li
              v-for="fee in contract.fees"
              :key="fee.id"
              class="flex flex-col gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between"
            >
              <p class="min-w-0 text-default">
                <span class="font-medium text-highlighted">{{ fee.serviceName ?? fee.description }}</span>
                <span v-if="fee.serviceName && fee.description" class="ml-1 text-muted">· {{ fee.description }}</span>
              </p>
              <p class="sm:shrink-0 sm:text-right">
                <span class="font-medium text-highlighted">{{ formatMoney(fee.amount) }}</span>
                <span class="ml-1 text-muted">{{ formatFeeFrequency(fee.frequencyUnit, fee.frequencyInterval) }}</span>
              </p>
            </li>
          </ul>
          <div v-if="contract.monthlyEstimate > 0" class="flex justify-between gap-4 border-t border-default bg-elevated/40 px-4 py-2.5 text-sm">
            <span class="text-muted">Echivalent lunar</span>
            <span class="font-semibold text-highlighted">{{ formatMoney(contract.monthlyEstimate) }}</span>
          </div>
        </div>
        <p v-else class="border-t border-default px-4 py-3 text-sm text-muted">
          Niciun tarif definit.
        </p>

        <p v-if="contract.notes" class="border-t border-default px-4 py-3 text-sm whitespace-pre-line text-default">
          {{ contract.notes }}
        </p>
      </li>
    </ul>

    <ClientsContractFormModal
      v-model:open="formOpen"
      :client-id="clientId"
      :contract="selected"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Ștergi contractul?"
      :description="`${selected ? title(selected) : 'Contractul'} și tarifele lui vor fi șterse definitiv. Dacă doar s-a încheiat, schimbă-i statusul în „Încheiat”.`"
      confirm-label="Șterge contractul"
      color="error"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
