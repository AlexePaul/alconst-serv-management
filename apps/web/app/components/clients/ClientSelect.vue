<script setup lang="ts">
import type { ClientListItemDto, Paginated } from '@alconst/shared'

/**
 * Selector de client cu căutare pe server – lista de clienți poate fi lungă,
 * deci nu o încărcăm integral în browser.
 */
const model = defineModel<string | undefined>()

const props = withDefaults(defineProps<{
  placeholder?: string
  /** Include și clienții inactivi (pentru filtre). */
  includeInactive?: boolean
  /** Afișează un buton de golire a selecției. */
  clearable?: boolean
  /** Denumirea clientului deja selectat, pentru a fi afișată înainte de prima căutare. */
  initialLabel?: string
}>(), {
  placeholder: 'Alege clientul'
})

const api = useApi()

const searchTerm = ref('')
const debouncedTerm = useDebounced(searchTerm, 250)

const { data, status } = useLazyAsyncData(
  () => `clients:select:${props.includeInactive ? 'all' : 'active'}:${debouncedTerm.value}`,
  () => api<Paginated<ClientListItemDto>>('/clients', {
    query: {
      search: debouncedTerm.value || undefined,
      status: props.includeInactive ? 'all' : 'active',
      pageSize: 20
    }
  }),
  { watch: [debouncedTerm] }
)

// Clientul selectat rămâne în listă chiar dacă nu se potrivește cu căutarea curentă.
const known = ref(new Map<string, string>())
watch(data, (page) => {
  for (const client of page?.items ?? []) known.value.set(client.id, client.name)
}, { immediate: true })

const items = computed(() => {
  const list = (data.value?.items ?? []).map(client => ({ label: client.name, value: client.id }))
  const selected = model.value
  if (selected && !list.some(item => item.value === selected)) {
    list.unshift({ label: known.value.get(selected) ?? props.initialLabel ?? 'Client selectat', value: selected })
  }
  return list
})
</script>

<template>
  <USelectMenu
    v-model="model"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    ignore-filter
    :loading="status === 'pending'"
    :placeholder="placeholder"
    :search-input="{ placeholder: 'Caută după denumire sau CUI' }"
    :clear="clearable"
    class="w-full"
  >
    <template #empty>
      {{ status === 'pending' ? 'Se caută…' : 'Niciun client găsit' }}
    </template>
  </USelectMenu>
</template>
