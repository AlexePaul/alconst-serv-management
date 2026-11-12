<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ClientContactDto, ClientDto } from '@alconst/shared'

/**
 * Contactele unui client: contactul principal din fișa clientului, urmat de celelalte persoane
 * (administrator, persoana care este mereu acolo etc.), fiecare cu rolul scris de utilizator.
 */
const props = defineProps<{ client: ClientDto }>()
const emit = defineEmits<{ editClient: [] }>()

const api = useApi()
const toast = useToast()

const { data: contacts, error, refresh } = useLazyAsyncData(
  `contacts:${props.client.id}`,
  () => api<ClientContactDto[]>('/contacts', { query: { clientId: props.client.id } }),
  { default: () => [] }
)

const hasMain = computed(() => Boolean(props.client.contactPerson || props.client.phone || props.client.email))

const formOpen = ref(false)
const deleteOpen = ref(false)
const selected = ref<ClientContactDto | null>(null)
const deleting = ref(false)

function openCreate() {
  selected.value = null
  formOpen.value = true
}

function openEdit(contact: ClientContactDto) {
  selected.value = contact
  formOpen.value = true
}

function openDelete(contact: ClientContactDto) {
  selected.value = contact
  deleteOpen.value = true
}

function actions(contact: ClientContactDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Modifică', icon: 'i-lucide-pencil', onSelect: () => openEdit(contact) }],
    [{ label: 'Șterge', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDelete(contact) }]
  ]
}

async function remove() {
  if (!selected.value) return
  deleting.value = true
  try {
    await api(`/contacts/${selected.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Contactul a fost șters', color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    await refresh()
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}

const tel = (phone: string) => `tel:${phone.replace(/\s+/g, '')}`
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-semibold text-highlighted">
          Contacte
        </h2>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-plus"
          label="Adaugă contact"
          @click="openCreate"
        />
      </div>
    </template>

    <p v-if="error" class="text-sm text-error">
      Contactele nu au putut fi încărcate.
      <UButton
        variant="link"
        size="sm"
        label="Încearcă din nou"
        @click="refresh()"
      />
    </p>
    <p v-else-if="!hasMain && contacts.length === 0" class="text-sm text-muted">
      Niciun contact încă. Adaugă persoanele pe care le suni înainte de o deplasare.
    </p>

    <ul v-else class="-my-3 divide-y divide-default text-sm">
      <li v-if="hasMain" class="flex items-start gap-3 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-muted">
            Contact principal
          </p>
          <p v-if="client.contactPerson" class="font-medium text-highlighted">
            {{ client.contactPerson }}
          </p>
          <p class="flex flex-wrap gap-x-4 gap-y-1">
            <ULink v-if="client.phone" :to="tel(client.phone)" class="text-primary">
              {{ client.phone }}
            </ULink>
            <ULink v-if="client.email" :to="`mailto:${client.email}`" class="break-all text-primary">
              {{ client.email }}
            </ULink>
          </p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-pencil"
          aria-label="Modifică contactul principal"
          @click="emit('editClient')"
        />
      </li>
      <li v-for="contact in contacts" :key="contact.id" class="flex items-start gap-3 py-3">
        <div class="min-w-0 flex-1">
          <p class="text-muted">
            {{ contact.label }}
          </p>
          <p v-if="contact.name" class="font-medium text-highlighted">
            {{ contact.name }}
          </p>
          <p class="flex flex-wrap gap-x-4 gap-y-1">
            <ULink v-if="contact.phone" :to="tel(contact.phone)" class="text-primary">
              {{ contact.phone }}
            </ULink>
            <ULink v-if="contact.email" :to="`mailto:${contact.email}`" class="break-all text-primary">
              {{ contact.email }}
            </ULink>
          </p>
          <p v-if="contact.notes" class="mt-1 whitespace-pre-line text-default">
            {{ contact.notes }}
          </p>
        </div>
        <UDropdownMenu :items="actions(contact)" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-ellipsis-vertical"
            :aria-label="`Acțiuni pentru ${contact.label}`"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <ClientsContactFormModal
      v-model:open="formOpen"
      :client-id="client.id"
      :contact="selected"
      @saved="refresh()"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Ștergi contactul?"
      :description="`„${selected?.label}” va fi șters din fișa clientului.`"
      confirm-label="Șterge"
      color="error"
      :loading="deleting"
      @confirm="remove"
    />
  </UCard>
</template>
