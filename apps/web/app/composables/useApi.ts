/** Clientul HTTP configurat în `plugins/api.ts`. */
export function useApi() {
  return useNuxtApp().$api
}
