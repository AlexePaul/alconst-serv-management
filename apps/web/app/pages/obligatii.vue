<script setup lang="ts">
useHead({ title: 'Obligații' })

const list = useTemplateRef('list')
</script>

<template>
  <UDashboardPanel id="obligations">
    <template #header>
      <UDashboardNavbar title="Obligații">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Adaugă obligație"
            class="hidden sm:inline-flex"
            @click="list?.openCreate()"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă obligație"
            class="sm:hidden"
            @click="list?.openCreate()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <p class="mb-4 text-sm text-muted">
          Activitățile care se repetă pentru fiecare client. Din ele se creează automat task-uri, cu termen și responsabil.
        </p>
        <TasksObligationsList ref="list" />
      </div>
    </template>
  </UDashboardPanel>
</template>
