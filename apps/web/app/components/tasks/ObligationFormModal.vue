<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { LocationDto, ObligationDto, RecurrenceUnit } from '@alconst/shared'
import { alignToMonthCycle, formatMonthList, monthCycleOptions, occurrencesBetween, recurrenceMonths } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unei obligații recurente. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  obligation: ObligationDto | null
  defaults?: { clientId?: string, clientName?: string }
}>()

const emit = defineEmits<{ saved: [obligation: ObligationDto] }>()

const api = useApi()
const toast = useToast()
const { user } = useAuth()

const isEdit = computed(() => props.obligation !== null)
const NONE = 'none'

const schema = z
  .object({
    title: z.string('Titlul este obligatoriu.').trim().min(1, 'Titlul este obligatoriu.').max(200),
    kind: z.enum(TASK_KINDS),
    clientId: z.string().optional(),
    locationId: z.string(),
    assigneeId: z.string(),
    priority: z.enum(TASK_PRIORITIES),
    preset: z.string(),
    customUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
    customInterval: z.number('Introdu intervalul.').int('Număr întreg.').min(1, 'Cel puțin 1.').max(120, 'Cel mult 120.'),
    startDate: z.string('Alege primul termen.').min(1, 'Alege primul termen.'),
    endDate: z.string().optional(),
    dueWithinPeriod: z.boolean(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    description: z.string().trim().max(5000).optional(),
    isActive: z.boolean()
  })
  .refine(data => !data.endDate || data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Data de sfârșit nu poate fi înaintea primului termen.'
  })
  .refine(data => !data.endTime || Boolean(data.startTime), {
    path: ['startTime'],
    message: 'Completează și ora de început.'
  })
  .refine(data => !data.startTime || !data.endTime || data.endTime > data.startTime, {
    path: ['endTime'],
    message: 'Trebuie să fie după ora de început.'
  })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

const { data: users } = useUserOptions()
const assigneeItems = computed(() => [
  { label: 'Fără responsabil', value: NONE },
  ...users.value.map(option => ({ label: `${option.firstName} ${option.lastName}`, value: option.id }))
])
const kindItems = TASK_KINDS.map(kind => ({ label: TASK_KIND_LABELS[kind], value: kind }))
const priorityItems = TASK_PRIORITIES.map(priority => ({ label: TASK_PRIORITY_LABELS[priority], value: priority }))
const presetItems = [
  ...RECURRENCE_PRESETS.map(preset => ({ label: preset.label, value: preset.value as string })),
  { label: 'Alt interval…', value: CUSTOM_RECURRENCE }
]
const customUnitItems = [
  { label: 'zile', value: 'DAY' },
  { label: 'săptămâni', value: 'WEEK' },
  { label: 'luni', value: 'MONTH' },
  { label: 'ani', value: 'YEAR' }
]

const locations = ref<LocationDto[]>([])

async function loadLocations(clientId: string | undefined) {
  locations.value = []
  if (!clientId) return
  try {
    locations.value = await api<LocationDto[]>('/locations', { query: { clientId } })
  } catch {
    // Fără acces la client nu există puncte de lucru de ales.
  }
}

const locationItems = computed(() => {
  const items = [{ label: 'Fără punct de lucru', value: NONE }]
  for (const location of locations.value) {
    if (location.isActive || location.id === props.obligation?.location?.id) items.push({ label: location.name, value: location.id })
  }
  return items
})

watch(() => state.clientId, (clientId, previous) => {
  if (!open.value || clientId === previous) return
  state.locationId = NONE
  loadLocations(clientId)
})

/** Frecvența efectivă, din opțiunea predefinită sau din intervalul liber. */
const recurrence = computed<{ unit: RecurrenceUnit, interval: number }>(() => {
  const preset = RECURRENCE_PRESETS.find(item => item.value === state.preset)
  return preset
    ? { unit: preset.unit, interval: preset.interval }
    : { unit: state.customUnit ?? 'MONTH', interval: Number(state.customInterval) || 1 }
})

/**
 * Lunile în care cade obligația (ex. la 3 luni: ianuarie–aprilie–iulie–octombrie sau una dintre
 * celelalte două variante). Sunt date de prima dată; alegerea altei variante o mută în luna
 * potrivită, păstrând ziua.
 */
const monthOptions = computed(() =>
  monthCycleOptions(recurrence.value.unit, recurrence.value.interval).map(months => ({
    label: formatMonthList(months),
    value: String(months[0]),
    months
  }))
)
const selectedMonths = computed(() => {
  const months = state.startDate ? recurrenceMonths(recurrence.value.unit, recurrence.value.interval, state.startDate) : null
  return months ? String(months[0]) : undefined
})

function chooseMonths(value: string) {
  const option = monthOptions.value.find(item => item.value === value)
  if (option) state.startDate = alignToMonthCycle(state.startDate || todayLocal(), option.months, todayLocal())
}

/** Perioada în care un termen flexibil poate fi îndeplinit; frecvențele în zile nu au una. */
const periodName = computed(() => {
  const unit = recurrence.value.unit
  return unit === 'DAY' ? null : unit === 'WEEK' ? 'săptămânii' : 'lunii'
})

/** Primele termene rezultate din frecvența aleasă, pentru verificare înainte de salvare. */
const preview = computed(() => {
  if (!state.startDate) return []
  const today = todayLocal()
  const from = state.startDate > today ? state.startDate : today
  return occurrencesBetween(
    { startDate: state.startDate, endDate: state.endDate || null, unit: recurrence.value.unit, interval: recurrence.value.interval },
    from,
    '9999-12-31',
    4
  )
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const obligation = props.obligation
  const preset = obligation ? recurrencePresetFor(obligation.recurrenceUnit, obligation.recurrenceInterval) : 'MONTH:1'
  const isCustom = preset === CUSTOM_RECURRENCE
  Object.assign(state, {
    title: obligation?.title ?? '',
    kind: obligation?.kind ?? 'VISIT',
    clientId: obligation?.client?.id ?? props.defaults?.clientId,
    assigneeId: obligation ? (obligation.assignee?.id ?? NONE) : (user.value?.id ?? NONE),
    priority: obligation?.priority ?? 'NORMAL',
    preset,
    customUnit: isCustom && obligation ? obligation.recurrenceUnit : 'MONTH',
    customInterval: isCustom && obligation ? obligation.recurrenceInterval : 2,
    startDate: obligation?.startDate ?? todayLocal(),
    endDate: obligation?.endDate ?? '',
    dueWithinPeriod: obligation?.dueWithinPeriod ?? true,
    startTime: obligation?.startTime ?? '',
    endTime: obligation?.endTime ?? '',
    description: obligation?.description ?? '',
    isActive: obligation?.isActive ?? true
  })
  loadLocations(state.clientId).then(() => {
    state.locationId = obligation?.location?.id ?? NONE
  })
  state.locationId = obligation?.location?.id ?? NONE
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { clientId, locationId, assigneeId, preset: _preset, customUnit: _unit, customInterval: _interval, ...fields } = event.data
  const body = {
    ...fields,
    clientId: clientId ?? null,
    locationId: locationId === NONE ? null : locationId,
    assigneeId: assigneeId === NONE ? null : assigneeId,
    recurrenceUnit: recurrence.value.unit,
    recurrenceInterval: recurrence.value.interval
  }
  await submit(async () => {
    const saved = props.obligation
      ? await api<ObligationDto>(`/obligations/${props.obligation.id}`, { method: 'PATCH', body })
      : await api<ObligationDto>('/obligations', { method: 'POST', body })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Obligația a fost adăugată',
      description: countLabel(saved.openTaskCount, 'task deschis', 'task-uri deschise'),
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
    :title="isEdit ? 'Modifică obligația' : 'Adaugă obligație'"
    description="O activitate care se repetă. Task-urile se creează automat, cu termen și responsabil."
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

        <UFormField label="Titlu" name="title" required>
          <UInput v-model="state.title" placeholder="ex. Deplasare lunară, instruire periodică" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Tip" name="kind">
            <USelect v-model="state.kind" :items="kindItems" class="w-full" />
          </UFormField>
          <UFormField label="Prioritate" name="priority">
            <USelect v-model="state.priority" :items="priorityItems" class="w-full" />
          </UFormField>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Client" name="clientId">
            <ClientsClientSelect
              v-model="state.clientId"
              placeholder="Fără client"
              clearable
              :initial-label="obligation?.client?.name ?? defaults?.clientName"
            />
          </UFormField>
          <UFormField label="Punct de lucru" name="locationId">
            <USelect
              v-model="state.locationId"
              :items="locationItems"
              :disabled="!state.clientId"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Responsabil" name="assigneeId" help="Primește task-urile generate și reamintirile de termen.">
          <USelect v-model="state.assigneeId" :items="assigneeItems" class="w-full sm:w-72" />
        </UFormField>

        <USeparator label="Frecvență" />

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Se repetă" name="preset" required>
            <USelect v-model="state.preset" :items="presetItems" class="w-full" />
          </UFormField>
          <UFormField v-if="state.preset === CUSTOM_RECURRENCE" label="La fiecare" name="customInterval">
            <div class="flex gap-2">
              <UInput
                v-model.number="state.customInterval"
                type="number"
                inputmode="numeric"
                min="1"
                max="120"
                class="w-20"
              />
              <USelect v-model="state.customUnit" :items="customUnitItems" class="min-w-0 flex-1" />
            </div>
          </UFormField>
        </div>

        <UFormField
          v-if="monthOptions.length > 0"
          :label="monthOptions.length === 12 ? 'În ce lună' : 'În ce luni'"
          help="Alege lunile potrivite pentru acest client. Prima dată de mai jos se mută singură în prima dintre ele, începând cu luna curentă."
        >
          <URadioGroup
            :model-value="selectedMonths"
            :items="monthOptions"
            :orientation="monthOptions.length > 4 ? 'horizontal' : 'vertical'"
            :ui="{ fieldset: monthOptions.length > 4 ? 'flex-wrap gap-x-4 gap-y-2' : '' }"
            aria-label="Lunile în care se face"
            @update:model-value="chooseMonths(String($event))"
          />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            label="Prima dată"
            name="startDate"
            required
            help="Următoarele se calculează de la această dată (aceeași zi din lună sau din săptămână)."
          >
            <UInput v-model="state.startDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Se încheie la" name="endDate" help="Lasă gol dacă nu are sfârșit.">
            <UInput v-model="state.endDate" type="date" class="w-full" />
          </UFormField>
        </div>

        <UFormField
          v-if="periodName"
          name="dueWithinPeriod"
          :help="state.dueWithinPeriod
            ? `Data este doar ziua planificată. Devine restanță abia dacă nu a fost făcută până la sfârșitul ${periodName}.`
            : 'Devine restanță din ziua următoare termenului.'"
        >
          <USwitch v-model="state.dueWithinPeriod" :label="`Poate fi făcută oricând în ${periodName === 'lunii' ? 'luna' : 'săptămâna'} respectivă`" />
        </UFormField>

        <div class="grid grid-cols-2 gap-5">
          <UFormField label="De la ora" name="startTime" help="Opțional. Fiecare deplasare poate fi mutată apoi separat.">
            <UInput v-model="state.startTime" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Până la ora" name="endTime">
            <UInput v-model="state.endTime" type="time" class="w-full" />
          </UFormField>
        </div>

        <div v-if="preview.length > 0" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm">
          <p class="text-muted">
            Următoarele date planificate
          </p>
          <p class="mt-0.5 font-medium text-highlighted">
            {{ preview.map(formatDate).join(' · ') }}
          </p>
        </div>

        <UFormField label="Descriere" name="description" help="Se copiază în fiecare task generat.">
          <UTextarea
            v-model="state.description"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="isEdit" name="isActive" help="O obligație inactivă nu mai generează task-uri; cele viitoare neîncepute sunt șterse.">
          <USwitch v-model="state.isActive" label="Obligație activă" />
        </UFormField>

        <UAlert
          v-if="isEdit"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Modificările se aplică task-urilor viitoare neîncepute. Cele începute, finalizate sau anulate rămân neschimbate."
        />

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă obligația'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
