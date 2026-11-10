<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { isAdmin } = useAuth()

const open = ref(false)

function close() {
  open.value = false
}

/** Modulele care urmează să fie livrate apar în meniu, dar dezactivate. */
const soon = { disabled: true, badge: { label: 'În curând', color: 'neutral', variant: 'subtle', size: 'sm' } } as const

const mainItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Acasă', icon: 'i-lucide-layout-dashboard', to: '/', exact: true, onSelect: close },
  { label: 'Task-uri', icon: 'i-lucide-list-checks', ...soon },
  { label: 'Calendar', icon: 'i-lucide-calendar-days', ...soon },
  { label: 'Clienți', icon: 'i-lucide-building-2', ...soon },
  { label: 'Angajați', icon: 'i-lucide-users-round', ...soon },
  { label: 'Documente', icon: 'i-lucide-file-text', ...soon }
])

const adminItems = computed<NavigationMenuItem[]>(() => [
  { label: 'Administrare', type: 'label' },
  { label: 'Utilizatori', icon: 'i-lucide-user-cog', to: '/utilizatori', onSelect: close }
])
</script>

<template>
  <UDashboardGroup unit="rem">
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
</template>
