<script setup lang="ts">
import type { ClientsSummaryDto } from '@alconst/shared'
import { NuxtLink } from '#components'

/**
 * Cifrele-cheie despre clienți și contractele care au nevoie de atenție.
 * Sunt calculate pe server doar din clienții vizibili utilizatorului curent.
 */
const api = useApi()

const { data, status, error, refresh } = useLazyAsyncData(
  'dashboard:clients-summary',
  () => api<ClientsSummaryDto>('/clients/summary')
)

const stats = computed(() => [
  { label: 'Clienți activi', value: String(data.value?.activeClients ?? 0), icon: 'i-lucide-building-2', to: '/clienti' },
  { label: 'Angajați la clienți', value: String(data.value?.totalEmployees ?? 0), icon: 'i-lucide-users-round', hint: 'Suma angajaților declarați ai clienților activi' },
  {
    label: 'Venit lunar estimat',
    value: data.value ? formatMoney(data.value.monthlyEstimate) : '—',
    icon: 'i-lucide-banknote',
    hint: 'Din tarifele recurente ale contractelor active'
  }
])
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-cloud-off"
      title="Datele despre clienți nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', color: 'error', variant: 'outline', onClick: () => { refresh() } }]"
    />

    <div v-else class="grid gap-4 sm:grid-cols-3">
      <component
        :is="stat.to ? NuxtLink : 'div'"
        v-for="stat in stats"
        :key="stat.label"
        :to="stat.to"
        class="rounded-lg border border-default bg-default p-4 sm:p-5"
        :class="stat.to ? 'transition-colors hover:border-accented hover:bg-elevated/40' : ''"
      >
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon :name="stat.icon" class="size-4" />
          {{ stat.label }}
        </div>
        <USkeleton v-if="status === 'pending' && !data" class="mt-2 h-8 w-24" />
        <p v-else class="mt-1 text-2xl font-semibold text-highlighted">
          {{ stat.value }}
        </p>
        <p v-if="stat.hint" class="mt-1 text-xs text-muted">
          {{ stat.hint }}
        </p>
      </component>
    </div>

    <UCard v-if="data?.expiringContracts.length" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
          <div>
            <h2 class="font-semibold text-highlighted">
              Contracte care expiră
            </h2>
            <p class="text-sm text-muted">
              Contracte active expirate sau care expiră în următoarele 30 de zile
            </p>
          </div>
        </div>
      </template>

      <ul class="divide-y divide-default">
        <li v-for="contract in data.expiringContracts" :key="contract.id">
          <NuxtLink
            :to="`/clienti/${contract.clientId}`"
            class="flex items-center justify-between gap-4 px-4 py-3 hover:bg-elevated/40 sm:px-6"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ contract.clientName }}
              </p>
              <p class="text-sm text-muted">
                {{ contract.number ? `Contract nr. ${contract.number}` : 'Contract fără număr' }}
                · {{ formatDate(contract.endDate) }}
              </p>
            </div>
            <UBadge
              :label="contractExpiryWarning({ status: 'ACTIVE', endDate: contract.endDate })?.label"
              :color="contractExpiryWarning({ status: 'ACTIVE', endDate: contract.endDate })?.color"
              variant="subtle"
              class="shrink-0"
            />
          </NuxtLink>
        </li>
      </ul>
    </UCard>
  </div>
</template>
