<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import type { ClientDto } from '@alconst/shared'
import { FetchError } from 'ofetch'

const route = useRoute()
const api = useApi()
const toast = useToast()
const { user: currentUser, isAdmin } = useAuth()

const clientId = computed(() => String(route.params.id))

const { data: client, error, refresh } = useLazyAsyncData(
  () => `client:${clientId.value}`,
  () => api<ClientDto>(`/clients/${clientId.value}`)
)

useHead({ title: computed(() => client.value?.name ?? 'Client') })

const notFound = computed(() => {
  const cause = error.value?.cause ?? error.value
  return cause instanceof FetchError && (cause.status === 404 || cause.status === 400)
})

// --- File -------------------------------------------------------------------------------------

const tab = ref('details')
/** Lista de task-uri se reîncarcă atunci când o obligație generează sau șterge task-uri. */
const tasksList = useTemplateRef('tasksList')
const tabs = computed<TabsItem[]>(() => [
  { label: 'Detalii', value: 'details', icon: 'i-lucide-info', slot: 'details' },
  { label: 'Puncte de lucru', value: 'locations', icon: 'i-lucide-map-pin', badge: client.value?.locationCount || undefined, slot: 'locations' },
  { label: 'Contracte', value: 'contracts', icon: 'i-lucide-file-signature', slot: 'contracts' },
  { label: 'Activități', value: 'activities', icon: 'i-lucide-list-checks', slot: 'activities' }
])

// --- Acțiuni ---------------------------------------------------------------------------------

const editOpen = ref(false)
const servicesOpen = ref(false)
const responsiblesOpen = ref(false)
const statusOpen = ref(false)
const busy = ref(false)

function onSaved(saved: ClientDto) {
  client.value = saved
}

async function toggleStatus() {
  if (!client.value) return
  busy.value = true
  try {
    const saved = await api<ClientDto>(`/clients/${client.value.id}`, {
      method: 'PATCH',
      body: { isActive: !client.value.isActive }
    })
    client.value = saved
    toast.add({ title: saved.isActive ? 'Clientul a fost reactivat' : 'Clientul a fost arhivat', color: 'success', icon: 'i-lucide-check' })
    statusOpen.value = false
    // Arhivarea retrage task-urile viitoare ale obligațiilor, iar reactivarea le generează din nou.
    await tasksList.value?.refresh()
  } catch (error) {
    toast.add({ title: 'Operațiunea nu a reușit', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

function askStatusChange() {
  statusOpen.value = true
}

// --- Predare către alt responsabil ------------------------------------------------------------

const transferOpen = ref(false)
/** Administratorii pot transfera orice client care are un responsabil; angajații, doar pe ai lor. */
const canTransfer = computed(() => {
  const responsibles = client.value?.responsibles ?? []
  return isAdmin.value ? responsibles.length > 0 : responsibles.some(user => user.id === currentUser.value?.id)
})

function askTransfer() {
  transferOpen.value = true
}

/** Cererile de predare în așteptare pentru acest client. */
const { data: transferRequests, refresh: refreshTransfers } = useClientTransfers()
const pendingTransfers = computed(() => transferRequests.value.filter(request => request.client.id === clientId.value))

async function onTransferred() {
  await Promise.all([refresh(), refreshTransfers()])
}

const moreActions = computed<DropdownMenuItem[][]>(() => {
  // Clienții nu se șterg: cei cu care colaborarea a încetat se arhivează și rămân în evidență.
  const items: DropdownMenuItem[][] = [[
    ...(canTransfer.value ? [{ label: 'Predă clientul altui coleg', icon: 'i-lucide-arrow-left-right', onSelect: askTransfer }] : []),
    client.value?.isActive
      ? { label: 'Arhivează clientul', icon: 'i-lucide-archive', onSelect: askStatusChange }
      : { label: 'Reactivează clientul', icon: 'i-lucide-archive-restore', onSelect: askStatusChange }
  ]]
  return items
})
</script>

<template>
  <UDashboardPanel id="client">
    <template #header>
      <UDashboardNavbar :title="client?.name ?? 'Client'">
        <template #leading>
          <UButton
            to="/clienti"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            aria-label="Înapoi la lista de clienți"
          />
        </template>
        <template v-if="client" #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            label="Modifică"
            class="hidden sm:inline-flex"
            @click="editOpen = true"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            aria-label="Modifică clientul"
            class="sm:hidden"
            @click="editOpen = true"
          />
          <UDropdownMenu :items="moreActions" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              aria-label="Mai multe acțiuni"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        :icon="notFound ? 'i-lucide-building-2' : 'i-lucide-cloud-off'"
        :title="notFound ? 'Clientul nu a fost găsit' : 'Clientul nu a putut fi încărcat'"
        :description="notFound
          ? 'Clientul nu există sau nu ești responsabil pentru el.'
          : apiErrorMessage(error.cause ?? error)"
        :actions="notFound
          ? [{ label: 'Înapoi la clienți', to: '/clienti', icon: 'i-lucide-arrow-left' }]
          : [{ label: 'Încearcă din nou', icon: 'i-lucide-refresh-cw', onClick: () => { refresh() } }]"
        variant="naked"
      />

      <div v-else-if="!client" class="mx-auto w-full max-w-6xl space-y-4">
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-10 w-80" />
        <USkeleton class="h-64 w-full" />
      </div>

      <div v-else class="mx-auto w-full max-w-6xl space-y-6">
        <!-- Rezumat -->
        <div class="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-default bg-default px-4 py-4 sm:px-6">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold text-highlighted">
                {{ client.name }}
              </h2>
              <StatusBadge :active="client.isActive" inactive-label="Arhivat" />
            </div>
            <p class="text-sm text-muted">
              CUI {{ client.cui }}
            </p>
          </div>
          <dl class="flex flex-wrap gap-x-8 gap-y-2 text-sm sm:ml-auto">
            <div>
              <dt class="text-muted">
                Angajați
              </dt>
              <dd class="font-semibold text-highlighted" :title="client.employeeCountCheckedAt ? `Confirmat la ${formatDateTime(client.employeeCountCheckedAt)}` : undefined">
                {{ client.employeeCount ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Puncte de lucru
              </dt>
              <dd class="font-semibold text-highlighted">
                {{ client.locationCount }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Venit lunar estimat
              </dt>
              <dd class="font-semibold text-highlighted">
                {{ client.monthlyEstimate > 0 ? formatMoney(client.monthlyEstimate) : '—' }}
              </dd>
            </div>
          </dl>
        </div>

        <UAlert
          v-for="request in pendingTransfers"
          :key="request.id"
          color="info"
          variant="subtle"
          icon="i-lucide-arrow-left-right"
          title="Cerere de predare în așteptare"
          :description="`${request.from.firstName} ${request.from.lastName} → ${request.to.firstName} ${request.to.lastName}. Predarea are loc după acordul amândurora.`"
          :actions="[{ label: 'Vezi cererile', to: '/', color: 'info', variant: 'outline' }]"
        />

        <UTabs
          v-model="tab"
          :items="tabs"
          variant="link"
          :unmount-on-hide="false"
          :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0', label: 'overflow-visible whitespace-nowrap', content: 'pt-4' }"
        >
          <template #details>
            <div class="grid gap-6 lg:grid-cols-2">
              <UCard>
                <template #header>
                  <h2 class="font-semibold text-highlighted">
                    Date companie
                  </h2>
                </template>
                <dl class="space-y-3 text-sm">
                  <div>
                    <dt class="text-muted">
                      CUI
                    </dt>
                    <dd class="text-highlighted">
                      {{ client.cui }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Nr. Registrul Comerțului
                    </dt>
                    <dd class="text-highlighted">
                      {{ orDash(client.tradeRegisterNumber) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Adresă
                    </dt>
                    <dd class="text-highlighted">
                      {{ orDash(client.address) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Reprezentant legal
                    </dt>
                    <dd class="text-highlighted">
                      {{ orDash(client.legalRepresentative) }}
                    </dd>
                  </div>
                </dl>
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="font-semibold text-highlighted">
                    Contact
                  </h2>
                </template>
                <dl class="space-y-3 text-sm">
                  <div>
                    <dt class="text-muted">
                      Persoană de contact
                    </dt>
                    <dd class="text-highlighted">
                      {{ orDash(client.contactPerson) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Telefon
                    </dt>
                    <dd>
                      <ULink v-if="client.phone" :to="`tel:${client.phone.replace(/\s+/g, '')}`" class="text-primary">
                        {{ client.phone }}
                      </ULink>
                      <span v-else class="text-highlighted">—</span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Email
                    </dt>
                    <dd>
                      <ULink v-if="client.email" :to="`mailto:${client.email}`" class="break-all text-primary">
                        {{ client.email }}
                      </ULink>
                      <span v-else class="text-highlighted">—</span>
                    </dd>
                  </div>
                </dl>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <h2 class="font-semibold text-highlighted">
                      Servicii prestate
                    </h2>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-pencil"
                      label="Modifică"
                      @click="servicesOpen = true"
                    />
                  </div>
                </template>
                <div v-if="client.services.length > 0" class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="service in client.services"
                    :key="service.id"
                    :label="service.name"
                    color="primary"
                    variant="subtle"
                    size="lg"
                  />
                </div>
                <p v-else class="text-sm text-muted">
                  Niciun serviciu asociat încă.
                </p>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <h2 class="font-semibold text-highlighted">
                      Responsabili
                    </h2>
                    <UButton
                      v-if="isAdmin"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-pencil"
                      label="Modifică"
                      @click="responsiblesOpen = true"
                    />
                  </div>
                </template>
                <ul v-if="client.responsibles.length > 0" class="space-y-2">
                  <li v-for="user in client.responsibles" :key="user.id" class="flex items-center gap-2 text-sm">
                    <UAvatar :text="initials(user.firstName, user.lastName)" size="sm" />
                    <span class="text-highlighted">{{ user.firstName }} {{ user.lastName }}</span>
                  </li>
                </ul>
                <p v-else class="text-sm text-muted">
                  Niciun responsabil. Clientul este vizibil doar administratorilor.
                </p>
              </UCard>

              <UCard v-if="client.notes" class="lg:col-span-2">
                <template #header>
                  <h2 class="font-semibold text-highlighted">
                    Observații
                  </h2>
                </template>
                <p class="text-sm whitespace-pre-line text-default">
                  {{ client.notes }}
                </p>
              </UCard>
            </div>
          </template>

          <template #locations>
            <ClientsLocationsTab :client-id="client.id" @changed="refresh()" />
          </template>

          <template #contracts>
            <ClientsContractsTab :client-id="client.id" @changed="refresh()" />
          </template>

          <template #activities>
            <div class="space-y-8">
              <section>
                <h3 class="mb-3 text-sm font-semibold text-highlighted">
                  Obligații recurente
                </h3>
                <TasksObligationsList :client-id="client.id" :client-name="client.name" @changed="tasksList?.refresh()" />
              </section>
              <section>
                <h3 class="mb-3 text-sm font-semibold text-highlighted">
                  Task-uri
                </h3>
                <TasksList ref="tasksList" :client-id="client.id" :client-name="client.name" />
              </section>
            </div>
          </template>
        </UTabs>

        <ClientsClientFormModal v-model:open="editOpen" :client="client" @saved="onSaved" />
        <ClientsClientServicesModal v-model:open="servicesOpen" :client="client" @saved="onSaved" />
        <ClientsResponsiblesModal
          v-if="isAdmin"
          v-model:open="responsiblesOpen"
          :client="client"
          @saved="onSaved"
        />
        <ClientsTransferClientModal
          v-model:open="transferOpen"
          :client="client"
          @transferred="onTransferred"
          @requested="refreshTransfers()"
        />
        <ConfirmDialog
          v-model:open="statusOpen"
          :title="client.isActive ? 'Arhivezi clientul?' : 'Reactivezi clientul?'"
          :description="client.isActive
            ? `${client.name} nu va mai apărea printre clienții activi, iar obligațiile lui recurente vor fi suspendate: task-urile viitoare neîncepute, create automat, sunt retrase. Punctele de lucru, contractele și tot istoricul rămân în evidență. Clientul poate fi reactivat oricând.`
            : `${client.name} va apărea din nou printre clienții activi, iar obligațiile lui recurente își vor relua programul de azi încolo.`"
          :confirm-label="client.isActive ? 'Arhivează' : 'Reactivează'"
          :color="client.isActive ? 'warning' : 'primary'"
          :loading="busy"
          @confirm="toggleStatus"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
