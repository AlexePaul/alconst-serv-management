import type { TaskDto } from '@alconst/shared'
import { isOpenTask } from '@alconst/shared'

/**
 * Bifa rapidă a unui task, folosită în listă, în calendar și pe pagina principală.
 *
 * Un task deschis este finalizat direct, cu două excepții în care se deschide întâi un dialog:
 *  - la o deplasare se întreabă dacă fișele au fost completate;
 *  - dacă au rămas nebifate apariții anterioare ale aceleiași obligații (ex. luna trecută a fost
 *    sărită), se întreabă dacă trebuie marcate și ele ca făcute.
 */
export function useTaskCompletion(onDone: () => unknown) {
  const api = useApi()
  const toast = useToast()

  const busyId = ref<string | null>(null)
  const dialogOpen = ref(false)
  const dialogTask = ref<TaskDto | null>(null)
  const skipped = ref<TaskDto[]>([])

  async function toggle(task: TaskDto) {
    busyId.value = task.id
    try {
      const open = isOpenTask(task.status)
      if (open) {
        // Dacă lista nu poate fi citită, task-ul se finalizează oricum, fără întrebarea suplimentară.
        const earlier = task.obligation
          ? await api<TaskDto[]>(`/tasks/${task.id}/skipped`).catch(() => [])
          : []
        if (task.kind === 'VISIT' || earlier.length > 0) {
          dialogTask.value = task
          skipped.value = earlier
          dialogOpen.value = true
          return
        }
      }
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: open ? 'DONE' : 'TODO' } })
      toast.add({
        title: open ? 'Activitate făcută' : 'Activitate redeschisă',
        description: task.title,
        color: 'success',
        icon: 'i-lucide-check'
      })
      await onDone()
    } catch (error) {
      toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      busyId.value = null
    }
  }

  return { toggle, busyId, dialogOpen, dialogTask, skipped }
}
