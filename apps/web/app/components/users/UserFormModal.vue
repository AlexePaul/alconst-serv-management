<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { UserDto } from '@alconst/shared'
import { z } from 'zod'

/** Fereastră pentru crearea unui utilizator nou sau modificarea unuia existent. */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** Utilizatorul editat; `null` pentru creare. */
  user: UserDto | null
}>()

const emit = defineEmits<{ saved: [user: UserDto] }>()

const api = useApi()
const toast = useToast()
const { user: currentUser } = useAuth()

const isEdit = computed(() => props.user !== null)
const isSelf = computed(() => props.user?.id === currentUser.value?.id)

const schema = z.object({
  firstName: z.string('Prenumele este obligatoriu.').trim().min(1, 'Prenumele este obligatoriu.').max(100),
  lastName: z.string('Numele este obligatoriu.').trim().min(1, 'Numele este obligatoriu.').max(100),
  email: emailSchema,
  role: z.enum(USER_ROLES, 'Alege un rol.'),
  // Parola se stabilește doar la creare; la editare câmpul lipsește.
  password: newPasswordSchema.optional()
})
type Schema = z.output<typeof schema>

const roleItems = USER_ROLES.map(role => ({ label: USER_ROLE_LABELS[role], value: role }))

const state = reactive<Partial<Schema>>({})
const form = useTemplateRef('form')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
/** După creare, afișăm o singură dată parola temporară. */
const created = ref<{ user: UserDto, password: string } | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  errorMessage.value = null
  created.value = null
  Object.assign(state, {
    firstName: props.user?.firstName ?? '',
    lastName: props.user?.lastName ?? '',
    email: props.user?.email ?? '',
    role: props.user?.role ?? 'EMPLOYEE',
    password: props.user ? undefined : generateTemporaryPassword()
  })
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  errorMessage.value = null
  const { password, ...profile } = event.data
  try {
    if (props.user) {
      const updated = await api<UserDto>(`/users/${props.user.id}`, { method: 'PATCH', body: profile })
      emit('saved', updated)
      toast.add({ title: 'Modificările au fost salvate', color: 'success', icon: 'i-lucide-check' })
      open.value = false
    } else {
      if (!password) {
        form.value?.setErrors([{ name: 'password', message: 'Parola este obligatorie.' }])
        return
      }
      const user = await api<UserDto>('/users', { method: 'POST', body: { ...profile, password } })
      emit('saved', user)
      created.value = { user, password }
    }
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
    :title="created ? 'Utilizator creat' : isEdit ? 'Modifică utilizatorul' : 'Adaugă utilizator'"
    :description="created ? undefined : isEdit ? 'Actualizează datele contului.' : 'Contul este creat cu o parolă temporară.'"
    :dismissible="!loading && !created"
  >
    <template #body>
      <UsersTemporaryPasswordResult
        v-if="created"
        :user-name="`${created.user.firstName} ${created.user.lastName}`"
        :email="created.user.email"
        :password="created.password"
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

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Prenume" name="firstName" required>
            <UInput v-model="state.firstName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Nume" name="lastName" required>
            <UInput v-model="state.lastName" autocomplete="off" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Email" name="email" required>
          <UInput
            v-model="state.email"
            type="email"
            inputmode="email"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Rol"
          name="role"
          required
          :help="isSelf ? 'Nu îți poți modifica propriul rol.' : 'Administratorii pot gestiona utilizatorii și toate datele aplicației.'"
        >
          <USelect
            v-model="state.role"
            :items="roleItems"
            :disabled="isSelf"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="!isEdit"
          label="Parolă temporară"
          name="password"
          required
          help="Utilizatorul va fi obligat să o schimbe la prima autentificare."
        >
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
          <UButton type="submit" :loading="loading" :label="isEdit ? 'Salvează' : 'Creează utilizatorul'" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
