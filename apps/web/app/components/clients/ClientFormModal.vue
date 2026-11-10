<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ClientDto } from '@alconst/shared'
import { CUI_PATTERN, normalizeCui } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea unui client sau modificarea datelor lui. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** Clientul editat; `null` pentru adăugare. */
  client: ClientDto | null
}>()

const emit = defineEmits<{ saved: [client: ClientDto] }>()

const api = useApi()
const toast = useToast()
const { isAdmin } = useAuth()

const isEdit = computed(() => props.client !== null)

const optionalText = (max: number) => z.string().trim().max(max, `Cel mult ${max} de caractere.`).optional()

const schema = z.object({
  name: z.string('Denumirea este obligatorie.').trim().min(1, 'Denumirea este obligatorie.').max(200),
  cui: z
    .string('CUI-ul este obligatoriu.')
    .transform(normalizeCui)
    .refine(value => CUI_PATTERN.test(value), 'CUI-ul trebuie să conțină 2–10 cifre, opțional cu prefixul RO.'),
  tradeRegisterNumber: optionalText(50),
  address: optionalText(500),
  legalRepresentative: optionalText(200),
  contactPerson: optionalText(200),
  phone: optionalText(50),
  email: z.union([z.literal(''), emailSchema]).optional(),
  notes: optionalText(5000),
  responsibleIds: z.array(z.string()).optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

// Administratorii pot alege responsabilii la adăugare; angajații devin automat responsabili.
const showResponsibles = computed(() => isAdmin.value && !isEdit.value)
const { data: userOptions } = useUserOptions()
const responsibleItems = computed(() =>
  userOptions.value.map(user => ({ label: `${user.firstName} ${user.lastName}`, value: user.id }))
)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const client = props.client
  Object.assign(state, {
    name: client?.name ?? '',
    cui: client?.cui ?? '',
    tradeRegisterNumber: client?.tradeRegisterNumber ?? '',
    address: client?.address ?? '',
    legalRepresentative: client?.legalRepresentative ?? '',
    contactPerson: client?.contactPerson ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    notes: client?.notes ?? '',
    responsibleIds: []
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { responsibleIds, ...fields } = event.data
  await submit(async () => {
    const saved = props.client
      ? await api<ClientDto>(`/clients/${props.client.id}`, { method: 'PATCH', body: fields })
      : await api<ClientDto>('/clients', {
          method: 'POST',
          body: showResponsibles.value ? { ...fields, responsibleIds } : fields
        })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Clientul a fost adăugat',
      description: saved.name,
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
    :title="isEdit ? 'Modifică clientul' : 'Adaugă client'"
    :description="isEdit ? 'Actualizează datele companiei.' : 'Completează datele companiei. Doar denumirea și CUI-ul sunt obligatorii.'"
    :dismissible="!loading"
    :ui="{ content: 'sm:max-w-2xl' }"
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

        <UFormField label="Denumire" name="name" required>
          <UInput v-model="state.name" placeholder="SC Exemplu SRL" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="CUI" name="cui" required>
            <UInput v-model="state.cui" placeholder="RO12345678" class="w-full" />
          </UFormField>
          <UFormField label="Nr. Registrul Comerțului" name="tradeRegisterNumber">
            <UInput v-model="state.tradeRegisterNumber" placeholder="J40/1234/2020" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Adresă" name="address">
          <UInput v-model="state.address" class="w-full" />
        </UFormField>

        <UFormField label="Reprezentant legal" name="legalRepresentative">
          <UInput v-model="state.legalRepresentative" class="w-full" />
        </UFormField>

        <USeparator label="Contact" />

        <UFormField label="Persoană de contact" name="contactPerson">
          <UInput v-model="state.contactPerson" class="w-full" />
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

        <UFormField
          v-if="showResponsibles"
          label="Responsabili"
          name="responsibleIds"
          help="Angajații selectați vor putea vedea și modifica acest client."
        >
          <USelectMenu
            v-model="state.responsibleIds"
            :items="responsibleItems"
            value-key="value"
            multiple
            placeholder="Alege responsabilii"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Observații" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="3"
            autoresize
            class="w-full"
          />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă clientul'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
