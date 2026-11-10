<script setup lang="ts">
import type { ClientTransferRequestDto } from '@alconst/shared'

/**
 * Cererile de predare definitivă a unui client care așteaptă un răspuns.
 * Apare doar când există cel puțin o cerere în care este implicat utilizatorul.
 */
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { data: requests, refresh } = useClientTransfers()

const busy = ref<string | null>(null)
const name = (person: { firstName: string, lastName: string }) => `${person.firstName} ${person.lastName}`

/** Descrierea cererii din punctul de vedere al celui care o citește. */
function describe(request: ClientTransferRequestDto): string {
  const me = user.value?.id
  if (request.to.id === me) {
    return request.initiatedBy.id === me
      ? `Ai cerut să preiei acest client de la ${name(request.from)}.`
      : `${name(request.from)} vrea să îți predea acest client.`
  }
  if (request.from.id === me) {
    return request.initiatedBy.id === me
      ? `Ai propus predarea acestui client către ${name(request.to)}.`
      : `${name(request.to)} vrea să preia acest client de la tine.`
  }
  return `${name(request.initiatedBy)} a cerut predarea de la ${name(request.from)} către ${name(request.to)}.`
}

const MESSAGES = {
  accept: 'Clientul a fost predat',
  decline: 'Cererea a fost refuzată',
  cancel: 'Cererea a fost retrasă'
} as const

async function respond(request: ClientTransferRequestDto, action: keyof typeof MESSAGES) {
  busy.value = `${request.id}:${action}`
  try {
    await api(`/client-transfers/${request.id}/${action}`, { method: 'POST' })
    toast.add({ title: MESSAGES[action], description: request.client.name, color: 'success', icon: 'i-lucide-check' })
    emit('changed')
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = null
    await refresh()
  }
}
</script>

<template>
  <UCard v-if="requests.length" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-arrow-left-right" class="size-5 text-primary" />
        <div>
          <h2 class="font-semibold text-highlighted">
            Cereri de predare a clienților
          </h2>
          <p class="text-sm text-muted">
            Predarea definitivă are loc doar cu acordul amândurora.
          </p>
        </div>
      </div>
    </template>

    <ul class="divide-y divide-default">
      <li
        v-for="request in requests"
        :key="request.id"
        class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ request.client.name }}
          </p>
          <p class="text-sm text-muted">
            {{ describe(request) }}
            <span :title="formatDateTime(request.createdAt)">· {{ formatRelative(request.createdAt) }}</span>
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <template v-if="request.canRespond">
            <UButton
              color="neutral"
              variant="outline"
              label="Refuză"
              :loading="busy === `${request.id}:decline`"
              :disabled="busy !== null"
              @click="respond(request, 'decline')"
            />
            <UButton
              label="Acceptă"
              :loading="busy === `${request.id}:accept`"
              :disabled="busy !== null"
              @click="respond(request, 'accept')"
            />
          </template>
          <UButton
            v-if="request.canCancel"
            color="neutral"
            variant="outline"
            label="Retrage cererea"
            :loading="busy === `${request.id}:cancel`"
            :disabled="busy !== null"
            @click="respond(request, 'cancel')"
          />
          <UBadge
            v-if="!request.canRespond && request.canCancel"
            label="Așteaptă răspuns"
            color="neutral"
            variant="subtle"
            class="self-center"
          />
        </div>
      </li>
    </ul>
  </UCard>
</template>
