/**
 * Protejează toate paginile: fără sesiune validă, utilizatorul este trimis la autentificare.
 * Este doar o măsură de UX – autorizarea reală se face pe server, la fiecare cerere.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loaded, isAdmin, fetchUser } = useAuth()

  if (!loaded.value) {
    await fetchUser()
  }

  if (!user.value) {
    if (to.meta.public) return
    return navigateTo({ path: '/login', query: to.path === '/' ? {} : { redirect: to.fullPath } })
  }

  if (to.meta.public) {
    return navigateTo('/')
  }
  if (user.value.mustChangePassword && to.path !== '/cont') {
    return navigateTo('/cont')
  }
  if (to.meta.adminOnly && !isAdmin.value) {
    return navigateTo('/')
  }
})
