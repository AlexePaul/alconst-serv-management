<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ClientDto } from '@alconst/shared'
import { alignToMonthCycle, CUI_PATTERN, formatMonthList, MAX_EMPLOYEE_COUNT, monthCycleOptions, normalizeCui } from '@alconst/shared'
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
const { user, isAdmin } = useAuth()

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
  // Doar numărul: aplicația nu ține evidența persoanelor angajate la client.
  employeeCount: z.union([
    z.literal(''),
    z.number('Introdu un număr.').int('Introdu un număr întreg.').min(0, 'Numărul nu poate fi negativ.').max(MAX_EMPLOYEE_COUNT, 'Numărul este prea mare.')
  ]).optional(),
  notes: optionalText(5000),
  responsibleIds: z.array(z.string()).optional(),
  // Doar la adăugare: cât de des se merge la client. Din răspuns se creează deplasarea recurentă.
  visitFrequency: z.string().optional(),
  visitMonths: z.string().optional()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

// --- Deplasări: cât de des se merge la client (doar la adăugare) ------------------------------

const NO_VISITS = 'none'
const visitItems = [
  { label: 'Nu stabilesc acum', value: NO_VISITS },
  ...RECURRENCE_PRESETS.map(preset => ({ label: preset.label, value: preset.value as string }))
]
const visitPreset = computed(() => RECURRENCE_PRESETS.find(preset => preset.value === state.visitFrequency))
/** Lunile dintre care se alege, pentru frecvențele la câteva luni (ex. ian.–apr.–iul.–oct.). */
const visitMonthItems = computed(() => {
  const preset = visitPreset.value
  return preset
    ? monthCycleOptions(preset.unit, preset.interval).map(months => ({ label: formatMonthList(months), value: String(months[0]), months }))
    : []
})
watch(visitMonthItems, (items) => {
  // Implicit, varianta care include luna curentă: prima deplasare este chiar luna aceasta.
  const current = Number(todayLocal().slice(5, 7))
  state.visitMonths = (items.find(item => item.months.includes(current)) ?? items[0])?.value
})

/** Creează deplasarea recurentă a clientului nou. Clientul rămâne salvat și dacă aceasta eșuează. */
async function createVisits(client: ClientDto, assigneeId: string | undefined): Promise<boolean> {
  const preset = visitPreset.value
  if (!preset) return true
  const months = visitMonthItems.value.find(item => item.value === state.visitMonths)?.months
  const today = todayLocal()
  try {
    await api('/obligations', {
      method: 'POST',
      body: {
        title: 'Deplasare',
        kind: 'VISIT',
        clientId: client.id,
        assigneeId: assigneeId ?? null,
        recurrenceUnit: preset.unit,
        recurrenceInterval: preset.interval,
        startDate: months ? alignToMonthCycle(today, months, today) : today
      }
    })
    return true
  } catch {
    return false
  }
}

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
    employeeCount: client?.employeeCount ?? '',
    notes: client?.notes ?? '',
    responsibleIds: [],
    visitFrequency: NO_VISITS,
    visitMonths: undefined
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { responsibleIds, employeeCount, visitFrequency: _frequency, visitMonths: _months, ...rest } = event.data
  const fields = { ...rest, employeeCount: typeof employeeCount === 'number' ? employeeCount : null }
  await submit(async () => {
    const saved = props.client
      ? await api<ClientDto>(`/clients/${props.client.id}`, { method: 'PATCH', body: fields })
      : await api<ClientDto>('/clients', {
          method: 'POST',
          body: showResponsibles.value ? { ...fields, responsibleIds } : fields
        })
    // Deplasările sunt ale celui care adaugă clientul sau, pentru un administrator, ale primului responsabil ales.
    const visitsCreated = isEdit.value || await createVisits(saved, isAdmin.value ? (responsibleIds?.[0] ?? user.value?.id) : user.value?.id)
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Clientul a fost adăugat',
      description: !isEdit.value && visitPreset.value && visitsCreated ? `${saved.name} · deplasările apar în lista „De făcut”` : saved.name,
      color: 'success',
      icon: 'i-lucide-check'
    })
    if (!visitsCreated) {
      toast.add({
        title: 'Deplasările nu au putut fi programate',
        description: 'Clientul a fost salvat. Adaugă deplasarea din pagina lui, la „Activități”.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert'
      })
    }
    open.value = false
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'Modifică clientul' : 'Adaugă client'"
    :description="isEdit ? 'Actualizează datele companiei.' : 'Ajung denumirea și CUI-ul. Restul se poate completa și mai târziu.'"
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

        <UFormField label="CUI" name="cui" required>
          <UInput v-model="state.cui" placeholder="RO12345678" class="w-full sm:w-60" />
        </UFormField>

        <UFormField label="Adresă" name="address">
          <UInput v-model="state.address" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Persoană de contact" name="contactPerson">
            <UInput v-model="state.contactPerson" class="w-full" />
          </UFormField>
          <UFormField label="Telefon" name="phone">
            <UInput
              v-model="state.phone"
              type="tel"
              inputmode="tel"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          label="Număr de angajați"
          name="employeeCount"
          help="Doar numărul total. Aplicația te întreabă din nou la fiecare deplasare."
        >
          <UInput
            v-model.number="state.employeeCount"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            class="w-full sm:w-40"
          />
        </UFormField>

        <template v-if="!isEdit">
          <UFormField
            label="Cât de des mergi la acest client?"
            name="visitFrequency"
            help="Aplicația pune singură deplasările în lista „De făcut”. Se poate schimba oricând din pagina clientului."
          >
            <USelect v-model="state.visitFrequency" :items="visitItems" class="w-full sm:w-72" />
          </UFormField>

          <UFormField
            v-if="visitMonthItems.length > 0"
            :label="visitMonthItems.length === 12 ? 'În ce lună?' : 'În ce luni?'"
            name="visitMonths"
          >
            <URadioGroup
              v-model="state.visitMonths"
              :items="visitMonthItems"
              :orientation="visitMonthItems.length > 4 ? 'horizontal' : 'vertical'"
              :ui="{ fieldset: visitMonthItems.length > 4 ? 'flex-wrap gap-x-4 gap-y-2' : '' }"
            />
          </UFormField>
        </template>

        <UFormField
          v-if="showResponsibles"
          label="Responsabili"
          name="responsibleIds"
          help="Colegii aleși vor vedea acest client și vor avea deplasările lui. Dacă nu alegi pe nimeni, rămân la tine."
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

        <UCollapsible class="rounded-lg border border-default" :default-open="isEdit">
          <UButton
            color="neutral"
            variant="ghost"
            block
            trailing-icon="i-lucide-chevron-down"
            label="Mai multe detalii (opțional)"
            class="justify-between"
            :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
          />
          <template #content>
            <div class="space-y-5 border-t border-default p-4">
              <UFormField label="Nr. Registrul Comerțului" name="tradeRegisterNumber">
                <UInput v-model="state.tradeRegisterNumber" placeholder="J40/1234/2020" class="w-full" />
              </UFormField>
              <UFormField label="Reprezentant legal" name="legalRepresentative">
                <UInput v-model="state.legalRepresentative" class="w-full" />
              </UFormField>
              <UFormField label="Email" name="email">
                <UInput
                  v-model="state.email"
                  type="email"
                  inputmode="email"
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
            </div>
          </template>
        </UCollapsible>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă clientul'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
