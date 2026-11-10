<script setup lang="ts">
import type { TaskDto } from '@alconst/shared'
import { isOpenTask } from '@alconst/shared'

/** Un task într-o listă: bifă rapidă de finalizare, titlu, client, responsabil și termen. */
const props = defineProps<{
  task: TaskDto
  today: string
  /** Ascunde numele clientului (în pagina unui client este redundant). */
  hideClient?: boolean
  busy?: boolean
}>()

defineEmits<{ open: [], toggle: [] }>()

const open = computed(() => isOpenTask(props.task.status))
const due = computed(() => taskDueInfo(props.task, props.today))
const timeRange = computed(() => formatTimeRange(props.task.startTime, props.task.endTime))
</script>

<template>
  <div class="flex items-start gap-3 px-4 py-3 sm:px-5">
    <button
      type="button"
      class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors"
      :class="task.status === 'DONE'
        ? 'border-success bg-success text-inverted'
        : task.status === 'CANCELLED'
          ? 'border-default bg-elevated text-dimmed'
          : 'border-accented text-transparent hover:border-success hover:text-success'"
      :disabled="busy || task.status === 'CANCELLED'"
      :aria-label="open ? `Marchează „${task.title}” ca finalizat` : `Redeschide „${task.title}”`"
      @click="$emit('toggle')"
    >
      <UIcon :name="task.status === 'CANCELLED' ? 'i-lucide-x' : 'i-lucide-check'" class="size-4" />
    </button>

    <button type="button" class="min-w-0 flex-1 text-left" @click="$emit('open')">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="font-medium" :class="open ? 'text-highlighted' : 'text-muted line-through'">{{ task.title }}</span>
        <UBadge
          v-if="task.kind === 'VISIT'"
          :label="TASK_KIND_LABELS.VISIT"
          :icon="TASK_KIND_ICONS.VISIT"
          color="primary"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="task.priority === 'HIGH' && open"
          label="Prioritate ridicată"
          color="error"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="task.status === 'IN_PROGRESS'"
          :label="TASK_STATUS_LABELS.IN_PROGRESS"
          color="info"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="task.isCover"
          label="Înlocuire"
          icon="i-lucide-arrow-left-right"
          color="warning"
          variant="subtle"
          size="sm"
          title="Responsabilul acestui task nu este responsabilul clientului"
        />
        <UBadge
          v-if="task.kind === 'VISIT' && task.status === 'DONE'"
          :label="task.sheetsCompleted ? 'Fișe completate' : 'Fișe neconfirmate'"
          :icon="task.sheetsCompleted ? 'i-lucide-clipboard-check' : 'i-lucide-clipboard-x'"
          :color="task.sheetsCompleted ? 'success' : 'warning'"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="task.status === 'CANCELLED'"
          :label="TASK_STATUS_LABELS.CANCELLED"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
        <span v-if="timeRange" class="inline-flex items-center gap-1 font-medium text-default">
          <UIcon name="i-lucide-clock" class="size-3.5" />{{ timeRange }}
        </span>
        <span v-if="task.client && !hideClient" class="inline-flex max-w-full min-w-0 items-center gap-1">
          <UIcon name="i-lucide-building-2" class="size-3.5 shrink-0" /><span class="truncate">{{ task.client.name }}</span>
        </span>
        <span v-if="task.location" class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-map-pin" class="size-3.5" />{{ task.location.name }}
        </span>
        <span class="inline-flex items-center gap-1">
          <UIcon name="i-lucide-user-round" class="size-3.5" />{{ task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Fără responsabil' }}
        </span>
        <span v-if="task.obligation" class="inline-flex items-center gap-1" title="Generat dintr-o obligație recurentă">
          <UIcon name="i-lucide-repeat" class="size-3.5" />Recurent
        </span>
      </p>
    </button>

    <UBadge
      :label="due.label"
      :color="due.color"
      :variant="due.overdue ? 'solid' : 'subtle'"
      class="mt-0.5 shrink-0"
    />
  </div>
</template>
