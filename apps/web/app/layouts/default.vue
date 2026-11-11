<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isAdmin } = useAuth()
const route = useRoute()
const { count: unread, startPolling } = useUnreadNotifications()

startPolling()

const open = ref(false)

function close() {
  open.value = false
}

/** Modulele care urmează să fie livrate apar în meniu, dar dezactivate. */

const unreadBadge = computed(() =>
  unread.value > 0 ? { label: unread.value > 99 ? '99+' : String(unread.value), color: 'error', variant: 'solid', size: 'sm' } as const : undefined
)

const mainItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Acasă', icon: 'i-lucide-layout-dashboard', to: '/', exact: true, onSelect: close },
  { label: 'De făcut', icon: 'i-lucide-list-checks', to: '/task-uri', onSelect: close },
  { label: 'Calendar', icon: 'i-lucide-calendar-days', to: '/calendar', onSelect: close },
  { label: 'Recurente', icon: 'i-lucide-repeat', to: '/obligatii', onSelect: close },
  { label: 'Clienți', icon: 'i-lucide-building-2', to: '/clienti', onSelect: close },
  { label: 'Documente', icon: 'i-lucide-folder-open', to: '/documente', onSelect: close },
  { label: 'Notificări', icon: 'i-lucide-bell', to: '/notificari', badge: unreadBadge.value, onSelect: close },
  { label: 'Ajutor', icon: 'i-lucide-circle-help', to: '/ajutor', onSelect: close }
])

const adminItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Administrare', type: 'label' },
  { label: 'Servicii', icon: 'i-lucide-briefcase', to: '/servicii', onSelect: close },
  { label: 'Utilizatori', icon: 'i-lucide-user-cog', to: '/utilizatori', onSelect: close }
])

/** Pe telefon, cele mai folosite pagini sunt la un singur gest distanță. */
const bottomItems = [
  { label: 'Acasă', icon: 'i-lucide-layout-dashboard', to: '/', exact: true },
  { label: 'De făcut', icon: 'i-lucide-list-checks', to: '/task-uri' },
  { label: 'Calendar', icon: 'i-lucide-calendar-days', to: '/calendar' },
  { label: 'Clienți', icon: 'i-lucide-building-2', to: '/clienti' },
  { label: 'Notificări', icon: 'i-lucide-bell', to: '/notificari' }
]

function isActive(item: { to: string, exact?: boolean }): boolean {
  return item.exact ? route.path === item.to : route.path === item.to || route.path.startsWith(`${item.to}/`)
}
</script>

<template>
  <UDashboardGroup unit="rem" class="max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
    <UDashboardSidebar
      id="main"
      v-model:open="open"
      collapsible
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/"
          class="rounded-md"
          aria-label="Alconst Serv – pagina principală"
          @click="close"
        >
          <AppLogo :compact="collapsed" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="mainItems"
          orientation="vertical"
          tooltip
        />

        <UNavigationMenu
          v-if="isAdmin"
          :collapsed="collapsed"
          :items="adminItems"
          orientation="vertical"
          tooltip
          class="mt-4"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>

  <nav
    class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] lg:hidden"
    aria-label="Navigare rapidă"
  >
    <NuxtLink
      v-for="item in bottomItems"
      :key="item.to"
      :to="item.to"
      class="relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]"
      :class="isActive(item) ? 'font-medium text-primary' : 'text-muted'"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      <span class="relative">
        <UIcon :name="item.icon" class="size-5" />
        <span
          v-if="item.to === '/notificari' && unread > 0"
          class="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold text-inverted"
        >{{ unread > 9 ? '9+' : unread }}</span>
      </span>
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
