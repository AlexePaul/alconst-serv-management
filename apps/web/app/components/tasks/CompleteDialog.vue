<script setup lang="ts">
import type { TaskDto } from '@alconst/shared'
import { MAX_EMPLOYEE_COUNT } from '@alconst/shared'

/**
 * Finalizarea unui task atunci când este nevoie de o întrebare:
 *  - la o deplasare: au fost completate fișele? (poate fi finalizată și fără ele; rămâne atunci
 *    semnalată până la confirmare);
 *  - dacă au rămas nebifate apariții anterioare ale aceleiași obligații: le marcăm și pe ele ca
 *    făcute? Nu contează dacă au fost făcute atunci și doar nu au fost bifate sau au fost
 *    recuperate acum – important este că sunt făcute;
 *  - la o deplasare: câți angajați are acum clientul? Aplicația ține doar numărul, nu persoanele.
 */
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(defineProps<{
  task: TaskDto | null
  /** Aparițiile anterioare rămase nebifate, în ordine cronologică. */
  skipped?: TaskDto[]
}>(), { skipped: () => [] })
const emit = defineEmits<{ done: [] }>()

const api = useApi()
const toast = useToast()

const isVisit = computed(() => props.task?.kind === 'VISIT')
const includeSkipped = ref(true)
const loading = ref<'with' | 'without' | 'plain' | null>(null)

/** Numărul de angajați ai clientului, reconfirmat de cel care a fost acolo. */
const asksHeadcount = computed(() => isVisit.value && props.task?.client != null)
const headcount = ref<number | ''>('')
const headcountError = computed(() => {
  const value = headcount.value
  if (value === '') return null
  return Number.isInteger(value) && value >= 0 && value <= MAX_EMPLOYEE_COUNT ? null : 'Introdu un număr întreg, zero sau mai mare.'
})

watch(open, (value) => {
  if (!value) return
  includeSkipped.value = true
  headcount.value = props.task?.client?.employeeCount ?? ''
})

/** Perioada sărită (ex. „octombrie 2026”) sau, la termenele exacte, data. */
const skippedDates = computed(() => props.skipped.map(task => taskPeriodLabel(task) ?? formatDate(task.dueDate)).join(', '))
const skippedIntro = computed(() => {
  const one = props.skipped.length === 1
  if (isVisit.value) return one ? 'A rămas nebifată și deplasarea din' : 'Au rămas nebifate și deplasările din'
  return one ? 'A rămas nebifat și termenul din' : 'Au rămas nebifate și termenele din'
})
const skippedLabel = computed(() => {
  const one = props.skipped.length === 1
  if (isVisit.value) return one ? 'Este făcută și aceea – marcheaz-o ca finalizată' : 'Sunt făcute și acelea – marchează-le ca finalizate'
  return one ? 'Este făcut și acela – marchează-l ca finalizat' : 'Sunt făcute și acelea – marchează-le ca finalizate'
})

async function finish(sheetsCompleted?: boolean) {
  const current = props.task
  if (!current || headcountError.value) return
  const reported = asksHeadcount.value && typeof headcount.value === 'number' ? headcount.value : undefined
  loading.value = sheetsCompleted === undefined ? 'plain' : sheetsCompleted ? 'with' : 'without'
  // Întâi cele rămase din urmă, apoi task-ul curent; fiecare apare separat în istoricul lui.
  const targets = includeSkipped.value ? [...props.skipped, current] : [current]
  let finished = 0
  try {
    for (const target of targets) {
      await api(`/tasks/${target.id}`, {
        method: 'PATCH',
        body: {
          status: 'DONE',
          ...(target.kind === 'VISIT' && sheetsCompleted !== undefined ? { sheetsCompleted } : {}),
          // Numărul de angajați se trimite o singură dată, cu deplasarea curentă.
          ...(target.id === current.id && reported !== undefined ? { clientEmployeeCount: reported } : {})
        }
      })
      finished++
    }
    const extra = targets.length - 1
    const details = [
      extra > 0 ? `Împreună cu ${extra === 1 ? 'termenul rămas' : `cele ${extra} termene rămase`} din urmă.` : null,
      sheetsCompleted === undefined ? null : sheetsCompleted ? 'Fișele sunt marcate drept completate.' : 'Fișele rămân de confirmat.'
    ].filter(Boolean).join(' ')
    toast.add({
      title: isVisit.value ? 'Deplasare făcută' : 'Activitate făcută',
      description: details || current.title,
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
    emit('done')
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    // O parte a putut fi deja salvată: lista se reîncarcă, iar restul se poate relua.
    if (finished > 0) emit('done')
  } finally {
    loading.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isVisit ? 'Ai făcut deplasarea?' : 'Ai făcut activitatea?'"
    :description="task ? [task.title, task.client?.name, taskPeriodLabel(task) ?? formatDate(task.dueDate)].filter(Boolean).join(' · ') : undefined"
    :dismissible="loading === null"
  >
    <template #body>
      <div v-if="skipped.length > 0" class="mb-5 rounded-lg border border-warning/30 bg-warning/10 p-3">
        <p class="text-sm text-default">
          {{ skippedIntro }} <span class="font-medium text-highlighted">{{ skippedDates }}</span>.
        </p>
        <UCheckbox
          v-model="includeSkipped"
          class="mt-2"
          :label="skippedLabel"
          :disabled="loading !== null"
        />
      </div>

      <UFormField
        v-if="asksHeadcount"
        class="mb-5"
        label="Câți angajați are acum clientul?"
        :help="task?.client?.employeeCount == null ? 'Numărul nu a fost notat încă. Poți lăsa câmpul gol dacă nu îl știi.' : 'Schimbă numărul dacă au fost angajări sau plecări; altfel lasă-l așa.'"
        :error="headcountError ?? undefined"
      >
        <UInput
          v-model.number="headcount"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          class="w-32"
          :disabled="loading !== null"
          aria-label="Numărul de angajați ai clientului"
        />
      </UFormField>

      <template v-if="isVisit">
        <p class="text-sm text-default">
          Au fost completate fișele{{ skipped.length > 0 && includeSkipped ? '' : ' la această deplasare' }}?
        </p>
        <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <UButton
            color="neutral"
            variant="outline"
            label="Nu încă – finalizează fără fișe"
            :loading="loading === 'without'"
            :disabled="loading !== null && loading !== 'without'"
            @click="finish(false)"
          />
          <UButton
            icon="i-lucide-clipboard-check"
            label="Da, fișele sunt completate"
            :loading="loading === 'with'"
            :disabled="loading !== null && loading !== 'with'"
            @click="finish(true)"
          />
        </div>
      </template>
      <div v-else class="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="outline"
          label="Renunță"
          :disabled="loading !== null"
          @click="open = false"
        />
        <UButton
          icon="i-lucide-check"
          label="Finalizează"
          :loading="loading === 'plain'"
          @click="finish()"
        />
      </div>
    </template>
  </UModal>
</template>
