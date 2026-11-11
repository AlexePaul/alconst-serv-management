<script setup lang="ts">
useHead({ title: 'De făcut' })

const route = useRoute()
const router = useRouter()
const list = useTemplateRef('list')

// Linkurile din notificări (`?task=<id>`), acțiunile rapide (`?nou=1`, `?nou=deplasare`)
// și avertizarea de pe pagina principală (`?filtru=fise`).
onMounted(() => {
  const { task, nou, filtru } = route.query
  if (typeof task === 'string') list.value?.openById(task)
  else if (nou !== undefined) list.value?.openCreate(nou === 'deplasare' ? 'VISIT' : 'GENERAL')
  if (filtru === 'fise') list.value?.showMissingSheets()
  if (task !== undefined || nou !== undefined || filtru !== undefined) router.replace({ query: {} })
})
</script>

<template>
  <UDashboardPanel id="tasks">
    <template #header>
      <UDashboardNavbar title="De făcut">
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
            label="Adaugă activitate"
            class="hidden sm:inline-flex"
            @click="list?.openCreate()"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă activitate"
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
