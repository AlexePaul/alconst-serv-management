<script setup lang="ts">
useHead({ title: 'Activități recurente' })

const list = useTemplateRef('list')
</script>

<template>
  <UDashboardPanel id="obligations">
    <template #header>
      <UDashboardNavbar title="Activități recurente">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Adaugă activitate recurentă"
            class="hidden sm:inline-flex"
            @click="list?.openCreate()"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă activitate recurentă"
            class="sm:hidden"
            @click="list?.openCreate()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <p class="mb-4 text-sm text-muted">
          Ce se repetă pentru fiecare client, de exemplu deplasarea lunară. Aplicația le pune singură în lista „De făcut”.
        </p>
        <TasksObligationsList ref="list" />
      </div>
    </template>
  </UDashboardPanel>
</template>
