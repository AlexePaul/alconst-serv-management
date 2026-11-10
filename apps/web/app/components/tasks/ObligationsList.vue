<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ObligationDto, Paginated } from '@alconst/shared'

/**
 * Obligațiile recurente, cu frecvența și următorul termen.
 * Folosită în pagina „Obligații” și în pagina unui client (cu `clientId` fix).
 */
const props = defineProps<{
  clientId?: string
  clientName?: string
}>()

const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const PAGE_SIZE = 25
const today = todayLocal()

const search = ref('')
const debouncedSearch = useDebounced(search)
const status = ref<'all' | 'active' | 'inactive'>('active')
const page = ref(1)

const statusItems = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Toate', value: 'all' }
]

watch([debouncedSearch, status], () => {
  page.value = 1
})

const { data, status: loadStatus, error, refresh } = useLazyAsyncData(
  `obligations:list:${props.clientId ?? 'all'}`,
  () => api<Paginated<ObligationDto>>('/obligations', {
    query: {
      search: debouncedSearch.value.trim() || undefined,
      status: status.value,
      clientId: props.clientId,
      page: page.value,
      pageSize: PAGE_SIZE
    }
  }),
  { watch: [debouncedSearch, status, page] }
)

const obligations = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const hasFilters = computed(() => search.value.trim() !== '' || status.value !== 'active')

function clearFilters() {
  search.value = ''
  status.value = 'active'
}

const formOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<ObligationDto | null>(null)
const deleting = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(obligation: ObligationDto) {
  selected.value = obligation
  formOpen.value = true
}

function openDelete(obligation: ObligationDto) {
  selected.value = obligation
  deleteOpen.value = true
}

async function onSaved() {
  await refresh()
  emit('changed')
}

async function confirmDelete() {
  const obligation = selected.value
  if (!obligation) return
  deleting.value = true
  try {
    await api(`/obligations/${obligation.id}`, { method: 'DELETE' })
    toast.add({ title: 'Obligația a fost ștearsă', description: obligation.title, color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await onSaved()
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}

function actions(obligation: ObligationDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(obligation) }],
    [{ label: 'Șterge', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(obligation) }]
  ]
}

defineExpose({ openCreate })
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Caută după titlu sau client"
        aria-label="Caută obligații"
        class="w-full sm:w-72"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        aria-label="Filtrează după status"
        class="w-36 shrink-0"
      />
      <UButton
        v-if="clientId"
        icon="i-lucide-plus"
        label="Adaugă obligație"
        class="sm:ml-auto"
        @click="openCreate"
      />
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Obligațiile nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="loadStatus === 'pending' && !data" class="space-y-3">
      <USkeleton v-for="index in 3" :key="index" class="h-20 w-full" />
    </div>

    <UEmpty
      v-else-if="obligations.length === 0"
      :icon="hasFilters ? 'i-lucide-search-x' : 'i-lucide-repeat'"
      :title="hasFilters ? 'Nicio obligație găsită' : 'Nicio obligație încă'"
      :description="hasFilters
        ? 'Nicio obligație nu corespunde căutării sau filtrului ales.'
        : 'Adaugă activitățile care se repetă – deplasări lunare, instruiri la 3 luni – iar aplicația creează singură task-urile și îți amintește de termene.'"
      :actions="hasFilters
        ? [{ label: 'Șterge filtrele', color: 'neutral', variant: 'outline', onClick: clearFilters }]
        : [{ label: 'Adaugă obligație', icon: 'i-lucide-plus', onClick: openCreate }]"
      variant="naked"
    />

    <template v-else>
      <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
        <li v-for="obligation in obligations" :key="obligation.id" class="flex items-start gap-3 px-4 py-3 sm:px-5">
          <div
            class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
            :class="obligation.isActive ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
          >
            <UIcon :name="TASK_KIND_ICONS[obligation.kind]" class="size-4" />
          </div>
          <button type="button" class="min-w-0 flex-1 text-left" @click="openEdit(obligation)">
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-medium text-highlighted">{{ obligation.title }}</span>
              <UBadge
                :label="formatRecurrence(obligation.recurrenceUnit, obligation.recurrenceInterval)"
                icon="i-lucide-repeat"
                color="neutral"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="!obligation.isActive"
                label="Inactivă"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </p>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
              <span v-if="obligation.client && !clientId" class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-building-2" class="size-3.5" />{{ obligation.client.name }}
              </span>
              <span v-if="obligation.location" class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-map-pin" class="size-3.5" />{{ obligation.location.name }}
              </span>
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-user-round" class="size-3.5" />{{ obligation.assignee ? `${obligation.assignee.firstName} ${obligation.assignee.lastName}` : 'Fără responsabil' }}
              </span>
            </p>
          </button>
          <div class="hidden shrink-0 text-right text-sm sm:block">
            <p class="text-muted">
              Următorul termen
            </p>
            <p class="font-medium" :class="obligation.nextDueDate && obligation.nextDueDate < today ? 'text-error' : 'text-highlighted'">
              {{ obligation.nextDueDate ? formatDate(obligation.nextDueDate) : '—' }}
            </p>
          </div>
          <UDropdownMenu :items="actions(obligation)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${obligation.title}`"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ countLabel(total, 'obligație', 'obligații') }}
        </p>
        <UPagination
          v-if="total > PAGE_SIZE"
          v-model:page="page"
          :total="total"
          :items-per-page="PAGE_SIZE"
          :sibling-count="1"
        />
      </div>
    </template>

    <TasksObligationFormModal
      v-model:open="formOpen"
      :obligation="selected"
      :defaults="{ clientId, clientName }"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Ștergi obligația?"
      :description="`„${selected?.title}” nu va mai genera task-uri, iar cele viitoare neîncepute vor fi șterse. Task-urile începute sau finalizate rămân în evidență.`"
      confirm-label="Șterge obligația"
      color="error"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
