<script setup lang="ts">
import type { NotificationDto, Paginated } from '@alconst/shared'

useHead({ title: 'Notificări' })

const api = useApi()
const toast = useToast()
const { refresh: refreshUnread } = useUnreadNotifications()

const PAGE_SIZE = 25
const page = ref(1)
const unreadOnly = ref(false)

watch(unreadOnly, () => {
  page.value = 1
})

const { data, status, error, refresh } = useLazyAsyncData(
  'notifications:list',
  () => api<Paginated<NotificationDto>>('/notifications', {
    query: { page: page.value, pageSize: PAGE_SIZE, unreadOnly: unreadOnly.value || undefined }
  }),
  { watch: [page, unreadOnly] }
)

const notifications = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const hasUnread = computed(() => notifications.value.some(notification => !notification.readAt))

const ICONS: Record<string, string> = {
  TASK_ASSIGNED: 'i-lucide-user-round-check',
  TASK_DUE_SOON: 'i-lucide-calendar-clock',
  TASK_DUE_TODAY: 'i-lucide-calendar-check',
  TASK_OVERDUE: 'i-lucide-triangle-alert'
}

/** Deschide task-ul la care se referă notificarea și o marchează ca citită. */
async function openNotification(notification: NotificationDto) {
  if (!notification.readAt) {
    try {
      await api(`/notifications/${notification.id}/read`, { method: 'POST' })
      refreshUnread()
    } catch {
      // Marcarea ca citită nu trebuie să împiedice deschiderea task-ului.
    }
  }
  if (notification.taskId) await navigateTo({ path: '/task-uri', query: { task: notification.taskId } })
  else await refresh()
}

async function markAllRead() {
  try {
    await api('/notifications/read-all', { method: 'POST' })
    await Promise.all([refresh(), refreshUnread()])
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

onMounted(refreshUnread)
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notificări">
        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-check-check"
            label="Marchează toate ca citite"
            class="hidden sm:inline-flex"
            :disabled="!hasUnread"
            @click="markAllRead"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-check-check"
            aria-label="Marchează toate ca citite"
            class="sm:hidden"
            :disabled="!hasUnread"
            @click="markAllRead"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <USwitch v-model="unreadOnly" label="Doar necitite" />
          <UButton
            to="/cont"
            color="neutral"
            variant="link"
            icon="i-lucide-settings"
            label="Setări notificări"
          />
        </div>

        <UEmpty
          v-if="error"
          icon="i-lucide-cloud-off"
          title="Notificările nu au putut fi încărcate"
          :description="apiErrorMessage(error.cause ?? error)"
          :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
          variant="naked"
        />

        <div v-else-if="status === 'pending' && !data" class="space-y-3">
          <USkeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>

        <UEmpty
          v-else-if="notifications.length === 0"
          icon="i-lucide-bell"
          :title="unreadOnly ? 'Nicio notificare necitită' : 'Nicio notificare'"
          description="Aici apar reamintirile de termen, restanțele și task-urile care îți sunt atribuite."
          variant="naked"
        />

        <template v-else>
          <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
            <li v-for="notification in notifications" :key="notification.id">
              <button
                type="button"
                class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-elevated/40 sm:px-5"
                @click="openNotification(notification)"
              >
                <div
                  class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                  :class="notification.type === 'TASK_OVERDUE' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'"
                >
                  <UIcon :name="ICONS[notification.type] ?? 'i-lucide-bell'" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm" :class="notification.readAt ? 'text-default' : 'font-semibold text-highlighted'">
                    {{ notification.title }}
                  </p>
                  <p v-if="notification.body" class="text-sm text-muted">
                    {{ notification.body }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted" :title="formatDateTime(notification.createdAt)">
                    {{ formatRelative(notification.createdAt) }}
                  </p>
                </div>
                <span v-if="!notification.readAt" class="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Necitită" />
              </button>
            </li>
          </ul>

          <div v-if="total > PAGE_SIZE" class="mt-4 flex justify-end">
            <UPagination
              v-model:page="page"
              :total="total"
              :items-per-page="PAGE_SIZE"
              :sibling-count="1"
            />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
