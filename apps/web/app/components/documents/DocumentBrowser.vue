<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { DocumentFileDto, DocumentFolderDto, DocumentListingDto, DocumentSettingsDto } from '@alconst/shared'
import { DEFAULT_MAX_UPLOAD_MB, documentUploadError, formatFileSize } from '@alconst/shared'

/**
 * Dosarele și fișierele unei secțiuni de documente: a unui client sau cea generală a firmei.
 * Folosit în pagina „Documente” și în fila „Documente” din pagina unui client.
 */
const props = defineProps<{
  /** Clientul căruia îi aparține secțiunea; `null` = secțiunea generală. */
  clientId: string | null
}>()

const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const toast = useToast()

const folderId = ref<string | null>(null)
const showArchived = ref(false)

watch(() => props.clientId, () => {
  folderId.value = null
  showArchived.value = false
})

const { data, status, error, refresh } = useLazyAsyncData(
  () => `documents:${props.clientId ?? 'general'}`,
  () => api<DocumentListingDto>('/documents', {
    query: {
      clientId: folderId.value ? undefined : (props.clientId ?? undefined),
      folderId: folderId.value ?? undefined,
      archived: showArchived.value || undefined
    }
  }),
  { watch: [() => props.clientId, folderId, showArchived] }
)
const { data: settings } = useLazyAsyncData('documents:settings', () => api<DocumentSettingsDto>('/documents/settings'))
const maxUploadMb = computed(() => settings.value?.maxUploadMb ?? DEFAULT_MAX_UPLOAD_MB)

const folders = computed(() => (showArchived.value ? [] : data.value?.folders ?? []))
const files = computed(() => data.value?.files ?? [])
const sectionName = computed(() => data.value?.section.name ?? '')
const isEmpty = computed(() => folders.value.length === 0 && files.value.length === 0)

async function reload() {
  await refresh()
  emit('changed')
}

function openFolder(id: string | null) {
  showArchived.value = false
  folderId.value = id
}

// --- Încărcare -------------------------------------------------------------------------------

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const uploading = ref<{ done: number, total: number } | null>(null)
const dragging = ref(false)

async function uploadFiles(list: FileList | File[] | null | undefined) {
  const selected = Array.from(list ?? [])
  if (selected.length === 0 || uploading.value) return
  uploading.value = { done: 0, total: selected.length }
  let uploaded = 0
  for (const file of selected) {
    // Aceleași verificări ca pe server, făcute înainte de a trimite fișierul.
    const problem = documentUploadError(file, maxUploadMb.value)
    try {
      if (problem) throw new Error(problem)
      await api('/documents/files', {
        method: 'POST',
        query: {
          name: file.name,
          clientId: folderId.value ? undefined : (props.clientId ?? undefined),
          folderId: folderId.value ?? undefined
        },
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      })
      uploaded++
    } catch (cause) {
      toast.add({
        title: `„${file.name}” nu a fost încărcat`,
        description: problem ?? apiErrorMessage(cause),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
    }
    uploading.value = { done: uploading.value.done + 1, total: selected.length }
  }
  uploading.value = null
  if (fileInput.value) fileInput.value.value = ''
  if (uploaded > 0) {
    toast.add({
      title: uploaded === 1 ? 'Fișierul a fost încărcat' : `${uploaded} fișiere au fost încărcate`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    await reload()
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  uploadFiles(event.dataTransfer?.files)
}

// --- Dosare și fișiere -----------------------------------------------------------------------

const nameOpen = ref(false)
const nameModal = ref<{ title: string, initial?: string, extension?: string, confirmLabel?: string, save: (name: string) => Promise<void> }>({
  title: '',
  save: async () => {}
})
const moveOpen = ref(false)
const moveModal = ref<{ itemName: string, currentFolderId: string | null, movingFolderId?: string, save: (folderId: string | null) => Promise<void> }>({
  itemName: '',
  currentFolderId: null,
  save: async () => {}
})

function success(title: string, description?: string) {
  toast.add({ title, description, color: 'success', icon: 'i-lucide-check' })
}

function failure(cause: unknown) {
  toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(cause), color: 'error', icon: 'i-lucide-circle-alert' })
}

function createFolder() {
  nameModal.value = {
    title: 'Dosar nou',
    confirmLabel: 'Creează dosarul',
    save: async (name) => {
      await api('/documents/folders', {
        method: 'POST',
        body: { name, clientId: props.clientId, parentId: folderId.value }
      })
      success('Dosarul a fost creat', name)
      await reload()
    }
  }
  nameOpen.value = true
}

function renameFolder(folder: DocumentFolderDto) {
  nameModal.value = {
    title: 'Redenumește dosarul',
    initial: folder.name,
    save: async (name) => {
      await api(`/documents/folders/${folder.id}`, { method: 'PATCH', body: { name } })
      await reload()
    }
  }
  nameOpen.value = true
}

function moveFolder(folder: DocumentFolderDto) {
  moveModal.value = {
    itemName: folder.name,
    currentFolderId: folder.parentId,
    movingFolderId: folder.id,
    save: async (parentId) => {
      await api(`/documents/folders/${folder.id}`, { method: 'PATCH', body: { parentId } })
      success('Dosarul a fost mutat', folder.name)
      await reload()
    }
  }
  moveOpen.value = true
}

async function deleteFolder(folder: DocumentFolderDto) {
  try {
    await api(`/documents/folders/${folder.id}`, { method: 'DELETE' })
    success('Dosarul a fost șters', folder.name)
    await reload()
  } catch (cause) {
    failure(cause)
  }
}

function renameFile(file: DocumentFileDto) {
  nameModal.value = {
    title: 'Redenumește fișierul',
    initial: file.name,
    extension: file.extension,
    save: async (name) => {
      await api(`/documents/files/${file.id}`, { method: 'PATCH', body: { name } })
      await reload()
    }
  }
  nameOpen.value = true
}

function moveFile(file: DocumentFileDto) {
  moveModal.value = {
    itemName: file.name,
    currentFolderId: file.folderId,
    save: async (target) => {
      await api(`/documents/files/${file.id}`, { method: 'PATCH', body: { folderId: target } })
      success('Fișierul a fost mutat', file.name)
      await reload()
    }
  }
  moveOpen.value = true
}

// Fișierele nu se șterg: cele de care nu mai este nevoie se arhivează și pot fi restaurate.
async function setArchived(file: DocumentFileDto, archived: boolean) {
  try {
    await api(`/documents/files/${file.id}`, { method: 'PATCH', body: { archived } })
    success(archived ? 'Fișierul a fost arhivat' : 'Fișierul a fost restaurat', file.name)
    if (!archived && data.value?.archivedCount === 1) showArchived.value = false
    await reload()
  } catch (cause) {
    failure(cause)
  }
}

function folderActions(folder: DocumentFolderDto): DropdownMenuItem[][] {
  return [
    [
      { label: 'Redenumește', icon: 'i-lucide-pencil', onSelect: () => renameFolder(folder) },
      { label: 'Mută', icon: 'i-lucide-folder-input', onSelect: () => moveFolder(folder) }
    ],
    // Doar un dosar gol poate fi șters; unul cu conținut nu are ce pierde dacă este mutat.
    ...(folder.itemCount === 0
      ? [[{ label: 'Șterge dosarul gol', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteFolder(folder) } }]]
      : [])
  ]
}

function fileActions(file: DocumentFileDto): DropdownMenuItem[][] {
  return [
    [{ label: 'Descarcă', icon: 'i-lucide-download', to: documentDownloadUrl(file.id), external: true, download: file.name }],
    [
      { label: 'Redenumește', icon: 'i-lucide-pencil', onSelect: () => renameFile(file) },
      { label: 'Mută', icon: 'i-lucide-folder-input', onSelect: () => moveFile(file) }
    ],
    [file.archivedAt
      ? { label: 'Restaurează', icon: 'i-lucide-archive-restore', onSelect: () => { setArchived(file, false) } }
      : { label: 'Arhivează', icon: 'i-lucide-archive', onSelect: () => { setArchived(file, true) } }]
  ]
}

function fileDetails(file: DocumentFileDto): string {
  return [
    formatFileSize(file.sizeBytes),
    file.uploadedBy ? `${file.uploadedBy.firstName} ${file.uploadedBy.lastName}` : null,
    formatDateTime(file.createdAt)
  ].filter(Boolean).join(' · ')
}
</script>

<template>
  <div
    class="relative"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <nav class="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm" aria-label="Dosarul curent">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded px-1.5 py-1 font-medium hover:bg-elevated"
          :class="data?.breadcrumbs.length ? 'text-muted' : 'text-highlighted'"
          @click="openFolder(null)"
        >
          <UIcon :name="clientId ? 'i-lucide-building-2' : 'i-lucide-library'" class="size-4 shrink-0" />
          <span class="truncate">{{ sectionName || '…' }}</span>
        </button>
        <template v-for="(crumb, index) in data?.breadcrumbs ?? []" :key="crumb.id">
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          <button
            type="button"
            class="truncate rounded px-1.5 py-1 font-medium hover:bg-elevated"
            :class="index === (data?.breadcrumbs.length ?? 0) - 1 ? 'text-highlighted' : 'text-muted'"
            @click="openFolder(crumb.id)"
          >
            {{ crumb.name }}
          </button>
        </template>
      </nav>

      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-folder-plus"
        label="Dosar nou"
        @click="createFolder"
      />
      <UButton
        icon="i-lucide-upload"
        :label="uploading ? `Se încarcă ${uploading.done + 1}/${uploading.total}…` : 'Încarcă fișiere'"
        :loading="uploading !== null"
        @click="fileInput?.click()"
      />
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        aria-label="Alege fișierele de încărcat"
        @change="uploadFiles(($event.target as HTMLInputElement).files)"
      >
    </div>

    <UEmpty
      v-if="error"
      icon="i-lucide-cloud-off"
      title="Documentele nu au putut fi încărcate"
      :description="apiErrorMessage(error.cause ?? error)"
      :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
      variant="naked"
    />

    <div v-else-if="status === 'pending' && !data" class="space-y-2">
      <USkeleton v-for="index in 3" :key="index" class="h-14 w-full" />
    </div>

    <template v-else>
      <UAlert
        v-if="showArchived"
        class="mb-3"
        color="neutral"
        variant="subtle"
        icon="i-lucide-archive"
        title="Fișiere arhivate din acest dosar"
        description="Rămân în evidență și pot fi descărcate sau restaurate."
        :actions="[{ label: 'Înapoi la fișierele curente', color: 'neutral', variant: 'outline', onClick: () => { showArchived = false } }]"
      />

      <UEmpty
        v-if="isEmpty"
        icon="i-lucide-folder-open"
        :title="showArchived ? 'Niciun fișier arhivat' : 'Dosarul este gol'"
        :description="showArchived ? undefined : `Trage fișiere aici sau folosește „Încarcă fișiere”. Dimensiunea maximă a unui fișier: ${maxUploadMb} MB.`"
        variant="naked"
      />

      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-default">
        <li v-for="folder in folders" :key="folder.id" class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openFolder(folder.id)">
            <UIcon name="i-lucide-folder" class="size-5 shrink-0 text-primary" />
            <span class="min-w-0">
              <span class="block truncate font-medium text-highlighted">{{ folder.name }}</span>
              <span class="block text-xs text-muted">{{ folder.itemCount === 0 ? 'Gol' : countLabel(folder.itemCount, 'element', 'elemente') }}</span>
            </span>
          </button>
          <UDropdownMenu :items="folderActions(folder)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru dosarul ${folder.name}`"
            />
          </UDropdownMenu>
        </li>
        <li v-for="file in files" :key="file.id" class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <a
            :href="documentDownloadUrl(file.id)"
            :download="file.name"
            class="flex min-w-0 flex-1 items-center gap-3"
            :title="`Descarcă ${file.name}`"
          >
            <UIcon :name="documentIcon(file.extension)" class="size-5 shrink-0 text-muted" />
            <span class="min-w-0">
              <span class="block truncate font-medium" :class="file.archivedAt ? 'text-muted' : 'text-highlighted'">{{ file.name }}</span>
              <span class="block truncate text-xs text-muted">{{ fileDetails(file) }}</span>
            </span>
          </a>
          <UDropdownMenu :items="fileActions(file)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              :aria-label="`Acțiuni pentru ${file.name}`"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <UButton
        v-if="!showArchived && (data?.archivedCount ?? 0) > 0"
        class="mt-3"
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-archive"
        :label="`Arată fișierele arhivate din acest dosar (${data?.archivedCount})`"
        @click="showArchived = true"
      />
    </template>

    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10"
    >
      <p class="flex items-center gap-2 font-medium text-primary">
        <UIcon name="i-lucide-upload" class="size-5" />Lasă fișierele aici pentru a le încărca
      </p>
    </div>

    <DocumentsNameModal
      v-model:open="nameOpen"
      :title="nameModal.title"
      :initial="nameModal.initial"
      :extension="nameModal.extension"
      :confirm-label="nameModal.confirmLabel"
      :save="nameModal.save"
    />
    <DocumentsMoveModal
      v-model:open="moveOpen"
      :client-id="clientId"
      :section-name="sectionName"
      :item-name="moveModal.itemName"
      :current-folder-id="moveModal.currentFolderId"
      :moving-folder-id="moveModal.movingFolderId"
      :save="moveModal.save"
    />
  </div>
</template>
