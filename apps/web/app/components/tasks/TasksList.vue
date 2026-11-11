<script setup lang="ts">
import type { Paginated, TaskDto, TaskKind } from '@alconst/shared'

/**
 * Lista de task-uri cu căutare, filtre și grupare după urgență.
 * Folosită în pagina „Task-uri” și în pagina unui client (cu `clientId` fix).
 */
const props = defineProps<{
  clientId?: string
  clientName?: string
}>()

const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const PAGE_SIZE = 50
const today = todayLocal()

const search = ref('')
const debouncedSearch = useDebounced(search)
const status = ref<'open' | 'done' | 'cancelled' | 'missing-sheets' | 'all'>('open')
// În pagina unui client se văd task-urile tuturor; în lista generală, implicit cele proprii.
const assignee = ref(props.clientId ? 'all' : 'me')
const page = ref(1)

const statusItems = [
  { label: 'Deschise', value: 'open' },
  { label: 'Finalizate', value: 'done' },
  { label: 'Anulate', value: 'cancelled' },
  { label: 'Deplasări fără fișe', value: 'missing-sheets' },
  { label: 'Toate', value: 'all' }
]

const { data: users } = useUserOptions()
const { user: currentUser } = useAuth()
const assigneeItems = computed(() => [
  { label: 'Ale mele', value: 'me' },
  { label: 'Ale tuturor', value: 'all' },
  { label: 'Fără responsabil', value: 'none' },
  ...users.value
    .filter(option => option.id !== currentUser.value?.id)
    .map(option => ({ label: `${option.firstName} ${option.lastName}`, value: option.id }))
])

watch([debouncedSearch, status, assignee], () => {
  page.value = 1
})

const { data, status: loadStatus, error, refresh } = useLazyAsyncData(
  `tasks:list:${props.clientId ?? 'all'}`,
  () => api<Paginated<TaskDto>>('/tasks', {
    query: {
      search: debouncedSearch.value.trim() || undefined,
      status: status.value,
      assignee: assignee.value === 'all' ? undefined : assignee.value,
      clientId: props.clientId,
      page: page.value,
      pageSize: PAGE_SIZE
    }
  }),
  { watch: [debouncedSearch, status, assignee, page] }
)

const tasks = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
/** Task-urile deschise sunt grupate după urgență; celelalte apar ca listă simplă. */
const groups = computed(() =>
  status.value === 'open'
    ? groupTasks(tasks.value, today).map(entry => ({ key: entry.group as string, label: TASK_GROUP_LABELS[entry.group], tasks: entry.tasks }))
    : [{ key: 'all', label: '', tasks: tasks.value }]
)
const hasFilters = computed(() =>
  search.value.trim() !== '' || status.value !== 'open' || assignee.value !== (props.clientId ? 'all' : 'me')
)

function clearFilters() {
  search.value = ''
  status.value = 'open'
  assignee.value = props.clientId ? 'all' : 'me'
}

// --- Acțiuni ---------------------------------------------------------------------------------

const formOpen = ref(false)
const selected = ref<TaskDto | null>(null)
const createKind = ref<TaskKind>('GENERAL')

function openCreate(kind: TaskKind = 'GENERAL') {
  selected.value = null
  createKind.value = kind
  formOpen.value = true
}

function openTask(task: TaskDto) {
  selected.value = task
  formOpen.value = true
}

/** Deschide un task după ID (ex. dintr-o notificare), chiar dacă nu este în pagina curentă. */
async function openById(id: string) {
  try {
    openTask(await api<TaskDto>(`/tasks/${id}`))
  } catch (error) {
    toast.add({ title: 'Activitatea nu a putut fi deschisă', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function onChanged() {
  await refresh()
  emit('changed')
}

/** Arată deplasările finalizate pentru care fișele nu au fost confirmate (ex. din pagina principală). */
function showMissingSheets() {
  status.value = 'missing-sheets'
  assignee.value = 'all'
}

/** Bifa rapidă: finalizează un task deschis (cu întrebările necesare) sau redeschide unul finalizat. */
const { toggle, busyId, dialogOpen, dialogTask, skipped } = useTaskCompletion(onChanged)

defineExpose({ openCreate, openById, refresh, showMissingSheets })
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Caută după titlu sau client"
        aria-label="Caută în lista de făcut"
        class="w-full sm:w-72"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        aria-label="Filtrează după status"
        class="w-44 shrink-0"
      />
      <USelect
        v-model="assignee"
        :items="assigneeItems"
        aria-label="Filtrează după responsabil"
        class="w-48 shrink-0"
      />
      <UButton
        v-if="clientId"
        icon="i-lucide-plus"
        label="Adaugă activitate"
        class="sm:ml-auto"
        @click="openCreate()"
      />
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Lista nu a putut fi încărcată"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="loadStatus === 'pending' && !data" class="space-y-3">
      <USkeleton v-for="index in 5" :key="index" class="h-16 w-full" />
    </div>

    <UEmpty
      v-else-if="tasks.length === 0"
      :icon="hasFilters ? 'i-lucide-search-x' : 'i-lucide-circle-check-big'"
      :title="status === 'missing-sheets' ? 'Toate fișele sunt confirmate' : hasFilters ? 'Nimic găsit' : 'Nimic de făcut'"
      :description="hasFilters
        ? 'Nimic nu corespunde căutării sau filtrelor alese.'
        : clientId
          ? 'Nu este nimic de făcut pentru acest client. Adaugă o activitate sau una care se repetă.'
          : 'Nu ai nimic de făcut momentan. Aici apar deplasările și activitățile tale, pe măsură ce le vine rândul.'"
      :actions="hasFilters
        ? [{ label: 'Șterge filtrele', color: 'neutral', variant: 'outline', onClick: clearFilters }]
        : [{ label: 'Adaugă activitate', icon: 'i-lucide-plus', onClick: () => openCreate() }]"
      variant="naked"
    />

    <template v-else>
      <div class="space-y-5">
        <section v-for="group in groups" :key="group.key">
          <h3 v-if="group.label" class="mb-2 flex items-center gap-2 text-sm font-semibold" :class="group.key === 'overdue' ? 'text-error' : 'text-highlighted'">
            {{ group.label }}
            <UBadge
              :label="String(group.tasks.length)"
              :color="group.key === 'overdue' ? 'error' : 'neutral'"
              variant="subtle"
              size="sm"
            />
          </h3>
          <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
            <li v-for="task in group.tasks" :key="task.id">
              <TasksTaskRow
                :task="task"
                :today="today"
                :hide-client="Boolean(clientId)"
                :busy="busyId === task.id"
                @open="openTask(task)"
                @toggle="toggle(task)"
              />
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ countLabel(total, 'activitate', 'activități') }}
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

    <TasksCompleteDialog
      v-model:open="dialogOpen"
      :task="dialogTask"
      :skipped="skipped"
      @done="onChanged"
    />
    <TasksTaskFormModal
      v-model:open="formOpen"
      :task="selected"
      :defaults="{ clientId, clientName, kind: createKind }"
      @saved="onChanged"
      @deleted="onChanged"
    />
  </div>
</template>
