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

/**
 * Stadiul modulelor aplicației. Dashboard-ul afișează doar date reale: pe măsură ce modulele
 * sunt livrate, aici apar task-urile restante, activitățile zilei și termenele apropiate.
 */
const modules = [{
  name: 'Conturi și securitate',
  description: 'Autentificare, utilizatori, roluri și jurnal de activitate.',
  icon: 'i-lucide-shield-check',
  available: true
}, {
  name: 'Clienți',
  description: 'Companii, contracte și tarife, servicii, puncte de lucru și numărul de angajați.',
  icon: 'i-lucide-building-2',
  available: true
}, {
  name: 'Task-uri, obligații și calendar',
  description: 'Obligații recurente, termene, responsabili și notificări.',
  icon: 'i-lucide-calendar-check',
  available: true
}, {
  name: 'Documente',
  description: 'Dosare și fișiere pentru fiecare client și pentru firmă. Urmează generarea din template-uri DOCX.',
  icon: 'i-lucide-folder-open',
  available: true
}]
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
            <UButton to="/task-uri?nou=1" icon="i-lucide-plus" label="Creează task" />
            <UButton
              to="/task-uri?nou=deplasare"
              color="neutral"
              variant="outline"
              icon="i-lucide-car"
              label="Programează deplasare"
            />
            <UButton
              to="/clienti?nou=1"
              color="neutral"
              variant="outline"
              icon="i-lucide-building-2"
              label="Adaugă client"
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

        <DashboardTransferRequests @changed="refreshNuxtData(['dashboard:clients-summary', 'dashboard:tasks-overview'])" />

        <DashboardTasksOverview />

        <DashboardClientsSummary />

        <div class="grid gap-6 lg:grid-cols-2">
          <DashboardRecentActivity v-if="isAdmin" />

          <UCard :ui="{ body: 'p-0 sm:p-0' }" :class="isAdmin ? '' : 'lg:col-span-2'">
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Modulele aplicației
              </h2>
              <p class="text-sm text-muted">
                Aplicația este construită în etape. Modulele noi apar aici pe măsură ce sunt livrate.
              </p>
            </template>

            <ul class="divide-y divide-default">
              <li v-for="item in modules" :key="item.name" class="flex items-start gap-3 px-4 py-3 sm:px-6">
                <div
                  class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                  :class="item.available ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
                >
                  <UIcon :name="item.icon" class="size-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-highlighted">
                    {{ item.name }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ item.description }}
                  </p>
                </div>
                <UBadge
                  :color="item.available ? 'success' : 'neutral'"
                  variant="subtle"
                  :label="item.available ? 'Disponibil' : 'În curând'"
                  class="shrink-0"
                />
              </li>
            </ul>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
