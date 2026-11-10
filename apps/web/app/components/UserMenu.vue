<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { USER_ROLE_LABELS } from '@alconst/shared'

defineProps<{
  collapsed?: boolean
}>()

const { user, fullName, logout } = useAuth()
const colorMode = useColorMode()

const loggingOut = ref(false)

async function onLogout() {
  loggingOut.value = true
  try {
    await logout()
  } finally {
    loggingOut.value = false
  }
}

const themeOptions = [
  { value: 'light', label: 'Luminos', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Întunecat', icon: 'i-lucide-moon' },
  { value: 'system', label: 'Ca dispozitivul', icon: 'i-lucide-monitor' }
] as const

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    type: 'label',
    label: fullName.value,
    description: user.value?.email
  }],
  [{
    label: 'Contul meu',
    icon: 'i-lucide-user-round',
    to: '/cont'
  }, {
    label: 'Aspect',
    icon: 'i-lucide-sun-moon',
    children: themeOptions.map(option => ({
      label: option.label,
      icon: option.icon,
      type: 'checkbox' as const,
      checked: colorMode.preference === option.value,
      onSelect: (event: Event) => {
        event.preventDefault()
        colorMode.preference = option.value
      }
    }))
  }],
  [{
    label: 'Deconectare',
    icon: 'i-lucide-log-out',
    color: 'error',
    loading: loggingOut.value,
    onSelect: onLogout
  }]
])
</script>

<template>
  <UDropdownMenu
    v-if="user"
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width) min-w-56' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      :aria-label="`Meniul utilizatorului ${fullName}`"
      class="data-[state=open]:bg-elevated"
      :class="collapsed ? 'justify-center' : 'justify-start text-left'"
    >
      <UAvatar :text="initials(user.firstName, user.lastName)" size="sm" class="shrink-0" />
      <span v-if="!collapsed" class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-highlighted">{{ fullName }}</span>
        <span class="block truncate text-xs font-normal text-muted">{{ USER_ROLE_LABELS[user.role] }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </UButton>
  </UDropdownMenu>
</template>
