<script setup lang="ts">
import { ro } from '@nuxt/ui/locale'

const colorMode = useColorMode()

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
  <UApp :locale="ro" :toaster="{ position: 'top-right' }">
    <NuxtPwaManifest />
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
