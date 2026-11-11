<script setup lang="ts">
import type { TaskHistoryEntryDto } from '@alconst/shared'
import { ACTIVITY_ACTION_LABELS } from '@alconst/shared'

/** Istoricul modificărilor unui task: cine, ce și când a schimbat. */
const props = defineProps<{ taskId: string }>()

const api = useApi()
const { data, status, error } = useLazyAsyncData(
  () => `task:history:${props.taskId}`,
  () => api<TaskHistoryEntryDto[]>(`/tasks/${props.taskId}/history`),
  { default: () => [] }
)

const VALUE_LABELS = {
  status: TASK_STATUS_LABELS as Record<string, string>,
  priority: TASK_PRIORITY_LABELS as Record<string, string>,
  kind: TASK_KIND_LABELS as Record<string, string>,
  sheets: { YES: 'da', NO: 'nu' }
}

function summary(entry: TaskHistoryEntryDto): string {
  if (entry.action === 'task.created') return 'a adăugat activitatea'
  if (entry.changes.length === 0) {
    return (ACTIVITY_ACTION_LABELS as Record<string, string>)[entry.action]?.toLowerCase() ?? 'a modificat activitatea'
  }
  return `a modificat ${entry.changes.map(change => describeHistoryChange(change, VALUE_LABELS)).join('; ')}`
}
</script>

<template>
  <div>
    <div v-if="status === 'pending' && !data.length" class="space-y-2">
      <USkeleton v-for="index in 2" :key="index" class="h-8 w-full" />
    </div>
    <p v-else-if="error" class="text-sm text-muted">
      Istoricul nu a putut fi încărcat.
    </p>
    <ol v-else class="space-y-3">
      <li v-for="entry in data" :key="entry.id" class="flex gap-3 text-sm">
        <span class="mt-1.5 size-2 shrink-0 rounded-full bg-accented" />
        <div class="min-w-0">
          <p class="text-default">
            <span class="font-medium text-highlighted">{{ entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Sistem' }}</span>
            {{ summary(entry) }}
          </p>
          <p class="text-xs text-muted">
            {{ formatDateTime(entry.createdAt) }}
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>
