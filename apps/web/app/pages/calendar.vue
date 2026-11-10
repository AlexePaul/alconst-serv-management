<script setup lang="ts">
import type { Paginated, TaskDto } from '@alconst/shared'
import { addDays, addMonths, diffDays, endOfMonth, isOpenTask, startOfMonth, startOfWeek } from '@alconst/shared'

useHead({ title: 'Calendar' })

const api = useApi()
const toast = useToast()

type View = 'month' | 'week' | 'day'

const today = todayLocal()
const view = ref<View>('month')
/** Ziua de referință: luna/săptămâna afișată o conține, iar pe mobil este ziua selectată. */
const cursor = ref(today)
const scope = ref<'me' | 'all'>('me')

const viewItems = [
  { label: 'Lună', value: 'month' },
  { label: 'Săptămână', value: 'week' },
  { label: 'Zi', value: 'day' }
]
const scopeItems = [
  { label: 'Task-urile mele', value: 'me' },
  { label: 'Ale tuturor', value: 'all' }
]
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']

const range = computed(() => {
  if (view.value === 'month') {
    return { from: startOfWeek(startOfMonth(cursor.value)), to: addDays(startOfWeek(endOfMonth(cursor.value)), 6) }
  }
  if (view.value === 'week') {
    const from = startOfWeek(cursor.value)
    return { from, to: addDays(from, 6) }
  }
  return { from: cursor.value, to: cursor.value }
})

const days = computed(() => {
  const count = diffDays(range.value.from, range.value.to) + 1
  return Array.from({ length: count }, (_, index) => addDays(range.value.from, index))
})

const { data, status, error, refresh } = useLazyAsyncData(
  'calendar:tasks',
  () => api<Paginated<TaskDto>>('/tasks', {
    query: {
      status: 'all',
      from: range.value.from,
      to: range.value.to,
      assignee: scope.value === 'me' ? 'me' : undefined,
      pageSize: 500
    }
  }),
  { watch: [range, scope] }
)

/** Task-urile pe zile; cele anulate nu apar în calendar. */
const tasksByDay = computed(() => {
  const map = new Map<string, TaskDto[]>()
  for (const task of data.value?.items ?? []) {
    if (task.status === 'CANCELLED') continue
    const list = map.get(task.dueDate) ?? []
    list.push(task)
    map.set(task.dueDate, list)
  }
  return map
})
const tasksOn = (day: string) => tasksByDay.value.get(day) ?? []
const truncated = computed(() => (data.value?.total ?? 0) > (data.value?.items.length ?? 0))

// --- Navigare ---------------------------------------------------------------------------------

const monthFormat = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' })
const asDate = (day: string) => new Date(`${day}T00:00:00`)

const title = computed(() => {
  if (view.value === 'month') return monthFormat.format(asDate(cursor.value))
  if (view.value === 'day') return dayFormat.format(asDate(cursor.value))
  return `${shortFormat.format(asDate(range.value.from))} – ${formatDate(range.value.to)}`
})

function move(direction: 1 | -1) {
  if (view.value === 'month') cursor.value = addMonths(startOfMonth(cursor.value), direction)
  else cursor.value = addDays(cursor.value, direction * (view.value === 'week' ? 7 : 1))
}

function goToday() {
  cursor.value = today
}

function openDay(day: string) {
  cursor.value = day
  view.value = 'day'
}

const dayNumber = (day: string) => Number(day.slice(8))
const inCurrentMonth = (day: string) => day.slice(0, 7) === cursor.value.slice(0, 7)

function chipClass(task: TaskDto): string {
  if (task.status === 'DONE') return 'border-l-success bg-elevated/60 text-muted line-through'
  if (task.dueDate < today) return 'border-l-error bg-error/10 text-error'
  if (task.kind === 'VISIT') return 'border-l-primary bg-primary/10 text-highlighted'
  return 'border-l-accented bg-elevated text-highlighted'
}

// --- Acțiuni ---------------------------------------------------------------------------------

const formOpen = ref(false)
const selected = ref<TaskDto | null>(null)
const createDate = ref(today)
const busyId = ref<string | null>(null)

function openTask(task: TaskDto) {
  selected.value = task
  formOpen.value = true
}

function openCreate(day: string) {
  selected.value = null
  createDate.value = day
  formOpen.value = true
}

async function toggle(task: TaskDto) {
  busyId.value = task.id
  try {
    await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: isOpenTask(task.status) ? 'DONE' : 'TODO' } })
    await refresh()
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="calendar">
    <template #header>
      <UDashboardNavbar title="Calendar">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Creează task"
            class="hidden sm:inline-flex"
            @click="openCreate(cursor)"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Creează task"
            class="sm:hidden"
            @click="openCreate(cursor)"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-chevron-left"
            aria-label="Înapoi"
            @click="move(-1)"
          />
          <UButton
            color="neutral"
            variant="outline"
            label="Azi"
            @click="goToday"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-chevron-right"
            aria-label="Înainte"
            @click="move(1)"
          />
          <h2 class="ml-2 hidden truncate text-base font-semibold text-highlighted first-letter:uppercase sm:block">
            {{ title }}
          </h2>
        </template>
        <template #right>
          <USelect
            v-model="scope"
            :items="scopeItems"
            aria-label="Ale cui task-uri"
            class="hidden w-44 md:flex"
          />
          <USelect
            v-model="view"
            :items="viewItems"
            aria-label="Tipul de vizualizare"
            class="w-32"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div class="flex items-center justify-between gap-3 sm:hidden">
          <h2 class="truncate text-base font-semibold text-highlighted first-letter:uppercase">
            {{ title }}
          </h2>
          <USelect
            v-model="scope"
            :items="scopeItems"
            aria-label="Ale cui task-uri"
            class="w-40 shrink-0"
          />
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-cloud-off"
          title="Calendarul nu a putut fi încărcat"
          :description="apiErrorMessage(error.cause ?? error)"
          :actions="[{ label: 'Încearcă din nou', color: 'error', variant: 'outline', onClick: () => { refresh() } }]"
        />
        <UAlert
          v-if="truncated"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          description="Sunt prea multe task-uri în acest interval pentru a fi afișate toate. Alege o perioadă mai scurtă sau filtrează după responsabil."
        />

        <!-- Lună -->
        <template v-if="view === 'month'">
          <div class="overflow-hidden rounded-lg border border-default bg-default" :class="status === 'pending' ? 'opacity-70' : ''">
            <div class="grid grid-cols-7 border-b border-default bg-elevated/50 text-center text-xs font-medium text-muted">
              <div v-for="weekday in WEEKDAYS" :key="weekday" class="py-2">
                {{ weekday }}
              </div>
            </div>
            <div class="grid grid-cols-7">
              <div
                v-for="day in days"
                :key="day"
                class="group relative min-h-14 border-b border-r border-default p-1 [&:nth-child(7n)]:border-r-0 md:min-h-28 md:p-1.5"
                :class="[inCurrentMonth(day) ? '' : 'bg-elevated/30', day === cursor ? 'max-md:bg-primary/5' : '']"
              >
                <div class="flex items-center justify-between">
                  <button
                    type="button"
                    class="flex size-7 items-center justify-center rounded-full text-sm"
                    :class="day === today
                      ? 'bg-primary font-semibold text-inverted'
                      : inCurrentMonth(day) ? 'text-highlighted hover:bg-elevated' : 'text-dimmed hover:bg-elevated'"
                    :aria-label="`Deschide ziua ${formatDate(day)}`"
                    @click="openDay(day)"
                  >
                    {{ dayNumber(day) }}
                  </button>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-plus"
                    :aria-label="`Creează task pe ${formatDate(day)}`"
                    class="hidden opacity-0 group-hover:opacity-100 focus:opacity-100 md:inline-flex"
                    @click="openCreate(day)"
                  />
                </div>

                <!-- Desktop: primele task-uri ale zilei -->
                <div class="mt-1 hidden space-y-1 md:block">
                  <button
                    v-for="task in tasksOn(day).slice(0, 3)"
                    :key="task.id"
                    type="button"
                    class="block w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-xs"
                    :class="chipClass(task)"
                    :title="task.client ? `${task.title} · ${task.client.name}` : task.title"
                    @click="openTask(task)"
                  >
                    {{ task.title }}
                  </button>
                  <button
                    v-if="tasksOn(day).length > 3"
                    type="button"
                    class="block w-full px-1.5 text-left text-xs text-muted hover:text-highlighted"
                    @click="openDay(day)"
                  >
                    încă {{ tasksOn(day).length - 3 }}
                  </button>
                </div>

                <!-- Mobil: doar un indicator; lista zilei selectate apare sub calendar -->
                <button
                  type="button"
                  class="absolute inset-0 md:hidden"
                  :aria-label="`Selectează ziua ${formatDate(day)}`"
                  @click="cursor = day"
                />
                <div v-if="tasksOn(day).length" class="mt-1 flex justify-center gap-0.5 md:hidden">
                  <span
                    v-for="task in tasksOn(day).slice(0, 3)"
                    :key="task.id"
                    class="size-1.5 rounded-full"
                    :class="task.status === 'DONE' ? 'bg-success' : task.dueDate < today ? 'bg-error' : 'bg-primary'"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Mobil: task-urile zilei selectate -->
          <section class="md:hidden">
            <div class="mb-2 flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-highlighted first-letter:uppercase">
                {{ dayFormat.format(asDate(cursor)) }}
              </h3>
              <UButton
                size="sm"
                variant="soft"
                icon="i-lucide-plus"
                label="Task"
                @click="openCreate(cursor)"
              />
            </div>
            <ul v-if="tasksOn(cursor).length" class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
              <li v-for="task in tasksOn(cursor)" :key="task.id">
                <TasksTaskRow
                  :task="task"
                  :today="today"
                  :busy="busyId === task.id"
                  @open="openTask(task)"
                  @toggle="toggle(task)"
                />
              </li>
            </ul>
            <p v-else class="rounded-lg border border-dashed border-default px-4 py-6 text-center text-sm text-muted">
              Niciun task în această zi.
            </p>
          </section>
        </template>

        <!-- Săptămână -->
        <div v-else-if="view === 'week'" class="grid gap-3 md:grid-cols-7 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-default md:bg-default" :class="status === 'pending' ? 'opacity-70' : ''">
          <div
            v-for="(day, index) in days"
            :key="day"
            class="rounded-lg border border-default bg-default md:min-h-96 md:rounded-none md:border-0 md:border-r md:last:border-r-0"
          >
            <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2" :class="day === today ? 'bg-primary/5' : 'bg-elevated/40'">
              <button type="button" class="text-left text-sm" @click="openDay(day)">
                <span class="font-medium" :class="day === today ? 'text-primary' : 'text-highlighted'">{{ WEEKDAYS[index] }} {{ dayNumber(day) }}</span>
                <span v-if="day === today" class="ml-1 text-xs text-primary">azi</span>
              </button>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-plus"
                :aria-label="`Creează task pe ${formatDate(day)}`"
                @click="openCreate(day)"
              />
            </div>
            <div class="space-y-1.5 p-2">
              <button
                v-for="task in tasksOn(day)"
                :key="task.id"
                type="button"
                class="block w-full rounded border-l-2 px-2 py-1 text-left text-xs"
                :class="chipClass(task)"
                @click="openTask(task)"
              >
                <span class="block font-medium">{{ task.title }}</span>
                <span v-if="task.client" class="block truncate opacity-80">{{ task.client.name }}</span>
              </button>
              <p v-if="!tasksOn(day).length" class="px-1 py-1 text-xs text-dimmed">
                —
              </p>
            </div>
          </div>
        </div>

        <!-- Zi -->
        <template v-else>
          <ul v-if="tasksOn(cursor).length" class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
            <li v-for="task in tasksOn(cursor)" :key="task.id">
              <TasksTaskRow
                :task="task"
                :today="today"
                :busy="busyId === task.id"
                @open="openTask(task)"
                @toggle="toggle(task)"
              />
            </li>
          </ul>
          <UEmpty
            v-else-if="status !== 'pending'"
            icon="i-lucide-calendar-check"
            title="Niciun task în această zi"
            :actions="[{ label: 'Creează task', icon: 'i-lucide-plus', onClick: () => openCreate(cursor) }]"
            variant="naked"
          />
        </template>
      </div>

      <TasksTaskFormModal
        v-model:open="formOpen"
        :task="selected"
        :defaults="{ dueDate: createDate }"
        @saved="refresh()"
        @deleted="refresh()"
      />
    </template>
  </UDashboardPanel>
</template>
