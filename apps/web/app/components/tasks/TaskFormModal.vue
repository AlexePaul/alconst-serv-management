<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { LocationDto, TaskDto, TaskKind } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru crearea unui task sau pentru vizualizarea și modificarea unuia existent. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** Task-ul editat; `null` pentru creare. */
  task: TaskDto | null
  /** Valori inițiale la creare (ex. din pagina unui client sau dintr-o zi a calendarului). */
  defaults?: { clientId?: string, clientName?: string, dueDate?: string, kind?: TaskKind }
}>()

const emit = defineEmits<{ saved: [task: TaskDto], deleted: [id: string] }>()

const api = useApi()
const toast = useToast()
const { user } = useAuth()

const isEdit = computed(() => props.task !== null)
const NONE = 'none'

const schema = z.object({
  title: z.string('Titlul este obligatoriu.').trim().min(1, 'Titlul este obligatoriu.').max(200),
  kind: z.enum(TASK_KINDS),
  clientId: z.string().optional(),
  locationId: z.string(),
  assigneeId: z.string(),
  dueDate: z.string('Alege termenul.').min(1, 'Alege termenul.'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  sheetsCompleted: z.boolean().optional(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  description: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional()
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
const statusItems = TASK_STATUSES.map(status => ({ label: TASK_STATUS_LABELS[status], value: status }))

// Punctele de lucru depind de clientul ales.
const locations = ref<LocationDto[]>([])

async function loadLocations(clientId: string | undefined) {
  locations.value = []
  if (!clientId) return
  try {
    locations.value = await api<LocationDto[]>('/locations', { query: { clientId } })
  } catch {
    // Un task atribuit poate aparține unui client la care utilizatorul nu are acces; lista rămâne goală.
  }
}

const locationItems = computed(() => {
  const items = [{ label: 'Fără punct de lucru', value: NONE }]
  for (const location of locations.value) {
    if (location.isActive || location.id === props.task?.location?.id) items.push({ label: location.name, value: location.id })
  }
  const current = props.task?.location
  if (current && !items.some(item => item.value === current.id)) items.push({ label: current.name, value: current.id })
  return items
})

watch(() => state.clientId, (clientId, previous) => {
  if (!open.value || clientId === previous) return
  state.locationId = NONE
  loadLocations(clientId)
})

watch(open, (isOpen) => {
  if (!isOpen) return
  reset()
  const task = props.task
  Object.assign(state, {
    title: task?.title ?? '',
    kind: task?.kind ?? props.defaults?.kind ?? 'GENERAL',
    clientId: task?.client?.id ?? props.defaults?.clientId,
    assigneeId: task ? (task.assignee?.id ?? NONE) : (user.value?.id ?? NONE),
    dueDate: task?.dueDate ?? props.defaults?.dueDate ?? todayLocal(),
    startTime: task?.startTime ?? '',
    endTime: task?.endTime ?? '',
    sheetsCompleted: task?.sheetsCompleted ?? false,
    priority: task?.priority ?? 'NORMAL',
    status: task?.status ?? 'TODO',
    description: task?.description ?? '',
    notes: task?.notes ?? ''
  })
  loadLocations(state.clientId).then(() => {
    state.locationId = task?.location?.id ?? NONE
  })
  // Setat și sincron, ca formularul să fie valid înainte de încărcarea punctelor de lucru.
  state.locationId = task?.location?.id ?? NONE
})

const contactLines = computed(() => {
  const task = props.task
  if (!task?.client) return []
  const address = task.location?.address ?? task.client.address
  return [
    address ? { label: task.location ? `Adresă (${task.location.name})` : 'Adresă', value: address, href: undefined } : null,
    task.client.contactPerson ? { label: 'Contact', value: task.client.contactPerson, href: undefined } : null,
    task.client.phone ? { label: 'Telefon', value: task.client.phone, href: `tel:${task.client.phone.replace(/\s+/g, '')}` } : null
  ].filter(line => line !== null)
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { clientId, locationId, assigneeId, sheetsCompleted, ...fields } = event.data
  const body = {
    ...fields,
    // Confirmarea fișelor se trimite doar la editarea unei deplasări.
    ...(isEdit.value && fields.kind === 'VISIT' ? { sheetsCompleted } : {}),
    clientId: clientId ?? null,
    locationId: locationId === NONE ? null : locationId,
    assigneeId: assigneeId === NONE ? null : assigneeId
  }
  await submit(async () => {
    const saved = props.task
      ? await api<TaskDto>(`/tasks/${props.task.id}`, { method: 'PATCH', body })
      : await api<TaskDto>('/tasks', { method: 'POST', body })
    emit('saved', saved)
    toast.add({
      title: isEdit.value ? 'Modificările au fost salvate' : 'Task-ul a fost creat',
      description: saved.title,
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
  })
}

// --- Ștergere (doar pentru task-urile create manual) -----------------------------------------

const deleteOpen = ref(false)
const deleting = ref(false)

async function confirmDelete() {
  if (!props.task) return
  deleting.value = true
  try {
    await api(`/tasks/${props.task.id}`, { method: 'DELETE' })
    emit('deleted', props.task.id)
    toast.add({ title: 'Task-ul a fost șters', color: 'success', icon: 'i-lucide-check' })
    deleteOpen.value = false
    open.value = false
  } catch (error) {
    toast.add({ title: 'Ștergerea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? 'Task' : 'Creează task'"
    :description="task?.obligation ? `Generat din obligația „${task.obligation.title}”` : isEdit ? 'Detalii, status și observații.' : 'Ce trebuie făcut, până când și de către cine.'"
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
          <UInput v-model="state.title" placeholder="ex. Deplasare lunară, verificare stingătoare" class="w-full" />
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Tip" name="kind" help="O deplasare înseamnă mers la client și completarea fișelor.">
            <USelect v-model="state.kind" :items="kindItems" class="w-full" />
          </UFormField>
          <UFormField label="Termen" name="dueDate" required>
            <UInput v-model="state.dueDate" type="date" class="w-full" />
          </UFormField>
        </div>

        <div class="grid grid-cols-2 gap-5">
          <UFormField label="De la ora" name="startTime" help="Opțional: intervalul în care estimezi că are loc.">
            <UInput v-model="state.startTime" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Până la ora" name="endTime">
            <UInput v-model="state.endTime" type="time" class="w-full" />
          </UFormField>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Client" name="clientId">
            <ClientsClientSelect
              v-model="state.clientId"
              placeholder="Fără client"
              clearable
              :initial-label="task?.client?.name ?? defaults?.clientName"
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

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            label="Responsabil"
            name="assigneeId"
            :help="task?.client ? 'Schimbă-l pentru a preda doar acest task unui coleg.' : undefined"
          >
            <USelect v-model="state.assigneeId" :items="assigneeItems" class="w-full" />
          </UFormField>
          <UFormField label="Prioritate" name="priority">
            <USelect v-model="state.priority" :items="priorityItems" class="w-full" />
          </UFormField>
        </div>

        <UFormField
          v-if="isEdit"
          label="Status"
          name="status"
          help="Generarea unui document nu finalizează task-ul; statusul se schimbă doar de aici."
        >
          <USelect v-model="state.status" :items="statusItems" class="w-full sm:w-64" />
        </UFormField>

        <!-- Unde merge și pe cine caută – util mai ales celui care preia o deplasare de la un coleg. -->
        <div v-if="task?.client && contactLines.length" class="rounded-lg bg-elevated/60 px-4 py-3 text-sm">
          <p class="font-medium text-highlighted">
            {{ task.client.name }}
          </p>
          <p v-for="line in contactLines" :key="line.label" class="text-muted">
            {{ line.label }}:
            <ULink v-if="line.href" :to="line.href" class="text-primary">
              {{ line.value }}
            </ULink>
            <span v-else class="text-default">{{ line.value }}</span>
          </p>
        </div>

        <UFormField
          v-if="isEdit && state.kind === 'VISIT'"
          name="sheetsCompleted"
          help="Aplicația ține doar evidența; fișele propriu-zise nu se încarcă aici."
        >
          <USwitch v-model="state.sheetsCompleted" label="Fișele au fost completate" />
        </UFormField>

        <UFormField label="Descriere" name="description">
          <UTextarea
            v-model="state.description"
            :rows="2"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="isEdit"
          label="Observații"
          name="notes"
          help="Ce s-a întâmplat pe parcurs: ce s-a discutat, ce a rămas de făcut."
        >
          <UTextarea
            v-model="state.notes"
            :rows="3"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UCollapsible v-if="task" class="rounded-lg border border-default">
          <UButton
            color="neutral"
            variant="ghost"
            block
            trailing-icon="i-lucide-chevron-down"
            label="Istoric modificări"
            class="justify-between"
            :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
          />
          <template #content>
            <div class="border-t border-default p-4">
              <TasksTaskHistory :task-id="task.id" />
            </div>
          </template>
        </UCollapsible>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2">
          <UButton
            v-if="task && !task.obligation"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            label="Șterge"
            :disabled="loading"
            @click="deleteOpen = true"
          />
          <span v-else />
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="outline"
              label="Renunță"
              :disabled="loading"
              @click="open = false"
            />
            <UButton type="submit" :loading="loading" :label="isEdit ? 'Salvează' : 'Creează task-ul'" />
          </div>
        </div>
      </UForm>

      <ConfirmDialog
        v-model:open="deleteOpen"
        title="Ștergi task-ul?"
        :description="`„${task?.title}” va fi șters definitiv. Dacă doar nu mai trebuie făcut, îl poți marca drept anulat.`"
        confirm-label="Șterge task-ul"
        color="error"
        :loading="deleting"
        @confirm="confirmDelete"
      />
    </template>
  </UModal>
</template>
