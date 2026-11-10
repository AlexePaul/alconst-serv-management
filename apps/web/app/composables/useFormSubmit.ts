interface FormLike {
  setErrors: (errors: { name: string, message: string }[]) => void
}

/**
 * Logica repetată a formularelor: stare de încărcare, erorile de validare venite de la server
 * afișate sub câmpuri și un mesaj general pentru restul erorilor.
 */
export function useFormSubmit(form: Readonly<Ref<FormLike | null | undefined>>) {
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  /** Rulează acțiunea; întoarce `true` dacă a reușit. */
  async function submit(action: () => Promise<void>): Promise<boolean> {
    loading.value = true
    errorMessage.value = null
    try {
      await action()
      return true
    } catch (error) {
      const fieldErrors = apiFormErrors(error)
      if (fieldErrors.length > 0 && form.value) {
        form.value.setErrors(fieldErrors)
      } else {
        errorMessage.value = apiErrorMessage(error)
      }
      return false
    } finally {
      loading.value = false
    }
  }

  function reset() {
    errorMessage.value = null
  }

  return { loading, errorMessage, submit, reset }
}
