<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { ClientEmployeeDto, Paginated } from '@alconst/shared'

/**
 * Lista angajaților clienților, cu căutare, filtre și paginare.
 * Folosită atât în pagina generală „Angajați”, cât și în pagina unui client (cu `clientId` fix).
 */
const props = defineProps<{
  clientId?: string
}>()

const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const PAGE_SIZE = 25

const search = ref('')
const debouncedSearch = useDebounced(search)
const status = ref<'all' | 'active' | 'inactive'>('active')
const clientFilter = ref<string | undefined>()
const page = ref(1)

const statusItems = [
  { label: 'Angajați activi', value: 'active' },
  { label: 'Angajați inactivi', value: 'inactive' },
  { label: 'Toți angajații', value: 'all' }
]

watch([debouncedSearch, status, clientFilter], () => {
  page.value = 1
})

const { data, status: loadStatus, error, refresh } = useLazyAsyncData(
  `employees:list:${props.clientId ?? 'all'}`,
  () => api<Paginated<ClientEmployeeDto>>('/employees', {
    query: {
      search: debouncedSearch.value.trim() || undefined,
      status: status.value,
      clientId: props.clientId ?? clientFilter.value,
      page: page.value,
      pageSize: PAGE_SIZE
    }
  }),
  { watch: [debouncedSearch, status, clientFilter, page] }
)

const employees = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const hasFilters = computed(() =>
  search.value.trim() !== '' || status.value !== 'active' || clientFilter.value !== undefined
)

function clearFilters() {
  search.value = ''
  status.value = 'active'
  clientFilter.value = undefined
}

// --- Acțiuni ---------------------------------------------------------------------------------

const formOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<ClientEmployeeDto | null>(null)
const deleting = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(employee: ClientEmployeeDto) {
  selected.value = employee
  formOpen.value = true
}

function openDelete(employee: ClientEmployeeDto) {
  selected.value = employee
  deleteOpen.value = true
}

async function onSaved() {
  await refresh()
  emit('changed')
}

async function confirmDelete() {
  const employee = selected.value
  if (!employee) return
  deleting.value = true
  try {
    await api(`/employees/${employee.id}`, { method: 'DELETE' })
    toast.add({ title: 'Angajatul a fost șters', description: `${employee.firstName} ${employee.lastName}`, color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await onSaved()
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}

function rowActions(employee: ClientEmployeeDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(employee) }],
    [{ label: 'Șterge', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(employee) }]
  ]
}

const columns = computed<TableColumn<ClientEmployeeDto>[]>(() => [
  { id: 'name', header: 'Angajat' },
  ...(props.clientId ? [] : [{ id: 'client', header: 'Client' }]),
  { id: 'location', header: 'Punct de lucru' },
  { id: 'hireDate', header: 'Data angajării' },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: '', meta: { class: { td: 'w-0 text-right' } } }
])

defineExpose({ openCreate })
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Caută după nume sau funcție"
        aria-label="Caută angajați"
        class="w-full sm:w-72"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        aria-label="Filtrează după status"
        class="w-44 shrink-0"
      />
      <div v-if="!clientId" class="w-full sm:w-64">
        <ClientsClientSelect
          v-model="clientFilter"
          placeholder="Toți clienții"
          include-inactive
          clearable
        />
      </div>
      <UButton
        v-if="clientId"
        icon="i-lucide-plus"
        label="Adaugă angajat"
        class="sm:ml-auto"
        @click="openCreate"
      />
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Angajații nu au putut fi încărcați"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="loadStatus === 'pending' && !data" class="space-y-3">
      <USkeleton v-for="index in 5" :key="index" class="h-14 w-full" />
    </div>

    <UEmpty
      v-else-if="employees.length === 0"
      :icon="hasFilters ? 'i-lucide-search-x' : 'i-lucide-users-round'"
      :title="hasFilters ? 'Niciun angajat găsit' : 'Niciun angajat încă'"
      :description="hasFilters
        ? 'Niciun angajat nu corespunde căutării sau filtrelor alese.'
        : clientId
          ? 'Adaugă angajații acestui client pentru a-i putea folosi ulterior în instruiri și documente.'
          : 'Aici apar angajații clienților tăi.'"
      :actions="hasFilters
        ? [{ label: 'Șterge filtrele', color: 'neutral', variant: 'outline', onClick: clearFilters }]
        : [{ label: 'Adaugă angajat', icon: 'i-lucide-plus', onClick: openCreate }]"
      variant="naked"
    />

    <template v-else>
      <!-- Desktop: tabel -->
      <UTable
        :data="employees"
        :columns="columns"
        :loading="loadStatus === 'pending'"
        class="hidden md:block"
        :ui="{ td: 'align-middle' }"
      >
        <template #name-cell="{ row }">
          <p class="font-medium text-highlighted">
            {{ row.original.lastName }} {{ row.original.firstName }}
          </p>
          <p v-if="row.original.position" class="text-muted">
            {{ row.original.position }}
          </p>
        </template>

        <template #client-cell="{ row }">
          <ULink :to="`/clienti/${row.original.clientId}`" class="hover:underline">
            {{ row.original.clientName }}
          </ULink>
        </template>

        <template #location-cell="{ row }">
          <span :class="row.original.locationName ? '' : 'text-dimmed'">{{ orDash(row.original.locationName) }}</span>
        </template>

        <template #hireDate-cell="{ row }">
          <span v-if="row.original.hireDate">{{ formatDate(row.original.hireDate) }}</span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #status-cell="{ row }">
          <StatusBadge :active="row.original.isActive" />
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${row.original.firstName} ${row.original.lastName}`"
            />
          </UDropdownMenu>
        </template>
      </UTable>

      <!-- Mobil: listă de carduri -->
      <ul class="space-y-3 md:hidden">
        <li
          v-for="employee in employees"
          :key="employee.id"
          class="flex items-start gap-3 rounded-lg border border-default bg-default p-4"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-highlighted">
              {{ employee.lastName }} {{ employee.firstName }}
            </p>
            <p v-if="employee.position" class="truncate text-sm text-muted">
              {{ employee.position }}
            </p>
            <p v-if="!clientId" class="mt-1 truncate text-sm">
              <ULink :to="`/clienti/${employee.clientId}`" class="text-primary">
                {{ employee.clientName }}
              </ULink>
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <StatusBadge :active="employee.isActive" />
              <span v-if="employee.locationName">{{ employee.locationName }}</span>
            </div>
          </div>
          <UDropdownMenu :items="rowActions(employee)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${employee.firstName} ${employee.lastName}`"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ countLabel(total, 'angajat', 'angajați') }}
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

    <ClientsEmployeeFormModal
      v-model:open="formOpen"
      :employee="selected"
      :client-id="clientId"
      @saved="onSaved"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Ștergi angajatul?"
      :description="`${selected?.firstName} ${selected?.lastName} va fi șters definitiv din evidență. Dacă persoana doar a plecat din companie, marcheaz-o ca inactivă în loc să o ștergi.`"
      confirm-label="Șterge angajatul"
      color="error"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
