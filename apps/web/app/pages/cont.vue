<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

useHead({ title: 'Contul meu' })

const { user, fullName, changePassword } = useAuth()
const toast = useToast()

const schema = z
  .object({
    currentPassword: z.string('Introdu parola curentă.').min(1, 'Introdu parola curentă.'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string('Confirmă parola nouă.').min(1, 'Confirmă parola nouă.')
  })
  .refine(data => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Parola nouă trebuie să fie diferită de cea curentă.'
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parolele nu coincid.'
  })
type Schema = z.output<typeof schema>

const emptyState = (): Partial<Schema> => ({ currentPassword: '', newPassword: '', confirmPassword: '' })
const state = reactive<Partial<Schema>>(emptyState())
const form = useTemplateRef('form')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  const wasForced = user.value?.mustChangePassword === true
  try {
    await changePassword(event.data.currentPassword, event.data.newPassword)
    Object.assign(state, emptyState())
    toast.add({
      title: 'Parola a fost schimbată',
      description: 'Celelalte dispozitive pe care erai autentificat au fost deconectate.',
      color: 'success',
      icon: 'i-lucide-check'
    })
    if (wasForced) await navigateTo('/')
  } catch (error) {
    const fieldErrors = apiFormErrors(error)
    if (fieldErrors.length > 0) {
      form.value?.setErrors(fieldErrors)
    } else {
      errorMessage.value = apiErrorMessage(error)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar title="Contul meu" />
    </template>

    <template #body>
      <div v-if="user" class="mx-auto w-full max-w-2xl space-y-6">
        <UAlert
          v-if="user.mustChangePassword"
          color="warning"
          variant="subtle"
          icon="i-lucide-key-round"
          title="Alege o parolă nouă pentru a continua"
          description="Contul tău folosește o parolă temporară stabilită de un administrator. Până la schimbarea ei, restul aplicației nu este disponibil."
        />

        <UCard>
          <div class="flex items-center gap-4">
            <UAvatar :text="initials(user.firstName, user.lastName)" size="xl" />
            <div class="min-w-0">
              <p class="truncate text-lg font-semibold text-highlighted">
                {{ fullName }}
              </p>
              <p class="truncate text-sm text-muted">
                {{ user.email }}
              </p>
              <UBadge
                :label="USER_ROLE_LABELS[user.role]"
                :color="user.role === 'ADMIN' ? 'primary' : 'neutral'"
                variant="subtle"
                class="mt-2"
              />
            </div>
          </div>
          <p class="mt-4 text-sm text-muted">
            Numele, adresa de email și rolul pot fi modificate doar de un administrator.
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Schimbă parola
            </h2>
            <p class="text-sm text-muted">
              Folosește cel puțin {{ PASSWORD_MIN_LENGTH }} caractere. După schimbare, vei fi deconectat de pe celelalte dispozitive.
            </p>
          </template>

          <UForm
            ref="form"
            :schema="schema"
            :state="state"
            class="space-y-5"
            @submit="onSubmit"
          >
            <UAlert
              v-if="errorMessage"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="errorMessage"
            />

            <UFormField
              :label="user.mustChangePassword ? 'Parola temporară' : 'Parola curentă'"
              name="currentPassword"
              class="max-w-sm"
            >
              <PasswordInput v-model="state.currentPassword" autocomplete="current-password" />
            </UFormField>

            <UFormField label="Parola nouă" name="newPassword" class="max-w-sm">
              <PasswordInput v-model="state.newPassword" autocomplete="new-password" />
            </UFormField>

            <UFormField label="Confirmă parola nouă" name="confirmPassword" class="max-w-sm">
              <PasswordInput v-model="state.confirmPassword" autocomplete="new-password" />
            </UFormField>

            <UButton type="submit" :loading="loading" label="Schimbă parola" />
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
