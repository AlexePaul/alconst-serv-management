<script setup lang="ts">
import type { DocumentSearchResultDto, DocumentSectionDto } from '@alconst/shared'
import { formatFileSize, normalizeSearch } from '@alconst/shared'

/**
 * Documente: câte o secțiune pentru fiecare client, plus una generală a firmei.
 * În fiecare secțiune, fișierele sunt organizate pe dosare.
 */
useHead({ title: 'Documente' })

const api = useApi()
const route = useRoute()
const router = useRouter()

const GENERAL = 'general'

/** Secțiunea deschisă: `undefined` = lista secțiunilor, `null` = generală, altfel ID-ul clientului. */
const openSection = computed<string | null | undefined>(() => {
  const value = route.query.sectiune
  if (typeof value !== 'string' || value === '') return undefined
  return value === GENERAL ? null : value
})

function goTo(section: string | null | undefined) {
  router.push({ query: section === undefined ? {} : { sectiune: section ?? GENERAL } })
}

const { data: sections, status, error, refresh } = useLazyAsyncData(
  'documents:sections',
  () => api<DocumentSectionDto[]>('/documents/sections'),
  { default: () => [] }
)

const search = ref('')
const debouncedSearch = useDebounced(search)
const term = computed(() => debouncedSearch.value.trim())

/** Secțiunile al căror nume se potrivește cu textul căutat. */
const visibleSections = computed(() => {
  const wanted = normalizeSearch(term.value)
  return wanted ? sections.value.filter(section => normalizeSearch(section.name).includes(wanted)) : sections.value
})

/** Fișierele al căror nume se potrivește, din toate secțiunile vizibile. */
const { data: found, status: searchStatus } = useLazyAsyncData(
  'documents:search',
  () => term.value.length >= 2 ? api<DocumentSearchResultDto[]>('/documents/search', { query: { q: term.value } }) : Promise.resolve([]),
  { watch: [term], default: () => [] }
)

function location(result: DocumentSearchResultDto): string {
  return [result.sectionName, ...result.path].join(' / ')
}
</script>

<template>
  <UDashboardPanel id="documents">
    <template #header>
      <UDashboardNavbar title="Documente">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <!-- O secțiune deschisă: dosarele și fișierele ei -->
        <template v-if="openSection !== undefined">
          <UButton
            class="mb-4 -ml-2"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Toate secțiunile"
            @click="goTo(undefined)"
          />
          <DocumentsDocumentBrowser :client-id="openSection" @changed="refresh()" />
        </template>

        <!-- Lista secțiunilor -->
        <template v-else>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Caută un client sau un fișier"
            aria-label="Caută în documente"
            class="mb-4 w-full sm:w-96"
          />

          <section v-if="term.length >= 2" class="mb-8">
            <h2 class="mb-2 text-sm font-semibold text-highlighted">
              Fișiere
            </h2>
            <p v-if="searchStatus === 'pending'" class="text-sm text-muted">
              Se caută…
            </p>
            <p v-else-if="found.length === 0" class="text-sm text-muted">
              Niciun fișier cu acest nume.
            </p>
            <ul v-else class="divide-y divide-default rounded-lg border border-default bg-default">
              <li v-for="result in found" :key="result.id" class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <a
                  :href="documentDownloadUrl(result.id)"
                  :download="result.name"
                  class="flex min-w-0 flex-1 items-center gap-3"
                  :title="`Descarcă ${result.name}`"
                >
                  <UIcon :name="documentIcon(result.extension)" class="size-5 shrink-0 text-muted" />
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-highlighted">{{ result.name }}</span>
                    <span class="block truncate text-xs text-muted">{{ location(result) }} · {{ formatFileSize(result.sizeBytes) }}</span>
                  </span>
                </a>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-folder-open"
                  :aria-label="`Deschide secțiunea ${result.sectionName}`"
                  @click="goTo(result.clientId)"
                />
              </li>
            </ul>
          </section>

          <h2 v-if="term" class="mb-2 text-sm font-semibold text-highlighted">
            Secțiuni
          </h2>

          <UEmpty
            v-if="error"
            icon="i-lucide-cloud-off"
            title="Secțiunile nu au putut fi încărcate"
            :description="apiErrorMessage(error.cause ?? error)"
            :actions="[{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
            variant="naked"
          />
          <div v-else-if="status === 'pending' && sections.length === 0" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <USkeleton v-for="index in 6" :key="index" class="h-16 w-full" />
          </div>
          <p v-else-if="visibleSections.length === 0" class="text-sm text-muted">
            Nicio secțiune cu acest nume.
          </p>
          <ul v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="section in visibleSections" :key="section.clientId ?? GENERAL">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-lg border border-default bg-default p-3 text-left transition-colors hover:border-accented hover:bg-elevated/50"
                :class="{ 'opacity-70': !section.isActive }"
                @click="goTo(section.clientId)"
              >
                <span class="flex size-10 shrink-0 items-center justify-center rounded-lg" :class="section.clientId ? 'bg-elevated text-muted' : 'bg-primary/10 text-primary'">
                  <UIcon :name="section.clientId ? 'i-lucide-folder' : 'i-lucide-library'" class="size-5" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-highlighted">{{ section.name }}</span>
                  <span class="block text-xs text-muted">
                    {{ section.fileCount === 0 ? 'Niciun fișier' : countLabel(section.fileCount, 'fișier', 'fișiere') }}{{ section.isActive ? '' : ' · client arhivat' }}
                  </span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
              </button>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
