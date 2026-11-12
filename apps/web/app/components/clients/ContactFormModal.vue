<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ClientContactDto } from '@alconst/shared'
import { CONTACT_METHOD_REQUIRED } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unei persoane de contact a clientului. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  clientId: string
  contact: ClientContactDto | null
}>()

const emit = defineEmits<{ saved: [contact: ClientContactDto] }>()

const api = useApi()
const toast = useToast()

const isEdit = computed(() => props.contact !== null)

/** Sugestii de rol; utilizatorul poate scrie orice. */
const suggestions = ['Administrator', 'Persoana care este mereu acolo', 'Contabilitate', 'Resurse umane']

const schema = z.object({
  label: z.string('Spune cine este persoana.').trim().min(1, 'Spune cine este persoana.').max(100),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.literal(''), z.email('Introdu o adresă de email validă.')]).optional(),
  notes: z.string().trim().max(1000).optional()
}).refine(value => Boolean(value.phone || value.email), { path: ['phone'], message: CONTACT_METHOD_REQUIRED })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  Object.assign(state, {
    label: props.contact?.label ?? '',
    name: props.contact?.name ?? '',
    phone: props.contact?.phone ?? '',
    email: props.contact?.email ?? '',
    notes: props.contact?.notes ?? ''
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await submit(async () => {
    const saved = props.contact
      ? await api<ClientContactDto>(`/contacts/${props.contact.id}`, { method: 'PATCH', body: event.data })
      : await api<ClientContactDto>('/contacts', { method: 'POST', body: { ...event.data, clientId: props.clientId } })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Contactul a fost adăugat',
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'Modifică contactul' : 'Adaugă contact'"
    description="O persoană de la client pe care o poți suna sau căreia îi poți scrie."
    :dismissible="!loading"
  >
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <FormError :message="errorMessage" />

        <UFormField label="Cine este?" name="label" required>
          <UInput v-model="state.label" placeholder="ex. Administrator" class="w-full" />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <UButton
              v-for="suggestion in suggestions"
              :key="suggestion"
              :label="suggestion"
              color="neutral"
              variant="soft"
              size="xs"
              @click="state.label = suggestion"
            />
          </div>
        </UFormField>

        <UFormField label="Nume" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Telefon" name="phone">
            <UInput
              v-model="state.phone"
              type="tel"
              inputmode="tel"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Email" name="email">
            <UInput
              v-model="state.email"
              type="email"
              inputmode="email"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Observații" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="2"
            autoresize
            placeholder="ex. Răspunde doar dimineața"
            class="w-full"
          />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
