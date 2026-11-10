<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)

function retry() {
  // Reîncărcare completă: dacă eroarea a apărut la pornire (ex. serverul nu răspunde),
  // aplicația trebuie reinițializată.
  window.location.assign(isNotFound.value ? '/' : window.location.href)
}
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh items-center justify-center p-6">
      <UEmpty
        :icon="isNotFound ? 'i-lucide-map-pin-off' : 'i-lucide-cloud-off'"
        :title="isNotFound ? 'Pagina nu a fost găsită' : 'Aplicația nu poate fi încărcată'"
        :description="isNotFound
          ? 'Adresa accesată nu există sau a fost mutată.'
          : 'Serverul nu răspunde momentan. Verifică conexiunea la internet și încearcă din nou.'"
        :actions="[{
          label: isNotFound ? 'Înapoi la pagina principală' : 'Încearcă din nou',
          icon: isNotFound ? 'i-lucide-house' : 'i-lucide-refresh-cw',
          onClick: retry
        }]"
        variant="naked"
        size="lg"
      />
    </div>
  </UApp>
</template>
