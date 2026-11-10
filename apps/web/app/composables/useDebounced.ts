/** Întoarce o copie a valorii care se actualizează abia după ce sursa nu s-a mai schimbat `delay` ms. */
export function useDebounced<T>(source: Ref<T>, delay = 300): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = value
    }, delay)
  })
  onScopeDispose(() => clearTimeout(timer))

  return debounced
}
