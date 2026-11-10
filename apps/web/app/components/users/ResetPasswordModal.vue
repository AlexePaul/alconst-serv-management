<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserDto } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră prin care administratorul stabilește o parolă temporară pentru un utilizator. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ user: UserDto | null }>()
const emit = defineEmits<{ saved: [user: UserDto] }>()

const api = useApi()

const schema = z.object({ password: newPasswordSchema })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const result = ref<string | null>(null)

const userName = computed(() => (props.user ? `${props.user.firstName} ${props.user.lastName}` : ''))

watch(open, (isOpen) => {
  if (!isOpen) return
  errorMessage.value = null
  result.value = null
  state.password = generateTemporaryPassword()
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.user) return
  loading.value = true
  errorMessage.value = null
  try {
    const updated = await api<UserDto>(`/users/${props.user.id}/reset-password`, {
      method: 'POST',
      body: { password: event.data.password }
    })
    emit('saved', updated)
    result.value = event.data.password
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
  <UModal
    v-model:open="open"
    :title="result ? 'Parola a fost resetată' : 'Resetează parola'"
    :description="result ? undefined : `Stabilește o parolă temporară pentru ${userName}.`"
    :dismissible="!loading && !result"
  >
    <template #body>
      <UsersTemporaryPasswordResult
        v-if="result && user"
        :user-name="userName"
        :email="user.email"
        :password="result"
        @close="open = false"
      />

      <UForm
        v-else
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

        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          description="Utilizatorul va fi deconectat de pe toate dispozitivele și va trebui să își aleagă o parolă nouă la următoarea autentificare."
        />

        <UFormField label="Parolă temporară" name="password" required>
          <UsersTemporaryPasswordInput v-model="state.password" />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Renunță"
            :disabled="loading"
            @click="open = false"
          />
          <UButton type="submit" :loading="loading" label="Resetează parola" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
