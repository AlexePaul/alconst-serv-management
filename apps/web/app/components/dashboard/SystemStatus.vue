<script setup lang="ts">
import type { SystemStatusDto } from '@alconst/shared'

/**
 * Avertizare pentru administratori atunci când rularea periodică (worker-ul) s-a oprit:
 * fără ea nu se mai generează task-urile recurente și nu se mai trimit reamintiri sau emailuri.
 */
const api = useApi()

const { data } = useLazyAsyncData('dashboard:system-status', () => api<SystemStatusDto>('/system/status'))
const maintenance = computed(() => data.value?.maintenance)
</script>

<template>
  <UAlert
    v-if="maintenance && !maintenance.healthy"
    color="error"
    variant="subtle"
    icon="i-lucide-server-crash"
    title="Rularea periodică a aplicației este oprită"
    :description="maintenance.lastRunAt
      ? `Ultima rulare a fost la ${formatDateTime(maintenance.lastRunAt)}. Până la repornirea procesului de fundal (worker), activitățile recurente nu mai apar în listă, iar reamintirile și emailurile nu se mai trimit.`
      : 'Procesul de fundal (worker) nu a rulat încă niciodată. Până la pornirea lui, activitățile recurente nu apar în listă, iar reamintirile și emailurile nu se trimit.'"
  />
</template>
