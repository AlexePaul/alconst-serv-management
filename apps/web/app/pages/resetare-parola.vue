<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Parolă nouă' })

const schema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string('Confirmă parola.').min(1, 'Confirmă parola.')
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parolele nu coincid.'
  })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ newPassword: '', confirmPassword: '' })
const loading = ref(false)
const done = ref(false)
const errorMessage = ref<string | null>(null)

const route = useRoute()
const api = useApi()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  try {
    await api('/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, newPassword: event.data.newPassword }
    })
    done.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="done" class="text-center">
    <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
      <UIcon name="i-lucide-circle-check-big" class="size-6" />
    </div>
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      Parola a fost schimbată
    </h1>
    <p class="mt-2 text-sm text-muted">
      Te poți autentifica acum cu noua parolă. Din motive de siguranță, ai fost deconectat de pe toate dispozitivele.
    </p>
    <UButton
      to="/login"
      block
      size="lg"
      class="mt-6"
      label="Mergi la autentificare"
    />
  </div>

  <div v-else-if="!token" class="text-center">
    <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
      <UIcon name="i-lucide-link-2-off" class="size-6" />
    </div>
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      Link de resetare invalid
    </h1>
    <p class="mt-2 text-sm text-muted">
      Linkul accesat este incomplet. Solicită un link nou de resetare a parolei.
    </p>
    <UButton
      to="/parola-uitata"
      variant="soft"
      block
      class="mt-6"
      label="Solicită un link nou"
    />
  </div>

  <div v-else>
    <h1 class="text-xl font-semibold text-highlighted">
      Alege o parolă nouă
    </h1>
    <p class="mt-1 text-sm text-muted">
      Parola trebuie să aibă cel puțin {{ PASSWORD_MIN_LENGTH }} caractere.
    </p>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      :actions="[{ label: 'Solicită un link nou', to: '/parola-uitata', color: 'error', variant: 'link' }]"
      class="mt-5"
    />

    <UForm
      :schema="schema"
      :state="state"
      class="mt-6 space-y-5"
      @submit="onSubmit"
    >
      <UFormField label="Parola nouă" name="newPassword">
        <PasswordInput v-model="state.newPassword" autocomplete="new-password" />
      </UFormField>

      <UFormField label="Confirmă parola" name="confirmPassword">
        <PasswordInput v-model="state.confirmPassword" autocomplete="new-password" />
      </UFormField>

      <UButton
        type="submit"
        block
        size="lg"
        :loading="loading"
        label="Salvează parola"
      />
    </UForm>
  </div>
</template>
