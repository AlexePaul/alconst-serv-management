<script setup lang="ts">
/**
 * Pe pagina principală: pasul următor pentru a folosi aplicația comod pe telefon.
 *  1. instalarea pe ecranul principal (pe iPhone, singura cale spre notificări);
 *  2. pornirea notificărilor pe telefon.
 * Fiecare pas poate fi amânat; reapare după câteva săptămâni.
 */
const SNOOZE_DAYS = 21
const STORAGE_PREFIX = 'alconst:phone-setup:'

const nuxtApp = useNuxtApp()
const toast = useToast()
const { isIos, isAndroid, isMobile, isStandalone } = useDeviceInfo()
const push = usePushNotifications()

const snoozed = ref<Record<string, boolean>>({})
const mounted = ref(false)

function isSnoozed(step: string): boolean {
  try {
    const until = Number(localStorage.getItem(STORAGE_PREFIX + step) ?? 0)
    return until > Date.now()
  } catch {
    return false
  }
}

function snooze(step: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + step, String(Date.now() + SNOOZE_DAYS * 24 * 3600 * 1000))
  } catch {
    // Fără stocare locală: cardul dispare doar până la următoarea deschidere.
  }
  snoozed.value = { ...snoozed.value, [step]: true }
}

onMounted(() => {
  snoozed.value = { install: isSnoozed('install'), push: isSnoozed('push') }
  mounted.value = true
})

/** Android/Chrome oferă instalarea direct, printr-un buton. */
const canPromptInstall = computed(() => Boolean(nuxtApp.$pwa?.showInstallPrompt))

const step = computed<'install' | 'push' | null>(() => {
  if (!mounted.value) return null
  if (isMobile && !isStandalone && !snoozed.value.install) return 'install'
  if (push.state.value === 'off' && !snoozed.value.push) return 'push'
  return null
})

async function install() {
  const choice = await nuxtApp.$pwa?.install()
  if (choice?.outcome === 'accepted') snooze('install')
}

async function enablePush() {
  try {
    const result = await push.enable()
    if (result === 'on') {
      toast.add({ title: 'Notificările sunt pornite', description: 'De acum primești pe telefon ce ai de făcut.', color: 'success', icon: 'i-lucide-bell-ring' })
    } else if (result === 'denied') {
      toast.add({ title: 'Notificările au fost refuzate', description: 'Le poți porni oricând din „Contul meu”.', color: 'warning', icon: 'i-lucide-bell-off' })
    }
  } catch (error) {
    toast.add({ title: 'Notificările nu au putut fi pornite', description: error instanceof Error && !getApiError(error) ? error.message : apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <UCard v-if="step === 'install'" :ui="{ body: 'p-4 sm:p-5' }" class="border-primary/30 bg-primary/5">
    <div class="flex gap-3">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <UIcon name="i-lucide-smartphone" class="size-5" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="font-semibold text-highlighted">
          Pune aplicația pe ecranul telefonului
        </h2>
        <p class="mt-1 text-sm text-default">
          O deschizi dintr-o atingere, ca pe orice aplicație, și poți primi notificări când ai ceva de făcut.
        </p>

        <ol v-if="isIos" class="mt-3 space-y-2 text-sm text-default">
          <li class="flex items-start gap-2">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted">1</span>
            <span>Apasă butonul de partajare <UIcon name="i-lucide-share" class="inline-block size-4 align-[-3px] text-primary" aria-label="(pătratul cu săgeata în sus)" /> din bara Safari (jos sau sus).</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted">2</span>
            <span>Derulează și alege <strong>„Adaugă pe ecranul principal”</strong> <UIcon name="i-lucide-square-plus" class="inline-block size-4 align-[-3px]" />.</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted">3</span>
            <span>Apasă <strong>„Adaugă”</strong>, apoi deschide aplicația de pe ecranul telefonului.</span>
          </li>
        </ol>
        <p v-else-if="!canPromptInstall" class="mt-3 text-sm text-default">
          Apasă meniul browserului <UIcon name="i-lucide-ellipsis-vertical" class="inline-block size-4 align-[-3px]" /> (cele trei puncte) și alege
          <strong>„{{ isAndroid ? 'Adaugă pe ecranul de pornire' : 'Instalează aplicația' }}”</strong>.
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            v-if="canPromptInstall && !isIos"
            icon="i-lucide-download"
            label="Instalează aplicația"
            @click="install"
          />
          <UButton
            color="neutral"
            variant="ghost"
            label="Nu acum"
            @click="snooze('install')"
          />
        </div>
      </div>
    </div>
  </UCard>

  <UCard v-else-if="step === 'push'" :ui="{ body: 'p-4 sm:p-5' }" class="border-primary/30 bg-primary/5">
    <div class="flex gap-3">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <UIcon name="i-lucide-bell-ring" class="size-5" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="font-semibold text-highlighted">
          Primește notificări pe {{ isMobile ? 'telefon' : 'acest calculator' }}
        </h2>
        <p class="mt-1 text-sm text-default">
          Afli imediat când un coleg îți dă ceva de făcut, iar dimineața ce termene ai. Telefonul te va întreba dacă permiți notificările – alege „Permite”.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-bell"
            label="Pornește notificările"
            :loading="push.busy.value"
            @click="enablePush"
          />
          <UButton
            color="neutral"
            variant="ghost"
            label="Nu acum"
            @click="snooze('push')"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
