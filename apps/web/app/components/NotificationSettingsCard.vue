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

// --- Notificările pe acest dispozitiv (Web Push) ---------------------------------------------
const push = usePushNotifications()
const { isMobile } = useDeviceInfo()
const testing = ref(false)
const deviceName = isMobile ? 'acest telefon' : 'acest dispozitiv'

onMounted(() => {
  if (push.state.value === null) push.refresh()
})

async function togglePush(enabled: boolean) {
  try {
    if (!enabled) {
      await push.disable()
      toast.add({ title: 'Notificările sunt oprite pe ' + deviceName, color: 'success', icon: 'i-lucide-bell-off' })
      return
    }
    const result = await push.enable()
    if (result === 'on') toast.add({ title: 'Notificările sunt pornite pe ' + deviceName, color: 'success', icon: 'i-lucide-bell-ring' })
  } catch (error) {
    toast.add({
      title: 'Operațiunea nu a reușit',
      description: error instanceof Error && !getApiError(error) ? error.message : apiErrorMessage(error),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

async function sendTest() {
  testing.value = true
  try {
    await push.sendTest()
    toast.add({ title: 'Notificarea de probă a fost trimisă', description: 'Ar trebui să apară în câteva secunde.', color: 'success', icon: 'i-lucide-send' })
  } catch (error) {
    toast.add({ title: 'Notificarea nu a putut fi trimisă', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    testing.value = false
  }
}

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
        Reamintirile apar în aplicație, la „Notificări”, pentru activitățile pe care le ai tu de făcut. În ziua termenului și la restanțe ești anunțat întotdeauna.
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
      <div class="rounded-lg border border-default p-4">
        <template v-if="push.state.value === 'on' || push.state.value === 'off'">
          <USwitch
            :model-value="push.state.value === 'on'"
            :loading="push.busy.value"
            :disabled="push.busy.value"
            :label="`Notificări pe ${deviceName}`"
            description="Apar ca mesajele oricărei aplicații: când primești ceva de făcut, cereri de la colegi și, dimineața, termenele. Între 21:00 și 7:00 nu primești reamintiri."
            @update:model-value="togglePush"
          />
          <UButton
            v-if="push.state.value === 'on'"
            class="mt-3"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-send"
            label="Trimite o notificare de probă"
            :loading="testing"
            @click="sendTest"
          />
        </template>
        <div v-else-if="push.state.value === 'needs-install'" class="flex gap-3 text-sm">
          <UIcon name="i-lucide-smartphone" class="mt-0.5 size-5 shrink-0 text-primary" />
          <p class="text-default">
            <span class="font-medium text-highlighted">Notificări pe telefon:</span>
            pe iPhone apar doar după ce pui aplicația pe ecranul principal. În Safari apasă butonul de partajare
            <UIcon name="i-lucide-share" class="inline-block size-4 align-[-3px]" />, alege „Adaugă pe ecranul principal”, apoi deschide aplicația de acolo și revino aici.
          </p>
        </div>
        <div v-else-if="push.state.value === 'denied'" class="flex gap-3 text-sm">
          <UIcon name="i-lucide-bell-off" class="mt-0.5 size-5 shrink-0 text-warning" />
          <p class="text-default">
            <span class="font-medium text-highlighted">Notificările sunt blocate pe {{ deviceName }}.</span>
            Le poți permite din setările telefonului: Setări → Notificări → Alconst Serv (pe iPhone) sau Setări → Aplicații → Alconst Serv → Notificări (pe Android).
          </p>
        </div>
        <div v-else-if="push.state.value === 'unsupported'" class="flex gap-3 text-sm">
          <UIcon name="i-lucide-bell-off" class="mt-0.5 size-5 shrink-0 text-muted" />
          <p class="text-muted">
            Acest browser nu poate primi notificări. Pe telefon, pune aplicația pe ecranul principal; pe calculator, folosește Chrome, Edge, Firefox sau Safari.
          </p>
        </div>
        <USkeleton v-else class="h-10 w-64" />
      </div>

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
        description="Primești imediat un email când un coleg îți dă ceva de făcut sau apare o cerere de predare a unui client, și cel mult un rezumat pe zi cu termenele. Emailurile nu conțin titluri de task-uri sau nume de clienți."
        @update:model-value="save({ emailEnabled: $event })"
      />
    </div>
  </UCard>
</template>
