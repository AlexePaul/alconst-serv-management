<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { ClientDto, ClientListItemDto, Paginated } from '@alconst/shared'

useHead({ title: 'Clienți' })

const api = useApi()
const route = useRoute()
const router = useRouter()
const { isAdmin } = useAuth()

const PAGE_SIZE = 25
const ALL = 'all'

// --- Căutare, filtre, paginare ---------------------------------------------------------------

const search = ref('')
const debouncedSearch = useDebounced(search)
const status = ref<'all' | 'active' | 'inactive'>('active')
const responsibleId = ref<string>(ALL)
const page = ref(1)

const statusItems = [
  { label: 'Clienți activi', value: 'active' },
  { label: 'Clienți inactivi', value: 'inactive' },
  { label: 'Toți clienții', value: 'all' }
]

const { data: userOptions } = useUserOptions()
const responsibleItems = computed(() => [
  { label: 'Toți responsabilii', value: ALL },
  ...userOptions.value.map(user => ({ label: `${user.firstName} ${user.lastName}`, value: user.id }))
])

watch([debouncedSearch, status, responsibleId], () => {
  page.value = 1
})

const { data, status: loadStatus, error, refresh } = useLazyAsyncData(
  'clients:list',
  () => api<Paginated<ClientListItemDto>>('/clients', {
    query: {
      search: debouncedSearch.value.trim() || undefined,
      status: status.value,
      responsibleId: responsibleId.value === ALL ? undefined : responsibleId.value,
      page: page.value,
      pageSize: PAGE_SIZE
    }
  }),
  { watch: [debouncedSearch, status, responsibleId, page] }
)

const clients = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const hasFilters = computed(() =>
  search.value.trim() !== '' || status.value !== 'active' || responsibleId.value !== ALL
)

function clearFilters() {
  search.value = ''
  status.value = 'active'
  responsibleId.value = ALL
}

// --- Adăugare ---------------------------------------------------------------------------------

const formOpen = ref(false)

async function onCreated(client: ClientDto) {
  await navigateTo(`/clienti/${client.id}`)
}

// Acțiunea rapidă „Adaugă client” de pe pagina principală deschide direct formularul.
onMounted(() => {
  if (route.query.nou !== undefined) {
    formOpen.value = true
    router.replace({ query: {} })
  }
})

function openClient(_event: Event, row: TableRow<ClientListItemDto>) {
  navigateTo(`/clienti/${row.original.id}`)
}

const columns = computed<TableColumn<ClientListItemDto>[]>(() => [
  { id: 'name', header: 'Client' },
  { id: 'contact', header: 'Contact' },
  ...(isAdmin.value ? [{ id: 'responsibles', header: 'Responsabili' }] : []),
  { id: 'employees', header: 'Angajați' },
  { id: 'status', header: 'Status' }
])
</script>

<template>
  <UDashboardPanel id="clients">
    <template #header>
      <UDashboardNavbar title="Clienți">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Adaugă client"
            class="hidden sm:inline-flex"
            @click="formOpen = true"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă client"
            class="sm:hidden"
            @click="formOpen = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Caută după denumire, CUI sau contact"
            aria-label="Caută clienți"
            class="w-full sm:w-80"
          />
          <USelect
            v-model="status"
            :items="statusItems"
            aria-label="Filtrează după status"
            class="w-40 shrink-0"
          />
          <USelect
            v-if="isAdmin"
            v-model="responsibleId"
            :items="responsibleItems"
            aria-label="Filtrează după responsabil"
            class="hidden w-48 shrink-0 md:flex"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-cloud-off"
        title="Clienții nu au putut fi încărcați"
        :description="apiErrorMessage(error.cause ?? error)"
        :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
        variant="naked"
      />

      <div v-else-if="loadStatus === 'pending' && !data" class="space-y-3">
        <USkeleton v-for="index in 6" :key="index" class="h-14 w-full" />
      </div>

      <UEmpty
        v-else-if="clients.length === 0"
        :icon="hasFilters ? 'i-lucide-search-x' : 'i-lucide-building-2'"
        :title="hasFilters ? 'Niciun client găsit' : 'Niciun client încă'"
        :description="hasFilters
          ? 'Niciun client nu corespunde căutării sau filtrelor alese.'
          : isAdmin
            ? 'Adaugă prima companie pentru care firma prestează servicii.'
            : 'Aici apar clienții la care ești responsabil. Poți adăuga un client nou sau cere unui administrator să te adauge la unul existent.'"
        :actions="hasFilters
          ? [{ label: 'Șterge filtrele', color: 'neutral', variant: 'outline', onClick: clearFilters }]
          : [{ label: 'Adaugă client', icon: 'i-lucide-plus', onClick: () => { formOpen = true } }]"
        variant="naked"
      />

      <template v-else>
        <!-- Desktop: tabel -->
        <UTable
          :data="clients"
          :columns="columns"
          :loading="loadStatus === 'pending'"
          class="hidden md:block"
          :ui="{ td: 'align-middle', tr: 'cursor-pointer' }"
          @select="openClient"
        >
          <template #name-cell="{ row }">
            <p class="font-medium text-highlighted">
              {{ row.original.name }}
            </p>
            <p class="text-muted">
              CUI {{ row.original.cui }}
            </p>
          </template>

          <template #contact-cell="{ row }">
            <p>{{ orDash(row.original.contactPerson) }}</p>
            <p v-if="row.original.phone" class="text-muted">
              {{ row.original.phone }}
            </p>
          </template>

          <template #responsibles-cell="{ row }">
            <span v-if="row.original.responsibles.length === 0" class="text-dimmed">Niciunul</span>
            <span v-else>{{ row.original.responsibles.map(user => `${user.firstName} ${user.lastName}`).join(', ') }}</span>
          </template>

          <template #employees-cell="{ row }">
            {{ row.original.employeeCount }}
          </template>

          <template #status-cell="{ row }">
            <StatusBadge :active="row.original.isActive" />
          </template>
        </UTable>

        <!-- Mobil: listă de carduri -->
        <ul class="space-y-3 md:hidden">
          <li v-for="client in clients" :key="client.id">
            <NuxtLink
              :to="`/clienti/${client.id}`"
              class="flex items-center gap-3 rounded-lg border border-default bg-default p-4 active:bg-elevated"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-highlighted">
                  {{ client.name }}
                </p>
                <p class="truncate text-sm text-muted">
                  CUI {{ client.cui }}<template v-if="client.contactPerson">
                    · {{ client.contactPerson }}
                  </template>
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <StatusBadge :active="client.isActive" />
                  <span>{{ countLabel(client.employeeCount, 'angajat', 'angajați') }}</span>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-dimmed" />
            </NuxtLink>
          </li>
        </ul>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            {{ countLabel(total, 'client', 'clienți') }}
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

      <ClientsClientFormModal v-model:open="formOpen" :client="null" @saved="onCreated" />
    </template>
  </UDashboardPanel>
</template>
