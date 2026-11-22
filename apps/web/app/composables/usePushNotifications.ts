import type { PushConfigDto } from '@alconst/shared'

export type PushState
  /** Browserul nu are notificări push (ex. Safari pe iPhone, în afara aplicației instalate). */
  = | 'unsupported'
  /** iPhone/iPad: notificările merg doar după instalarea pe ecranul principal. */
    | 'needs-install'
  /** Utilizatorul a refuzat permisiunea; se poate schimba doar din setările telefonului. */
    | 'denied'
    | 'off'
    | 'on'

/** Așteaptă service worker-ul, dar nu la nesfârșit (în dezvoltare nu există unul). */
async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  if (!(await navigator.serviceWorker.getRegistration())) return null
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return true
  const expected = base64UrlToBytes(publicKey)
  const actual = new Uint8Array(current)
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
}

/**
 * Notificările pe telefon (Web Push) pentru dispozitivul curent: pornire, oprire, probă.
 * Starea este comună tuturor componentelor care o folosesc.
 */
export function usePushNotifications() {
  const api = useApi()
  const { isIos, isStandalone, deviceLabel } = useDeviceInfo()
  const state = useState<PushState | null>('push:state', () => null)
  const busy = useState('push:busy', () => false)

  const supported = import.meta.client
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  async function currentSubscription(): Promise<PushSubscription | null> {
    const registration = await serviceWorker()
    return registration ? registration.pushManager.getSubscription() : null
  }

  /** Stabilește starea și, dacă dispozitivul este abonat, reîmprospătează abonamentul pe server. */
  async function refresh(): Promise<void> {
    // Pe iPhone/iPad, notificările există doar în aplicația instalată pe ecranul principal.
    if (isIos && !isStandalone) {
      state.value = 'needs-install'
      return
    }
    if (!supported) {
      state.value = 'unsupported'
      return
    }
    if (Notification.permission === 'denied') {
      state.value = 'denied'
      return
    }
    const subscription = Notification.permission === 'granted' ? await currentSubscription() : null
    state.value = subscription ? 'on' : 'off'
    if (subscription) {
      // Abonamentul poate fi reînnoit de browser sau poate aparține altui utilizator care a
      // folosit înainte dispozitivul: îl legăm din nou de contul curent.
      try {
        const config = await api<PushConfigDto>('/push/config')
        if (sameKey(subscription, config.publicKey)) await save(subscription)
        else await subscription.unsubscribe().then(() => enable())
      } catch {
        // Fără rețea acum; se reîncearcă la următoarea deschidere.
      }
    }
  }

  async function save(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON()
    await api<PushConfigDto>('/push/subscribe', {
      method: 'POST',
      body: { endpoint: json.endpoint, keys: json.keys, deviceLabel }
    })
  }

  /** Cere permisiunea (trebuie apelată direct dintr-o apăsare) și abonează dispozitivul. */
  async function enable(): Promise<PushState> {
    if (!supported || (isIos && !isStandalone)) {
      await refresh()
      return state.value ?? 'unsupported'
    }
    busy.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        state.value = permission === 'denied' ? 'denied' : 'off'
        return state.value
      }
      const registration = await serviceWorker()
      if (!registration) throw new Error('Notificările nu sunt disponibile momentan. Reîncarcă aplicația și încearcă din nou.')
      const config = await api<PushConfigDto>('/push/config')
      let subscription: PushSubscription
      try {
        subscription = await registration.pushManager.getSubscription()
          ?? await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(config.publicKey)
          })
      } catch {
        // Mesajele browserului sunt în engleză și tehnice („Registration failed…”).
        throw new Error(
          'Telefonul nu a putut porni notificările. Verifică dacă notificările sunt permise pentru aplicație în setările telefonului și încearcă din nou.'
        )
      }
      await save(subscription)
      state.value = 'on'
      return state.value
    } finally {
      busy.value = false
    }
  }

  /** Oprește notificările pe acest dispozitiv (și la deconectare). */
  async function disable(): Promise<void> {
    if (!supported || Notification.permission !== 'granted') return
    busy.value = true
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe().catch(() => false)
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => {})
      }
      state.value = 'off'
    } finally {
      busy.value = false
    }
  }

  async function sendTest(): Promise<void> {
    await api('/push/test', { method: 'POST' })
  }

  return { state, busy, supported, isIos, isStandalone, refresh, enable, disable, sendTest }
}
