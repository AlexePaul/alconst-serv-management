<script setup lang="ts">
useHead({ title: 'Angajați' })

const route = useRoute()
const router = useRouter()
const table = useTemplateRef('table')

// Acțiunea rapidă „Adaugă angajat” de pe pagina principală deschide direct formularul.
onMounted(() => {
  if (route.query.nou !== undefined) {
    table.value?.openCreate()
    router.replace({ query: {} })
  }
})
</script>

<template>
  <UDashboardPanel id="employees">
    <template #header>
      <UDashboardNavbar title="Angajați">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Adaugă angajat"
            class="hidden sm:inline-flex"
            @click="table?.openCreate()"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă angajat"
            class="sm:hidden"
            @click="table?.openCreate()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientsEmployeesTable ref="table" />
    </template>
  </UDashboardPanel>
</template>
