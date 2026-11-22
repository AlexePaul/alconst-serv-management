<script setup lang="ts">
import { ro } from '@nuxt/ui/locale'

const colorMode = useColorMode()

/** Ecran de telefon (bara de navigare de jos este vizibilă). */
const compact = ref(false)
onMounted(() => {
  const query = window.matchMedia('(max-width: 1023px)')
  compact.value = query.matches
  query.addEventListener('change', (event) => {
    compact.value = event.matches
  })
})

useHead({
  titleTemplate: title => (title && title !== 'Alconst Serv' ? `${title} · Alconst Serv` : 'Alconst Serv'),
  meta: [
    {
      key: 'theme-color',
      name: 'theme-color',
      content: computed(() => (colorMode.value === 'dark' ? '#0f172a' : '#ffffff'))
    }
  ]
})
</script>

<template>
  <!-- Pe telefon, mesajele apar jos, deasupra barei de navigare, ca să nu acopere titlul paginii. -->
  <UApp
    :locale="ro"
    :toaster="{
      position: compact ? 'bottom-center' : 'top-right',
      max: 3,
      ui: { viewport: 'max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' }
    }"
  >
    <NuxtPwaManifest />
    <NuxtLoadingIndicator />
    <OfflineBanner />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
