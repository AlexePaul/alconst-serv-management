/*
 * Notificările pe telefon (Web Push), încărcate în service worker-ul generat de Workbox
 * (vezi `pwa.workbox.importScripts` în nuxt.config.ts).
 *
 * Serverul trimite un JSON cu forma `PushPayload` din `@alconst/shared`:
 *   { title, body?, url, tag?, badge? }
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'Alconst Serv'
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/notificari'

  const tasks = [
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-192.png',
      badge: '/badge-96.png',
      lang: 'ro',
      tag: payload.tag || undefined,
      // O notificare cu același tag o înlocuiește pe cea veche; o anunțăm totuși din nou.
      renotify: Boolean(payload.tag),
      data: { url }
    })
  ]
  // Numărul de pe iconița aplicației (iPhone cu aplicația instalată, Android, desktop).
  if (typeof payload.badge === 'number' && 'setAppBadge' in self.navigator) {
    tasks.push(
      (payload.badge > 0 ? self.navigator.setAppBadge(payload.badge) : self.navigator.clearAppBadge()).catch(() => {})
    )
  }
  event.waitUntil(Promise.all(tasks))
})

/** Atingerea notificării deschide aplicația direct pe pagina potrivită. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === target.origin)
    if (existing) {
      await existing.focus()
      // Aplicația deschisă primește adresa și navighează singură, fără reîncărcare.
      existing.postMessage({ type: 'open-url', url: target.pathname + target.search })
      return
    }
    await self.clients.openWindow(target.href)
  })())
})
