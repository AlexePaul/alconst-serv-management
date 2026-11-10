<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ClientEmployeeDto, LocationDto } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unui angajat al unui client. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  employee: ClientEmployeeDto | null
  /** Clientul este fix atunci când formularul este deschis din pagina unui client. */
  clientId?: string
}>()

const emit = defineEmits<{ saved: [employee: ClientEmployeeDto] }>()

const api = useApi()
const toast = useToast()

const isEdit = computed(() => props.employee !== null)
/** Clientul se alege doar la adăugarea din lista generală de angajați. */
const chooseClient = computed(() => !isEdit.value && !props.clientId)

const NO_LOCATION = 'none'

const schema = z.object({
  clientId: z.string('Alege clientul.').min(1, 'Alege clientul.'),
  locationId: z.string().optional(),
  firstName: z.string('Prenumele este obligatoriu.').trim().min(1, 'Prenumele este obligatoriu.').max(100),
  lastName: z.string('Numele este obligatoriu.').trim().min(1, 'Numele este obligatoriu.').max(100),
  position: z.string().trim().max(200).optional(),
  hireDate: z.string().optional(),
  notes: z.string().trim().max(5000).optional(),
  isActive: z.boolean().optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

// Punctele de lucru depind de clientul ales.
const locations = ref<LocationDto[]>([])
const locationsLoading = ref(false)

async function loadLocations(clientId: string | undefined) {
  locations.value = []
  if (!clientId) return
  locationsLoading.value = true
  try {
    locations.value = await api<LocationDto[]>('/locations', { query: { clientId } })
  } catch {
    // Fără puncte de lucru, angajatul poate fi salvat oricum; lista rămâne goală.
  } finally {
    locationsLoading.value = false
  }
}

const locationItems = computed(() => [
  { label: 'Fără punct de lucru', value: NO_LOCATION },
  ...locations.value
    .filter(location => location.isActive || location.id === props.employee?.locationId)
    .map(location => ({ label: location.name, value: location.id }))
])

watch(() => state.clientId, (clientId, previous) => {
  if (!open.value || clientId === previous) return
  if (previous !== undefined) state.locationId = NO_LOCATION
  loadLocations(clientId)
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const employee = props.employee
  const clientId = employee?.clientId ?? props.clientId
  Object.assign(state, {
    clientId,
    locationId: employee?.locationId ?? NO_LOCATION,
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    position: employee?.position ?? '',
    hireDate: employee?.hireDate ?? '',
    notes: employee?.notes ?? '',
    isActive: employee?.isActive ?? true
  })
  loadLocations(clientId)
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { clientId, locationId, ...fields } = event.data
  const body = { ...fields, locationId: locationId === NO_LOCATION ? null : locationId }
  await submit(async () => {
    const saved = props.employee
      ? await api<ClientEmployeeDto>(`/employees/${props.employee.id}`, { method: 'PATCH', body })
      : await api<ClientEmployeeDto>('/employees', { method: 'POST', body: { ...body, clientId } })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Angajatul a fost adăugat',
      description: `${saved.firstName} ${saved.lastName}`,
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
    :title="isEdit ? 'Modifică angajatul' : 'Adaugă angajat'"
    :description="employee ? employee.clientName : undefined"
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

        <UFormField
          v-if="chooseClient"
          label="Client"
          name="clientId"
          required
        >
          <ClientsClientSelect v-model="state.clientId" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Nume" name="lastName" required>
            <UInput v-model="state.lastName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Prenume" name="firstName" required>
            <UInput v-model="state.firstName" autocomplete="off" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Funcție" name="position">
          <UInput v-model="state.position" placeholder="ex. Electrician" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Punct de lucru" name="locationId">
            <USelect
              v-model="state.locationId"
              :items="locationItems"
              :loading="locationsLoading"
              :disabled="!state.clientId"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Data angajării" name="hireDate">
            <UInput v-model="state.hireDate" type="date" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Observații" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="isEdit" name="isActive" help="Angajații arhivați (de exemplu cei plecați din companie) rămân în evidență.">
          <USwitch v-model="state.isActive" label="Angajat activ" />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă angajatul'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
