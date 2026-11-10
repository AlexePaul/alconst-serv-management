<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Autentificare' })

const schema = z.object({
  email: emailSchema,
  password: z.string('Parola este obligatorie.').min(1, 'Parola este obligatorie.')
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ email: '', password: '' })
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const route = useRoute()
const { login } = useAuth()

/** Acceptăm doar căi interne, pentru a nu permite redirecționări către alte site-uri. */
function redirectTarget(): string {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  try {
    await login(event.data.email, event.data.password)
    await navigateTo(redirectTarget())
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
    state.password = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-highlighted">
      Autentificare
    </h1>
    <p class="mt-1 text-sm text-muted">
      Introdu datele contului tău pentru a continua.
    </p>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mt-5"
    />

    <UForm
      :schema="schema"
      :state="state"
      class="mt-6 space-y-5"
      @submit="onSubmit"
    >
      <UFormField label="Email" name="email">
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="username"
          inputmode="email"
          placeholder="nume@alconst-serv.ro"
          autofocus
          class="w-full"
        />
      </UFormField>

      <UFormField label="Parolă" name="password">
        <template #hint>
          <ULink to="/parola-uitata" class="text-sm text-primary">
            Ai uitat parola?
          </ULink>
        </template>
        <PasswordInput v-model="state.password" autocomplete="current-password" />
      </UFormField>

      <UButton
        type="submit"
        block
        size="lg"
        :loading="loading"
        label="Intră în cont"
      />
    </UForm>
  </div>
</template>
