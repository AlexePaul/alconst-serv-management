/**
 * Unde rulează aplicația: ce fel de dispozitiv și dacă este instalată pe ecranul principal.
 * Folosit pentru instrucțiunile de instalare și pentru notificările pe telefon.
 */
export function useDeviceInfo() {
  const ua = import.meta.client ? navigator.userAgent : ''
  // iPadOS se prezintă ca Mac, dar are ecran tactil.
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && import.meta.client && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const isMobile = isIos || isAndroid
  const isStandalone = import.meta.client
    && (window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true)

  /** Numele scurt al dispozitivului, ca utilizatorul să-l recunoască (ex. „iPhone”, „Android”). */
  const deviceLabel = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (isIos && /Macintosh/.test(ua))
      ? 'iPad'
      : isAndroid
        ? 'Telefon Android'
        : /Windows/.test(ua)
          ? 'Calculator Windows'
          : /Macintosh/.test(ua)
            ? 'Mac'
            : 'Browser'

  return { isIos, isAndroid, isMobile, isStandalone, deviceLabel }
}

/** Numărul de pe iconița aplicației instalate (unde sistemul îl permite). */
export function setAppBadge(count: number): void {
  if (!import.meta.client || !('setAppBadge' in navigator)) return
  const action = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
  action.catch(() => {})
}
