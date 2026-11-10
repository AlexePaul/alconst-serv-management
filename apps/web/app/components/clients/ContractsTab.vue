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
const endOpen = ref(false)
const selected = ref<ContractDto | null>(null)
const saving = ref(false)

// Contractele nu se șterg: cele încetate rămân în evidență cu statusul „Încheiat”.
const showEnded = ref(false)
const endedCount = computed(() => contracts.value.filter(contract => contract.status === 'ENDED').length)
const visible = computed(() => showEnded.value ? contracts.value : contracts.value.filter(contract => contract.status !== 'ENDED'))

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(contract: ContractDto) {
  selected.value = contract
  formOpen.value = true
}

function openEnd(contract: ContractDto) {
  selected.value = contract
  endOpen.value = true
}

async function onSaved() {
  await refresh()
  emit('changed')
}

async function confirmEnd() {
  const contract = selected.value
  if (!contract) return
  saving.value = true
  try {
    await api(`/contracts/${contract.id}`, { method: 'PATCH', body: { status: 'ENDED', endDate: endDateWhenEnding(contract) } })
    toast.add({ title: 'Contractul a fost încheiat', description: 'Rămâne în evidență, la contractele încheiate.', color: 'success', icon: 'i-lucide-check' })
    endOpen.value = false
    await onSaved()
  } catch (error) {
    toast.add({ title: 'Modificarea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

function actions(contract: ContractDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(contract) }],
    ...(contract.status === 'ENDED'
      ? []
      : [[{ label: 'Încheie contractul', icon: 'i-lucide-archive', onSelect: () => openEnd(contract) }]])
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

    <p v-else-if="visible.length === 0" class="py-6 text-center text-sm text-muted">
      Niciun contract în vigoare sau în pregătire.
    </p>

    <ul v-else class="space-y-4">
      <li
        v-for="contract in visible"
        :key="contract.id"
        class="rounded-lg border border-default bg-default"
        :class="{ 'opacity-70': contract.status === 'ENDED' }"
      >
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

    <UButton
      v-if="endedCount > 0 && !error"
      class="mt-3"
      color="neutral"
      variant="link"
      size="sm"
      :icon="showEnded ? 'i-lucide-eye-off' : 'i-lucide-archive'"
      :label="showEnded ? 'Ascunde contractele încheiate' : `Arată și contractele încheiate (${endedCount})`"
      @click="showEnded = !showEnded"
    />

    <ClientsContractFormModal
      v-model:open="formOpen"
      :client-id="clientId"
      :contract="selected"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="endOpen"
      title="Închei contractul?"
      :description="`${selected ? title(selected) : 'Contractul'} va fi marcat ca încheiat și nu va mai intra în venitul lunar estimat. Contractul și tarifele lui rămân în evidență.`"
      confirm-label="Încheie contractul"
      color="warning"
      :loading="saving"
      @confirm="confirmEnd"
    />
  </div>
</template>
