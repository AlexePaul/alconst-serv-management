<script setup lang="ts">
useHead({ title: 'Task-uri' })

const route = useRoute()
const router = useRouter()
const list = useTemplateRef('list')

// Linkurile din notificări (`?task=<id>`) și acțiunile rapide (`?nou=1`, `?nou=deplasare`).
onMounted(() => {
  const { task, nou } = route.query
  if (typeof task === 'string') list.value?.openById(task)
  else if (nou !== undefined) list.value?.openCreate(nou === 'deplasare' ? 'VISIT' : 'GENERAL')
  if (task !== undefined || nou !== undefined) router.replace({ query: {} })
})
</script>

<template>
  <UDashboardPanel id="tasks">
    <template #header>
      <UDashboardNavbar title="Task-uri">
        <template #right>
          <UButton
            to="/calendar"
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar-days"
            label="Calendar"
            class="hidden sm:inline-flex"
          />
          <UButton
            icon="i-lucide-plus"
            label="Creează task"
            class="hidden sm:inline-flex"
            @click="list?.openCreate()"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Creează task"
            class="sm:hidden"
            @click="list?.openCreate()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <TasksList ref="list" />
      </div>
    </template>
  </UDashboardPanel>
</template>
