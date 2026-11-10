import type { UserDto } from '@alconst/shared'
import { FetchError } from 'ofetch'

/** Starea de autentificare a utilizatorului curent. */
export function useAuth() {
  const user = useState<UserDto | null>('auth:user', () => null)
  /** Devine `true` după prima verificare a sesiunii la pornirea aplicației. */
  const loaded = useState('auth:loaded', () => false)
  const api = useApi()

  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  const fullName = computed(() => (user.value ? `${user.value.firstName} ${user.value.lastName}` : ''))

  /** Verifică dacă există o sesiune validă. Erorile de rețea sunt propagate. */
  async function fetchUser(): Promise<void> {
    try {
      user.value = await api<UserDto>('/auth/me')
    } catch (error) {
      if (error instanceof FetchError && error.status === 401) {
        user.value = null
      } else {
        throw error
      }
    }
    loaded.value = true
  }

  async function login(email: string, password: string): Promise<void> {
    user.value = await api<UserDto>('/auth/login', { method: 'POST', body: { email, password } })
    loaded.value = true
  }

  async function logout(): Promise<void> {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // Chiar dacă cererea eșuează (ex. sesiune deja expirată), utilizatorul este deconectat local.
    }
    user.value = null
    await navigateTo('/login')
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    user.value = await api<UserDto>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    })
  }

  return { user, loaded, isAdmin, fullName, fetchUser, login, logout, changePassword }
}
