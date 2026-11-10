<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { LocationDto } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unui punct de lucru. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  clientId: string
  location: LocationDto | null
}>()

const emit = defineEmits<{ saved: [location: LocationDto] }>()

const api = useApi()
const toast = useToast()

const isEdit = computed(() => props.location !== null)

const schema = z.object({
  name: z.string('Denumirea este obligatorie.').trim().min(1, 'Denumirea este obligatorie.').max(200),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  isActive: z.boolean().optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  Object.assign(state, {
    name: props.location?.name ?? '',
    address: props.location?.address ?? '',
    notes: props.location?.notes ?? '',
    isActive: props.location?.isActive ?? true
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await submit(async () => {
    const saved = props.location
      ? await api<LocationDto>(`/locations/${props.location.id}`, { method: 'PATCH', body: event.data })
      : await api<LocationDto>('/locations', { method: 'POST', body: { ...event.data, clientId: props.clientId } })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Punctul de lucru a fost adăugat',
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
  })
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Modifică punctul de lucru' : 'Adaugă punct de lucru'" :dismissible="!loading">
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
          <UInput v-model="state.name" placeholder="ex. Sediu central, Depozit Brașov" class="w-full" />
        </UFormField>

        <UFormField label="Adresă" name="address">
          <UInput v-model="state.address" class="w-full" />
        </UFormField>

        <UFormField label="Observații" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="isEdit" name="isActive">
          <USwitch v-model="state.isActive" label="Punct de lucru activ" />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
