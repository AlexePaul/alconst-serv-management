<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ServiceDto } from '@alconst/shared'

definePageMeta({ adminOnly: true })
useHead({ title: 'Servicii' })

const api = useApi()
const toast = useToast()

const { data: services, status, error, refresh } = useServices()

const formOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<ServiceDto | null>(null)
const deleting = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(service: ServiceDto) {
  selected.value = service
  formOpen.value = true
}

function openDelete(service: ServiceDto) {
  selected.value = service
  deleteOpen.value = true
}

async function confirmDelete() {
  const service = selected.value
  if (!service) return
  deleting.value = true
  try {
    await api(`/services/${service.id}`, { method: 'DELETE' })
    toast.add({ title: 'Serviciul a fost șters', description: service.name, color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    deleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

function actions(service: ServiceDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(service) }],
    [{ label: 'Șterge', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(service) }]
  ]
}
</script>

<template>
  <UDashboardPanel id="services">
    <template #header>
      <UDashboardNavbar title="Servicii">
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Adaugă serviciu"
            class="hidden sm:inline-flex"
            @click="openCreate"
          />
          <UButton
            icon="i-lucide-plus"
            aria-label="Adaugă serviciu"
            class="sm:hidden"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <p class="mb-4 text-sm text-muted">
          Catalogul serviciilor oferite de firmă. Din el se aleg serviciile prestate fiecărui client și cele din contracte.
        </p>

        <UEmpty
          v-if="error"
          icon="i-lucide-cloud-off"
          title="Serviciile nu au putut fi încărcate"
          :description="apiErrorMessage(error.cause ?? error)"
          :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
          variant="naked"
        />

        <div v-else-if="status === 'pending' && !services.length" class="space-y-3">
          <USkeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>

        <UEmpty
          v-else-if="services.length === 0"
          icon="i-lucide-briefcase"
          title="Niciun serviciu încă"
          description="Adaugă serviciile oferite de firmă, de exemplu SSM, PSI sau tipurile de instruire."
          :actions="[{ label: 'Adaugă serviciu', icon: 'i-lucide-plus', onClick: openCreate }]"
          variant="naked"
        />

        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-default">
          <li v-for="service in services" :key="service.id" class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-highlighted">
                {{ service.name }}
                <UBadge
                  v-if="!service.isActive"
                  label="Dezactivat"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="ml-1 align-middle"
                />
              </p>
              <p v-if="service.description" class="text-sm text-muted">
                {{ service.description }}
              </p>
            </div>
            <p class="shrink-0 text-sm text-muted">
              {{ countLabel(service.clientCount, 'client', 'clienți') }}
            </p>
            <UDropdownMenu :items="actions(service)" :content="{ align: 'end' }">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis-vertical"
                :aria-label="`Acțiuni pentru ${service.name}`"
              />
            </UDropdownMenu>
          </li>
        </ul>
      </div>

      <ServicesServiceFormModal v-model:open="formOpen" :service="selected" @saved="refresh()" />
      <ConfirmDialog
        v-model:open="deleteOpen"
        title="Ștergi serviciul?"
        :description="`„${selected?.name}” va fi șters din catalog. Serviciile folosite de clienți sau în contracte nu pot fi șterse, doar dezactivate.`"
        confirm-label="Șterge serviciul"
        color="error"
        :loading="deleting"
        @confirm="confirmDelete"
      />
    </template>
  </UDashboardPanel>
</template>
