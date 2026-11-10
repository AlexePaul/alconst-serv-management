<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ContractDto, FeeFrequencyUnit } from '@alconst/shared'
import { monthlyEstimate } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru adăugarea sau modificarea unui contract, împreună cu tarifele lui. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  clientId: string
  contract: ContractDto | null
}>()

const emit = defineEmits<{ saved: [contract: ContractDto] }>()

const api = useApi()
const toast = useToast()

const isEdit = computed(() => props.contract !== null)

const NO_SERVICE = 'none'

const feeSchema = z
  .object({
    serviceId: z.string(),
    description: z.string().trim().max(300, 'Cel mult 300 de caractere.'),
    amount: z
      .number('Introdu suma.')
      .min(0, 'Suma nu poate fi negativă.')
      .multipleOf(0.01, 'Cel mult două zecimale.'),
    preset: z.string(),
    customUnit: z.enum(['WEEK', 'MONTH', 'YEAR']),
    customInterval: z.number('Introdu intervalul.').int('Număr întreg.').min(1, 'Cel puțin 1.').max(120, 'Cel mult 120.')
  })
  .refine(fee => fee.serviceId !== NO_SERVICE || fee.description.length > 0, {
    path: ['description'],
    message: 'Alege un serviciu sau completează o descriere.'
  })

const schema = z
  .object({
    number: z.string().trim().max(100).optional(),
    startDate: z.string('Alege data începerii.').min(1, 'Alege data începerii.'),
    endDate: z.string().optional(),
    status: z.enum(CONTRACT_STATUSES),
    notes: z.string().trim().max(5000).optional(),
    fees: z.array(feeSchema).max(30)
  })
  .refine(data => !data.endDate || data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Data expirării nu poate fi înaintea datei de începere.'
  })
type Schema = z.output<typeof schema>
type FeeState = Schema['fees'][number]

const state = reactive<{
  number: string
  startDate: string
  endDate: string
  status: Schema['status']
  notes: string
  fees: Partial<FeeState>[]
}>({ number: '', startDate: '', endDate: '', status: 'ACTIVE', notes: '', fees: [] })

const form = useTemplateRef('form')
const { loading, errorMessage, submit, reset } = useFormSubmit(form)

const { data: services, refresh: refreshServices } = useServices()

function serviceItems(currentId: string | undefined) {
  return [
    { label: 'Fără serviciu', value: NO_SERVICE },
    ...services.value
      .filter(service => service.isActive || service.id === currentId)
      .map(service => ({ label: service.name, value: service.id }))
  ]
}

const statusItems = CONTRACT_STATUSES.map(status => ({ label: CONTRACT_STATUS_LABELS[status], value: status }))
const presetItems = [
  ...FEE_FREQUENCY_PRESETS.map(preset => ({ label: preset.label, value: preset.value as string })),
  { label: 'Alt interval…', value: CUSTOM_FREQUENCY }
]
const customUnitItems = [
  { label: 'săptămâni', value: 'WEEK' },
  { label: 'luni', value: 'MONTH' },
  { label: 'ani', value: 'YEAR' }
]

function emptyFee(): Partial<FeeState> {
  return { serviceId: NO_SERVICE, description: '', amount: undefined, preset: 'MONTH:1', customUnit: 'MONTH', customInterval: 2 }
}

/** Frecvența efectivă a unui tarif, din opțiunea predefinită sau din intervalul liber. */
function frequencyOf(fee: Partial<FeeState>): { frequencyUnit: FeeFrequencyUnit, frequencyInterval: number } {
  const preset = FEE_FREQUENCY_PRESETS.find(item => item.value === fee.preset)
  if (preset) return { frequencyUnit: preset.unit, frequencyInterval: preset.interval }
  return { frequencyUnit: fee.customUnit ?? 'MONTH', frequencyInterval: fee.customInterval ?? 1 }
}

const estimate = computed(() =>
  monthlyEstimate(state.fees.map(fee => ({ amount: Number(fee.amount) || 0, ...frequencyOf(fee) })))
)
const hasNonRecurring = computed(() =>
  state.fees.some(fee => ['VISIT', 'ONCE'].includes(frequencyOf(fee).frequencyUnit))
)

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  refreshServices()
  const contract = props.contract
  state.number = contract?.number ?? ''
  state.startDate = contract?.startDate ?? new Date().toLocaleDateString('sv-SE')
  state.endDate = contract?.endDate ?? ''
  state.status = contract?.status ?? 'ACTIVE'
  state.notes = contract?.notes ?? ''
  state.fees = contract
    ? contract.fees.map((fee) => {
        const preset = frequencyPresetFor(fee.frequencyUnit, fee.frequencyInterval)
        const isCustom = preset === CUSTOM_FREQUENCY
        return {
          serviceId: fee.serviceId ?? NO_SERVICE,
          description: fee.description ?? '',
          amount: fee.amount,
          preset,
          customUnit: isCustom ? (fee.frequencyUnit as FeeState['customUnit']) : 'MONTH',
          customInterval: isCustom ? fee.frequencyInterval : 2
        }
      })
    : [emptyFee()]
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { fees, ...fields } = event.data
  const body = {
    ...fields,
    fees: fees.map(fee => ({
      serviceId: fee.serviceId === NO_SERVICE ? null : fee.serviceId,
      description: fee.description,
      amount: fee.amount,
      ...frequencyOf(fee)
    }))
  }
  await submit(async () => {
    const saved = props.contract
      ? await api<ContractDto>(`/contracts/${props.contract.id}`, { method: 'PATCH', body })
      : await api<ContractDto>('/contracts', { method: 'POST', body: { ...body, clientId: props.clientId } })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Contractul a fost adăugat',
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
    :title="isEdit ? 'Modifică contractul' : 'Adaugă contract'"
    description="Perioada contractului și sumele încasate de la client."
    :dismissible="!loading"
    :ui="{ content: 'sm:max-w-3xl' }"
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

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Număr contract" name="number">
            <UInput v-model="state.number" placeholder="ex. 12/2026" class="w-full" />
          </UFormField>
          <UFormField label="Status" name="status" required>
            <USelect v-model="state.status" :items="statusItems" class="w-full" />
          </UFormField>
          <UFormField label="Data începerii" name="startDate" required>
            <UInput v-model="state.startDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Data expirării" name="endDate" help="Lasă gol pentru perioadă nedeterminată.">
            <UInput v-model="state.endDate" type="date" class="w-full" />
          </UFormField>
        </div>

        <div>
          <div class="flex items-end justify-between gap-3">
            <div>
              <h3 class="text-sm font-medium text-highlighted">
                Tarife
              </h3>
              <p class="text-sm text-muted">
                Câte un rând pentru fiecare sumă încasată. Un contract poate combina mai multe frecvențe.
              </p>
            </div>
          </div>

          <div class="mt-3 space-y-3">
            <div
              v-for="(fee, index) in state.fees"
              :key="index"
              class="rounded-lg border border-default p-3 sm:p-4"
            >
              <div class="grid gap-3 sm:grid-cols-12">
                <UFormField label="Serviciu" :name="`fees.${index}.serviceId`" class="sm:col-span-4">
                  <USelect v-model="fee.serviceId" :items="serviceItems(fee.serviceId)" class="w-full" />
                </UFormField>
                <UFormField label="Descriere" :name="`fees.${index}.description`" class="sm:col-span-8">
                  <UInput v-model="fee.description" placeholder="ex. Abonament lunar, verificare trimestrială" class="w-full" />
                </UFormField>
                <UFormField
                  label="Sumă (lei)"
                  :name="`fees.${index}.amount`"
                  required
                  class="sm:col-span-4"
                >
                  <UInput
                    v-model.number="fee.amount"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Frecvență"
                  :name="`fees.${index}.preset`"
                  required
                  class="sm:col-span-4"
                >
                  <USelect v-model="fee.preset" :items="presetItems" class="w-full" />
                </UFormField>
                <div v-if="fee.preset === CUSTOM_FREQUENCY" class="sm:col-span-4">
                  <UFormField label="La fiecare" :name="`fees.${index}.customInterval`">
                    <div class="flex gap-2">
                      <UInput
                        v-model.number="fee.customInterval"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="120"
                        class="w-20"
                      />
                      <USelect v-model="fee.customUnit" :items="customUnitItems" class="min-w-0 flex-1" />
                    </div>
                  </UFormField>
                </div>
                <div class="flex items-end justify-end sm:col-span-4" :class="fee.preset === CUSTOM_FREQUENCY ? 'sm:col-span-12' : ''">
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    label="Șterge tariful"
                    @click="state.fees.splice(index, 1)"
                  />
                </div>
              </div>
            </div>

            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              label="Adaugă tarif"
              :disabled="state.fees.length >= 30"
              @click="state.fees.push(emptyFee())"
            />
          </div>

          <div v-if="state.fees.length > 0" class="mt-4 rounded-lg bg-elevated/60 px-4 py-3 text-sm">
            <p class="text-default">
              Venit lunar estimat: <span class="font-semibold text-highlighted">{{ formatMoney(estimate) }}</span>
            </p>
            <p v-if="hasNonRecurring" class="mt-0.5 text-muted">
              Tarifele „la fiecare deplasare” și cele unice nu intră în estimare.
            </p>
          </div>
        </div>

        <UFormField label="Observații" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <FormActions :submit-label="isEdit ? 'Salvează' : 'Adaugă contractul'" :loading="loading" @cancel="open = false" />
      </UForm>
    </template>
  </UModal>
</template>
