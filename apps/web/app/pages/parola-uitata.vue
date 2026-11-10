<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Resetare parolă' })

const schema = z.object({ email: emailSchema })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ email: '' })
const loading = ref(false)
const sent = ref(false)
const errorMessage = ref<string | null>(null)

const api = useApi()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  try {
    await api('/auth/forgot-password', { method: 'POST', body: { email: event.data.email } })
    sent.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="sent" class="text-center">
    <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
      <UIcon name="i-lucide-mail-check" class="size-6" />
    </div>
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      Verifică-ți emailul
    </h1>
    <p class="mt-2 text-sm text-muted">
      Dacă există un cont activ pentru <span class="font-medium text-default">{{ state.email }}</span>,
      vei primi în câteva minute un link pentru alegerea unei parole noi.
    </p>
    <p class="mt-2 text-sm text-muted">
      Nu ai primit nimic? Verifică și dosarul Spam sau contactează un administrator.
    </p>
    <UButton
      to="/login"
      variant="soft"
      block
      class="mt-6"
      label="Înapoi la autentificare"
    />
  </div>

  <div v-else>
    <h1 class="text-xl font-semibold text-highlighted">
      Ai uitat parola?
    </h1>
    <p class="mt-1 text-sm text-muted">
      Introdu adresa de email a contului și îți trimitem un link de resetare.
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

      <UButton
        type="submit"
        block
        size="lg"
        :loading="loading"
        label="Trimite linkul de resetare"
      />
    </UForm>

    <div class="mt-5 text-center">
      <ULink to="/login" class="text-sm text-primary">
        Înapoi la autentificare
      </ULink>
    </div>
  </div>
</template>
