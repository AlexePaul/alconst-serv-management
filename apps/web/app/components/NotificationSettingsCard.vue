<script setup lang="ts">
import type { NotificationSettingsDto } from '@alconst/shared'
import { MAX_REMIND_DAYS_BEFORE } from '@alconst/shared'

/** Preferințele de notificare ale utilizatorului curent. */
const api = useApi()
const toast = useToast()

const { data: settings, status, error, refresh } = useLazyAsyncData(
  'notifications:settings',
  () => api<NotificationSettingsDto>('/notifications/settings')
)

const saving = ref(false)

const remindItems = [
  { label: 'Fără reamintire în avans', value: 0 },
  { label: 'Cu o zi înainte', value: 1 },
  { label: 'Cu 2 zile înainte', value: 2 },
  { label: 'Cu 3 zile înainte', value: 3 },
  { label: 'Cu 5 zile înainte', value: 5 },
  { label: 'Cu 7 zile înainte', value: 7 },
  { label: 'Cu 14 zile înainte', value: 14 }
].filter(item => item.value <= MAX_REMIND_DAYS_BEFORE)

async function save(changes: Partial<NotificationSettingsDto>) {
  saving.value = true
  try {
    settings.value = await api<NotificationSettingsDto>('/notifications/settings', { method: 'PUT', body: changes })
    toast.add({ title: 'Setările au fost salvate', color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Setările nu au putut fi salvate', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold text-highlighted">
        Notificări
      </h2>
      <p class="text-sm text-muted">
        Reamintirile apar în aplicație pentru task-urile al căror responsabil ești. În ziua termenului și la restanțe ești anunțat întotdeauna.
      </p>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-cloud-off"
      title="Setările nu au putut fi încărcate"
      :actions="[{ label: 'Încearcă din nou', color: 'error', variant: 'outline', onClick: () => { refresh() } }]"
    />
    <div v-else-if="!settings && status === 'pending'" class="space-y-3">
      <USkeleton class="h-10 w-64" />
      <USkeleton class="h-10 w-64" />
    </div>
    <div v-else-if="settings" class="space-y-5">
      <UFormField label="Reamintire înainte de termen">
        <USelect
          :model-value="settings.remindDaysBefore"
          :items="remindItems"
          :disabled="saving"
          class="w-full sm:w-72"
          @update:model-value="save({ remindDaysBefore: Number($event) })"
        />
      </UFormField>

      <USwitch
        :model-value="settings.emailEnabled"
        :disabled="saving"
        label="Notificări pe email"
        description="Primești imediat un email când ți se atribuie un task sau apare o cerere de predare a unui client, și cel mult un rezumat pe zi cu termenele. Emailurile nu conțin titluri de task-uri sau nume de clienți."
        @update:model-value="save({ emailEnabled: $event })"
      />
    </div>
  </UCard>
</template>
