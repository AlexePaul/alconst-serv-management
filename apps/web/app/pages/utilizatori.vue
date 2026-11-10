<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { UserDto } from '@alconst/shared'

definePageMeta({ adminOnly: true })
useHead({ title: 'Utilizatori' })

const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const { user: currentUser } = useAuth()

const { data: users, status, error, refresh } = useLazyAsyncData('users', () => api<UserDto[]>('/users'))

// --- Căutare și filtrare -------------------------------------------------------------------

const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const statusItems = [
  { label: 'Toți utilizatorii', value: 'all' },
  { label: 'Activi', value: 'active' },
  { label: 'Dezactivați', value: 'inactive' }
]

/** Căutarea ignoră majusculele și diacriticele („stefan” găsește „Ștefan”). */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const filteredUsers = computed(() => {
  const term = normalize(search.value.trim())
  return (users.value ?? []).filter((user) => {
    if (statusFilter.value === 'active' && !user.isActive) return false
    if (statusFilter.value === 'inactive' && user.isActive) return false
    if (!term) return true
    return normalize(`${user.firstName} ${user.lastName} ${user.email}`).includes(term)
  })
})

const hasFilters = computed(() => search.value.trim() !== '' || statusFilter.value !== 'all')

function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}

// --- Acțiuni ---------------------------------------------------------------------------------

const formOpen = ref(false)
const resetOpen = ref(false)
const statusOpen = ref(false)
const selected = ref<UserDto | null>(null)
const statusLoading = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(user: UserDto) {
  selected.value = user
  formOpen.value = true
}

function openReset(user: UserDto) {
  selected.value = user
  resetOpen.value = true
}

function openStatus(user: UserDto) {
  selected.value = user
  statusOpen.value = true
}

/** Actualizează lista locală după o modificare, fără a reîncărca toată pagina. */
function onSaved(saved: UserDto) {
  const list = users.value ?? []
  const index = list.findIndex(user => user.id === saved.id)
  users.value = index === -1 ? [...list, saved] : list.map(user => (user.id === saved.id ? saved : user))
}

async function toggleStatus() {
  const user = selected.value
  if (!user) return
  statusLoading.value = true
  try {
    const updated = await api<UserDto>(`/users/${user.id}`, { method: 'PATCH', body: { isActive: !user.isActive } })
    onSaved(updated)
    toast.add({
      title: updated.isActive ? 'Contul a fost activat' : 'Contul a fost dezactivat',
      description: `${updated.firstName} ${updated.lastName}`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    statusOpen.value = false
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    statusLoading.value = false
  }
}

function rowActions(user: UserDto): DropdownMenuItem[][] {
  const isSelf = user.id === currentUser.value?.id
  const items: DropdownMenuItem[][] = [[
    { label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(user) }
  ]]
  if (!isSelf) {
    items[0]?.push({ label: 'Resetează parola', icon: 'i-lucide-key-round', onSelect: () => openReset(user) })
    items.push([user.isActive
      ? { label: 'Dezactivează contul', icon: 'i-lucide-user-x', color: 'error', onSelect: () => openStatus(user) }
      : { label: 'Activează contul', icon: 'i-lucide-user-check', onSelect: () => openStatus(user) }
    ])
  }
  return items
}

// Acțiunea rapidă „Adaugă utilizator” de pe pagina principală deschide direct formularul.
onMounted(() => {
  if (route.query.nou !== undefined) {
    openCreate()
    router.replace({ query: {} })
  }
})

const columns: TableColumn<UserDto>[] = [
  { id: 'name', header: 'Utilizator' },
  { id: 'role', header: 'Rol' },
  { id: 'status', header: 'Status' },
  { id: 'lastLogin', header: 'Ultima autentificare' },
  { id: 'actions', header: '', meta: { class: { td: 'w-0 text-right' } } }
]
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Utilizatori">
        <template #right>
          <UButton
            icon="i-lucide-user-plus"
            label="Adaugă utilizator"
            class="hidden sm:inline-flex"
            @click="openCreate"
          />
          <UButton
            icon="i-lucide-user-plus"
            aria-label="Adaugă utilizator"
            class="sm:hidden"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Caută după nume sau email"
            aria-label="Caută utilizatori"
            class="w-full sm:w-72"
          />
          <USelect
            v-model="statusFilter"
            :items="statusItems"
            aria-label="Filtrează după status"
            class="w-44 shrink-0"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-cloud-off"
        title="Utilizatorii nu au putut fi încărcați"
        :description="apiErrorMessage(error.cause ?? error)"
        :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
        variant="naked"
      />

      <div v-else-if="status === 'pending' && !users" class="space-y-3">
        <USkeleton v-for="index in 4" :key="index" class="h-14 w-full" />
      </div>

      <UEmpty
        v-else-if="filteredUsers.length === 0"
        icon="i-lucide-search-x"
        title="Niciun utilizator găsit"
        :description="hasFilters ? 'Niciun utilizator nu corespunde căutării sau filtrului ales.' : 'Adaugă primul utilizator pentru a începe.'"
        :actions="hasFilters
          ? [{ label: 'Șterge filtrele', color: 'neutral', variant: 'outline', onClick: clearFilters }]
          : [{ label: 'Adaugă utilizator', icon: 'i-lucide-user-plus', onClick: openCreate }]"
        variant="naked"
      />

      <template v-else>
        <!-- Desktop: tabel -->
        <UTable
          :data="filteredUsers"
          :columns="columns"
          class="hidden md:block"
          :ui="{ td: 'align-middle' }"
        >
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :text="initials(row.original.firstName, row.original.lastName)" size="md" />
              <div class="min-w-0">
                <p class="font-medium text-highlighted">
                  {{ row.original.firstName }} {{ row.original.lastName }}
                  <span v-if="row.original.id === currentUser?.id" class="font-normal text-muted">(tu)</span>
                </p>
                <p class="text-muted">
                  {{ row.original.email }}
                </p>
              </div>
            </div>
          </template>

          <template #role-cell="{ row }">
            <UBadge
              :label="USER_ROLE_LABELS[row.original.role]"
              :color="row.original.role === 'ADMIN' ? 'primary' : 'neutral'"
              variant="subtle"
            />
          </template>

          <template #status-cell="{ row }">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                :label="row.original.isActive ? 'Activ' : 'Dezactivat'"
                :color="row.original.isActive ? 'success' : 'neutral'"
                variant="subtle"
              />
              <UBadge
                v-if="row.original.mustChangePassword && row.original.isActive"
                label="Parolă temporară"
                color="warning"
                variant="subtle"
              />
            </div>
          </template>

          <template #lastLogin-cell="{ row }">
            <span v-if="row.original.lastLoginAt" :title="formatDateTime(row.original.lastLoginAt)">
              {{ formatRelative(row.original.lastLoginAt) }}
            </span>
            <span v-else class="text-dimmed">Niciodată</span>
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
            v-for="user in filteredUsers"
            :key="user.id"
            class="flex items-start gap-3 rounded-lg border border-default bg-default p-4"
          >
            <UAvatar :text="initials(user.firstName, user.lastName)" size="md" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ user.firstName }} {{ user.lastName }}
                <span v-if="user.id === currentUser?.id" class="font-normal text-muted">(tu)</span>
              </p>
              <p class="truncate text-sm text-muted">
                {{ user.email }}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <UBadge
                  :label="USER_ROLE_LABELS[user.role]"
                  :color="user.role === 'ADMIN' ? 'primary' : 'neutral'"
                  variant="subtle"
                />
                <UBadge
                  :label="user.isActive ? 'Activ' : 'Dezactivat'"
                  :color="user.isActive ? 'success' : 'neutral'"
                  variant="subtle"
                />
                <UBadge
                  v-if="user.mustChangePassword && user.isActive"
                  label="Parolă temporară"
                  color="warning"
                  variant="subtle"
                />
              </div>
              <p class="mt-2 text-xs text-muted">
                Ultima autentificare:
                {{ user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'niciodată' }}
              </p>
            </div>
            <UDropdownMenu :items="rowActions(user)" :content="{ align: 'end' }">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis-vertical"
                :aria-label="`Acțiuni pentru ${user.firstName} ${user.lastName}`"
              />
            </UDropdownMenu>
          </li>
        </ul>
      </template>

      <UsersUserFormModal v-model:open="formOpen" :user="selected" @saved="onSaved" />
      <UsersResetPasswordModal v-model:open="resetOpen" :user="selected" @saved="onSaved" />
      <ConfirmDialog
        v-model:open="statusOpen"
        :title="selected?.isActive ? 'Dezactivezi contul?' : 'Activezi contul?'"
        :description="selected?.isActive
          ? `${selected.firstName} ${selected.lastName} nu se va mai putea autentifica și va fi deconectat imediat de pe toate dispozitivele. Contul poate fi reactivat oricând.`
          : `${selected?.firstName} ${selected?.lastName} se va putea autentifica din nou în aplicație.`"
        :confirm-label="selected?.isActive ? 'Dezactivează contul' : 'Activează contul'"
        :color="selected?.isActive ? 'error' : 'primary'"
        :loading="statusLoading"
        @confirm="toggleStatus"
      />
    </template>
  </UDashboardPanel>
</template>
