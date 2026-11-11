<script setup lang="ts">
useHead({ title: 'Acasă' })

const { user, isAdmin } = useAuth()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return 'Bună dimineața'
  if (hour < 18) return 'Bună ziua'
  return 'Bună seara'
})

const today = formatLongDate(new Date())
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Acasă" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6">
        <header>
          <h1 class="text-2xl font-semibold text-highlighted">
            {{ greeting }}, {{ user?.firstName }}
          </h1>
          <p class="mt-1 text-sm text-muted first-letter:uppercase">
            {{ today }}
          </p>
        </header>

        <section aria-labelledby="quick-actions">
          <h2 id="quick-actions" class="sr-only">
            Acțiuni rapide
          </h2>
          <div class="flex flex-wrap gap-2">
            <UButton to="/clienti?nou=1" icon="i-lucide-building-2" label="Adaugă client" />
            <UButton
              to="/task-uri?nou=1"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              label="Adaugă ceva de făcut"
            />
            <UButton
              v-if="isAdmin"
              to="/utilizatori?nou=1"
              color="neutral"
              variant="outline"
              icon="i-lucide-user-cog"
              label="Adaugă utilizator"
            />
          </div>
        </section>

        <DashboardSystemStatus v-if="isAdmin" />

        <DashboardTransferRequests @changed="refreshNuxtData(['dashboard:clients-summary', 'dashboard:tasks-overview'])" />

        <DashboardTasksOverview />

        <DashboardClientsSummary />

        <DashboardRecentActivity v-if="isAdmin" />

        <p class="text-center text-sm text-muted">
          Nu știi de unde să începi?
          <NuxtLink to="/ajutor" class="font-medium text-primary hover:underline">Vezi cum se folosește aplicația</NuxtLink>
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
