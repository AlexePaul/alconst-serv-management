<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ServiceDto } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unui serviciu din catalog. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ service: ServiceDto | null }>()
const emit = defineEmits<{ saved: [service: ServiceDto] }>()

const api = useApi()
const toast = useToast()

const isEdit = computed(() => props.service !== null)

const schema = z.object({
  name: z.string('Denumirea este obligatorie.').trim().min(1, 'Denumirea este obligatorie.').max(150),
  description: z.string().trim().max(1000).optional(),
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
    name: props.service?.name ?? '',
    description: props.service?.description ?? '',
    isActive: props.service?.isActive ?? true
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await submit(async () => {
    const saved = props.service
      ? await api<ServiceDto>(`/services/${props.service.id}`, { method: 'PATCH', body: event.data })
      : await api<ServiceDto>('/services', { method: 'POST', body: event.data })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Serviciul a fost adăugat',
      description: saved.name,
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
  })
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Modifică serviciul' : 'Adaugă serviciu'" :dismissible="!loading">
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
          <UInput v-model="state.name" placeholder="ex. SSM, PSI, Instruire periodică" class="w-full" />
        </UFormField>

        <UFormField label="Descriere" name="description">
          <UTextarea
            v-model="state.description"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="isEdit" name="isActive" help="Serviciile dezactivate nu mai pot fi alese pentru clienți noi, dar rămân la cei existenți.">
          <USwitch v-model="state.isActive" label="Serviciu activ" />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă serviciul'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
