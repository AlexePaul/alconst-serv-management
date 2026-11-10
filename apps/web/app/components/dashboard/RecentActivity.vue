<script setup lang="ts">
import type { ActivityAction, ActivityLogDto } from '@alconst/shared'
import { ACTIVITY_ACTION_LABELS } from '@alconst/shared'

/** Ultimele acțiuni din jurnalul de activitate (vizibil doar administratorilor). */
const api = useApi()

const { data, status, error, refresh } = useLazyAsyncData(
  'dashboard:activity',
  () => api<ActivityLogDto[]>('/activity', { query: { limit: 8 } })
)

const ICONS: Partial<Record<string, string>> = {
  'auth.login': 'i-lucide-log-in',
  'auth.login_failed': 'i-lucide-shield-alert',
  'auth.logout': 'i-lucide-log-out',
  'auth.password_changed': 'i-lucide-key-round',
  'auth.password_reset_requested': 'i-lucide-mail',
  'auth.password_reset_completed': 'i-lucide-key-round',
  'user.updated': 'i-lucide-user-pen',
  'user.password_reset_by_admin': 'i-lucide-key-round',
  'user.created': 'i-lucide-user-plus',
  'user.deactivated': 'i-lucide-user-x',
  'user.activated': 'i-lucide-user-check'
}

function describe(entry: ActivityLogDto): string {
  const label = ACTIVITY_ACTION_LABELS[entry.action as ActivityAction] ?? entry.action
  return entry.entityLabel ? `${label}: ${entry.entityLabel}` : label
}

function actor(entry: ActivityLogDto): string {
  if (entry.user) return `${entry.user.firstName} ${entry.user.lastName}`
  // Fără utilizator: fie o încercare de autentificare anonimă, fie o operațiune din linia de comandă.
  return entry.action === 'auth.login_failed' ? 'Necunoscut' : 'Sistem'
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-highlighted">
            Activitate recentă
          </h2>
          <p class="text-sm text-muted">
            Ultimele acțiuni ale utilizatorilor
          </p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          aria-label="Reîncarcă activitatea"
          :loading="status === 'pending'"
          @click="refresh()"
        />
      </div>
    </template>

    <div v-if="status === 'pending' && !data" class="space-y-4 p-4 sm:p-6">
      <div v-for="index in 4" :key="index" class="flex items-center gap-3">
        <USkeleton class="size-8 rounded-full" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-3 w-2/3" />
          <USkeleton class="h-3 w-1/3" />
        </div>
      </div>
    </div>

    <UEmpty
      v-else-if="error"
      variant="naked"
      icon="i-lucide-cloud-off"
      title="Activitatea nu a putut fi încărcată"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', color: 'neutral', variant: 'outline', onClick: () => { refresh() } }]"
    />

    <UEmpty
      v-else-if="!data?.length"
      variant="naked"
      icon="i-lucide-history"
      title="Nicio activitate încă"
      description="Aici vor apărea acțiunile efectuate de utilizatori."
    />

    <ul v-else class="divide-y divide-default">
      <li v-for="entry in data" :key="entry.id" class="flex items-start gap-3 px-4 py-3 sm:px-6">
        <div
          class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
          :class="entry.action === 'auth.login_failed' ? 'bg-warning/10 text-warning' : 'bg-elevated text-muted'"
        >
          <UIcon :name="ICONS[entry.action] ?? 'i-lucide-activity'" class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-default">
            <span class="font-medium text-highlighted">{{ actor(entry) }}</span>
            · {{ describe(entry) }}
          </p>
          <p class="text-xs text-muted" :title="formatDateTime(entry.createdAt)">
            {{ formatRelative(entry.createdAt) }}
          </p>
        </div>
      </li>
    </ul>
  </UCard>
</template>
