const POLL_INTERVAL_MS = 60_000

/**
 * Numărul de notificări necitite, împărțit între meniu și pagina de notificări.
 * Se reîmprospătează periodic cât timp aplicația este vizibilă.
 */
export function useUnreadNotifications() {
  const count = useState('notifications:unread', () => 0)
  const api = useApi()

  async function refresh(): Promise<void> {
    try {
      count.value = (await api<{ count: number }>('/notifications/unread-count')).count
      setAppBadge(count.value)
    } catch {
      // Indicatorul nu este esențial; la o eroare de rețea păstrăm ultima valoare cunoscută.
    }
  }

  /**
   * Pornește reîmprospătarea periodică; se apelează o singură dată, din layout. `enabled` permite
   * oprirea ei (ex. cât timp utilizatorul trebuie să își schimbe parola temporară).
   */
  function startPolling(enabled: () => boolean = () => true): void {
    let timer: ReturnType<typeof setInterval> | undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible' && enabled()) refresh()
    }
    onMounted(() => {
      if (enabled()) refresh()
      timer = setInterval(onVisible, POLL_INTERVAL_MS)
      document.addEventListener('visibilitychange', onVisible)
    })
    onBeforeUnmount(() => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    })
  }

  return { count, refresh, startPolling }
}
