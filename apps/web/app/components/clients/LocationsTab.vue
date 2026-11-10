<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LocationDto } from '@alconst/shared'

/** Punctele de lucru ale unui client. */
const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const { data: locations, status, error, refresh } = useLazyAsyncData(
  `locations:${props.clientId}`,
  () => api<LocationDto[]>('/locations', { query: { clientId: props.clientId } }),
  { default: () => [] }
)

const formOpen = ref(false)
const archiveOpen = ref(false)
const selected = ref<LocationDto | null>(null)
const saving = ref(false)

// Punctele de lucru nu se șterg: cele închise se arhivează și rămân în evidență.
const showArchived = ref(false)
const archivedCount = computed(() => locations.value.filter(location => !location.isActive).length)
const visible = computed(() => showArchived.value ? locations.value : locations.value.filter(location => location.isActive))

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(location: LocationDto) {
  selected.value = location
  formOpen.value = true
}

function openArchive(location: LocationDto) {
  selected.value = location
  archiveOpen.value = true
}

async function onSaved() {
  await refresh()
  emit('changed')
}

async function setActive(location: LocationDto, isActive: boolean) {
  saving.value = true
  try {
    await api(`/locations/${location.id}`, { method: 'PATCH', body: { isActive } })
    toast.add({
      title: isActive ? 'Punctul de lucru a fost reactivat' : 'Punctul de lucru a fost arhivat',
      description: location.name,
      color: 'success',
      icon: 'i-lucide-check'
    })
    archiveOpen.value = false
    await onSaved()
  } catch (error) {
    toast.add({ title: 'Modificarea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

function actions(location: LocationDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(location) }],
    [location.isActive
      ? { label: 'Arhivează', icon: 'i-lucide-archive', onSelect: () => openArchive(location) }
      : { label: 'Reactivează', icon: 'i-lucide-archive-restore', onSelect: () => { setActive(location, true) } }]
  ]
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted">
        Locațiile în care clientul își desfășoară activitatea.
      </p>
      <UButton icon="i-lucide-plus" label="Adaugă punct de lucru" @click="openCreate" />
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Punctele de lucru nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="status === 'pending' && !locations.length" class="space-y-3">
      <USkeleton v-for="index in 2" :key="index" class="h-20 w-full" />
    </div>

    <UEmpty
      v-else-if="locations.length === 0"
      icon="i-lucide-map-pin"
      title="Niciun punct de lucru"
      description="Adaugă punctele de lucru pentru a putea asocia angajații cu locația în care lucrează."
      :actions="[{ label: 'Adaugă punct de lucru', icon: 'i-lucide-plus', onClick: openCreate }]"
      variant="naked"
    />

    <template v-else>
      <p v-if="visible.length === 0" class="py-6 text-center text-sm text-muted">
        Toate punctele de lucru sunt arhivate.
      </p>
      <ul v-else class="grid gap-3 sm:grid-cols-2">
        <li
          v-for="location in visible"
          :key="location.id"
          class="flex items-start gap-3 rounded-lg border border-default bg-default p-4"
          :class="{ 'opacity-70': !location.isActive }"
        >
          <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
            <UIcon name="i-lucide-map-pin" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">
              {{ location.name }}
              <UBadge
                v-if="!location.isActive"
                label="Arhivat"
                color="neutral"
                variant="subtle"
                size="sm"
                class="ml-1 align-middle"
              />
            </p>
            <p class="text-sm text-muted">
              {{ orDash(location.address) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ countLabel(location.employeeCount, 'angajat', 'angajați') }}
            </p>
            <p v-if="location.notes" class="mt-2 text-sm whitespace-pre-line text-default">
              {{ location.notes }}
            </p>
          </div>
          <UDropdownMenu :items="actions(location)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${location.name}`"
            />
          </UDropdownMenu>
        </li>
      </ul>
      <UButton
        v-if="archivedCount > 0"
        class="mt-3"
        color="neutral"
        variant="link"
        size="sm"
        :icon="showArchived ? 'i-lucide-eye-off' : 'i-lucide-archive'"
        :label="showArchived ? 'Ascunde punctele de lucru arhivate' : `Arată și punctele de lucru arhivate (${archivedCount})`"
        @click="showArchived = !showArchived"
      />
    </template>

    <ClientsLocationFormModal
      v-model:open="formOpen"
      :client-id="clientId"
      :location="selected"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="archiveOpen"
      title="Arhivezi punctul de lucru?"
      :description="`„${selected?.name}” nu va mai putea fi ales pentru angajați, obligații și task-uri noi. Angajații și istoricul lui rămân în evidență, iar punctul de lucru poate fi reactivat oricând. Obligațiile recurente legate de el rămân active până le dezactivezi.`"
      confirm-label="Arhivează"
      color="warning"
      :loading="saving"
      @confirm="selected && setActive(selected, false)"
    />
  </div>
</template>
