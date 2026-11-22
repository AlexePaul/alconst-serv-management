/**
 * Comportamentul de aplicație instalată (PWA):
 *  - atingerea unei notificări deschide pagina potrivită în aplicația deja pornită;
 *  - la revenirea în aplicație după o pauză, datele afișate se reîncarcă singure (pe iPhone,
 *    aplicația instalată nu are buton de reîncărcare);
 *  - o versiune nouă se instalează la următoarea schimbare de pagină, nu în mijlocul unui formular;
 *  - abonamentul la notificări este reîmprospătat după autentificare.
 */
const RESUME_REFRESH_AFTER_MS = 60_000

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()

  // Notificare atinsă cât timp aplicația era deschisă.
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ type?: string, url?: string }>) => {
    const url = event.data?.url
    if (event.data?.type === 'open-url' && typeof url === 'string' && url.startsWith('/')) {
      router.push(url)
    }
  })

  // Reîncărcarea datelor la revenirea în aplicație.
  let hiddenAt: number | null = null
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt !== null && Date.now() - hiddenAt > RESUME_REFRESH_AFTER_MS && user.value) {
      refreshNuxtData()
    }
    hiddenAt = null
  })

  // Versiuni noi ale aplicației. `$pwa` este disponibil după toate pluginurile (și lipsește în
  // dezvoltare, unde service worker-ul este oprit).
  nuxtApp.hook('app:mounted', () => {
    const pwa = nuxtApp.$pwa
    if (!pwa) return
    let announced = false
    watch(() => pwa.needRefresh, (needRefresh) => {
      if (!needRefresh || announced) return
      announced = true
      toast.add({
        id: 'app-update',
        title: 'Este disponibilă o versiune nouă',
        description: 'Se instalează singură la următoarea schimbare de pagină.',
        icon: 'i-lucide-sparkles',
        color: 'info',
        duration: 0,
        actions: [{ label: 'Actualizează acum', color: 'info', variant: 'solid', onClick: () => { pwa.updateServiceWorker(true) } }]
      })
    }, { immediate: true })
    router.afterEach((to, from) => {
      if (pwa.needRefresh && to.path !== from.path) pwa.updateServiceWorker(true)
    })
  })

  // Notificările pe telefon, pentru utilizatorul autentificat.
  const push = usePushNotifications()
  watch(() => user.value?.id && !user.value.mustChangePassword, (ready) => {
    if (ready) push.refresh()
  }, { immediate: true })
})
