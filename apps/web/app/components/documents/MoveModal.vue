<script setup lang="ts">
import type { DocumentFolderDto } from '@alconst/shared'

/** Alegerea dosarului în care se mută un fișier sau un dosar, în cadrul aceleiași secțiuni. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  clientId: string | null
  sectionName: string
  /** Ce se mută. */
  itemName: string
  /** Dosarul în care se află acum (`null` = rădăcina secțiunii). */
  currentFolderId: string | null
  /** La mutarea unui dosar: el însuși, ca să nu poată fi ales el sau ce conține. */
  movingFolderId?: string
  save: (folderId: string | null) => Promise<void>
}>()

const api = useApi()
const ROOT = 'root'

const folders = ref<DocumentFolderDto[]>([])
const target = ref(ROOT)
const loading = ref(false)
const error = ref<string | null>(null)

const items = computed(() => [
  { label: `${props.sectionName} (fără dosar)`, value: ROOT },
  ...folderOptions(folders.value, props.movingFolderId).map(option => ({ label: option.label, value: option.id }))
])
const unchanged = computed(() => (target.value === ROOT ? null : target.value) === props.currentFolderId)

watch(open, async (isOpen) => {
  if (!isOpen) return
  error.value = null
  target.value = props.currentFolderId ?? ROOT
  try {
    folders.value = await api<DocumentFolderDto[]>('/documents/folders', { query: { clientId: props.clientId ?? undefined } })
  } catch (cause) {
    folders.value = []
    error.value = apiErrorMessage(cause)
  }
})

async function onSubmit() {
  loading.value = true
  error.value = null
  try {
    await props.save(target.value === ROOT ? null : target.value)
    open.value = false
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Mută în alt dosar"
    :description="itemName"
    :dismissible="!loading"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="onSubmit">
        <UFormField label="Destinație" :error="error ?? undefined">
          <USelect v-model="target" :items="items" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Renunță"
            :disabled="loading"
            @click="open = false"
          />
          <UButton
            type="submit"
            :loading="loading"
            :disabled="unchanged"
            label="Mută"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
