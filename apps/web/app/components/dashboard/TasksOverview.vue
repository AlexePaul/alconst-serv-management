<script setup lang="ts">
import type { TaskDto, TasksOverviewDto } from '@alconst/shared'

/** Ce are nevoie de atenție: restanțe, termene de azi și din următoarele 7 zile. */
const api = useApi()

const scope = ref<'mine' | 'all'>('mine')
const scopeItems = [
  { label: 'Task-urile mele', value: 'mine' },
  { label: 'Ale tuturor', value: 'all' }
]

const { data, status, error, refresh } = useLazyAsyncData(
  'dashboard:tasks-overview',
  () => api<TasksOverviewDto>('/tasks/overview', { query: { scope: scope.value } }),
  { watch: [scope] }
)

const today = computed(() => data.value?.today ?? todayLocal())

const sections = computed(() => [
  {
    key: 'overdue',
    title: 'Restante',
    icon: 'i-lucide-triangle-alert',
    tone: 'text-error',
    tasks: data.value?.overdue ?? [],
    count: data.value?.counts.overdue ?? 0,
    empty: 'Nicio restanță.'
  },
  {
    key: 'pending',
    title: 'Încă în termen',
    icon: 'i-lucide-hourglass',
    tone: 'text-warning',
    tasks: data.value?.inPeriod ?? [],
    count: data.value?.counts.inPeriod ?? 0,
    empty: 'Nimic rămas din perioada curentă.'
  },
  {
    key: 'today',
    title: 'Azi',
    icon: 'i-lucide-calendar-check',
    tone: 'text-warning',
    tasks: data.value?.dueToday ?? [],
    count: data.value?.counts.dueToday ?? 0,
    empty: 'Nimic programat pentru azi.'
  },
  {
    key: 'upcoming',
    title: 'Următoarele 7 zile',
    icon: 'i-lucide-calendar-clock',
    tone: 'text-primary',
    tasks: data.value?.upcoming ?? [],
    count: data.value?.counts.upcoming ?? 0,
    empty: 'Niciun termen în următoarele 7 zile.'
  }
])

const formOpen = ref(false)
const selected = ref<TaskDto | null>(null)

function openTask(task: TaskDto) {
  selected.value = task
  formOpen.value = true
}

const { toggle: complete, busyId, dialogOpen, dialogTask, skipped } = useTaskCompletion(() => refresh())
</script>

<template>
  <section aria-labelledby="tasks-overview">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="tasks-overview" class="text-base font-semibold text-highlighted">
        De făcut
      </h2>
      <div class="flex items-center gap-2">
        <USelect
          v-model="scope"
          :items="scopeItems"
          aria-label="Ale cui task-uri"
          size="sm"
          class="w-40"
        />
        <UButton
          to="/task-uri"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
          label="Toate"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-cloud-off"
      title="Task-urile nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', color: 'error', variant: 'outline', onClick: () => { refresh() } }]"
    />

    <div v-else class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      <UCard v-for="section in sections" :key="section.key" :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon :name="section.icon" class="size-4" :class="section.tone" />
            <h3 class="text-sm font-semibold text-highlighted">
              {{ section.title }}
            </h3>
            <UBadge
              v-if="section.count > 0"
              :label="String(section.count)"
              :color="section.key === 'overdue' ? 'error' : 'neutral'"
              variant="subtle"
              size="sm"
              class="ml-auto"
            />
          </div>
        </template>

        <div v-if="status === 'pending' && !data" class="space-y-3 p-4">
          <USkeleton v-for="index in 2" :key="index" class="h-10 w-full" />
        </div>
        <p v-else-if="section.tasks.length === 0" class="px-4 py-6 text-center text-sm text-muted">
          {{ section.empty }}
        </p>
        <template v-else>
          <ul class="divide-y divide-default">
            <li v-for="task in section.tasks.slice(0, 6)" :key="task.id" class="flex items-start gap-2.5 px-4 py-2.5">
              <button
                type="button"
                class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-accented text-transparent transition-colors hover:border-success hover:text-success"
                :disabled="busyId === task.id"
                :aria-label="`Marchează „${task.title}” ca finalizat`"
                @click="complete(task)"
              >
                <UIcon name="i-lucide-check" class="size-3.5" />
              </button>
              <button type="button" class="min-w-0 flex-1 text-left" @click="openTask(task)">
                <p class="truncate text-sm font-medium text-highlighted">
                  <UIcon v-if="task.kind === 'VISIT'" :name="TASK_KIND_ICONS.VISIT" class="mr-1 inline size-3.5 align-[-2px] text-primary" />{{ task.title }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ [formatTimeRange(task.startTime, task.endTime), task.client?.name, section.key === 'today' ? null : taskDueInfo(task, today).label, scope === 'all' && task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : null].filter(Boolean).join(' · ') || 'Fără client' }}
                </p>
              </button>
            </li>
          </ul>
          <p v-if="section.count > 6" class="border-t border-default px-4 py-2 text-xs text-muted">
            și încă {{ section.count - 6 }}
          </p>
        </template>
      </UCard>
    </div>

    <UAlert
      v-if="data && data.visitsMissingSheets > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-clipboard-x"
      :title="countLabel(data.visitsMissingSheets, 'deplasare finalizată fără fișe confirmate', 'deplasări finalizate fără fișe confirmate')"
      :actions="[{ label: 'Vezi lista', to: '/task-uri?filtru=fise', color: 'warning', variant: 'outline' }]"
      class="mt-4"
    />

    <TasksCompleteDialog
      v-model:open="dialogOpen"
      :task="dialogTask"
      :skipped="skipped"
      @done="refresh()"
    />
    <TasksTaskFormModal
      v-model:open="formOpen"
      :task="selected"
      @saved="refresh()"
      @deleted="refresh()"
    />
  </section>
</template>
