<script setup lang="ts">
import type { ClientDto } from '@alconst/shared'

/**
 * Predarea definitivă a unui client către alt responsabil, împreună cu obligațiile și
 * task-urile deschise. Pentru o singură deplasare se schimbă doar responsabilul task-ului.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ client: ClientDto }>()
const emit = defineEmits<{ transferred: [] }>()

const api = useApi()
const toast = useToast()
const { user, isAdmin } = useAuth()
const { data: users } = useUserOptions()

const fromUserId = ref<string>()
const toUserId = ref<string>()
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/** Un administrator alege de la cine; un angajat își poate preda doar propriul client. */
const fromItems = computed(() =>
  props.client.responsibles
    .filter(responsible => isAdmin.value || responsible.id === user.value?.id)
    .map(responsible => ({ label: `${responsible.firstName} ${responsible.lastName}`, value: responsible.id }))
)
const toItems = computed(() =>
  users.value
    .filter(option => option.id !== fromUserId.value)
    .map(option => ({ label: `${option.firstName} ${option.lastName}`, value: option.id }))
)

watch(open, (isOpen) => {
  if (!isOpen) return
  errorMessage.value = null
  fromUserId.value = fromItems.value.length === 1 ? fromItems.value[0]?.value : fromItems.value.find(item => item.value === user.value?.id)?.value
  toUserId.value = undefined
})

async function transfer() {
  if (!fromUserId.value || !toUserId.value) return
  loading.value = true
  errorMessage.value = null
  try {
    await api(`/clients/${props.client.id}/transfer`, {
      method: 'POST',
      body: { fromUserId: fromUserId.value, toUserId: toUserId.value }
    })
    const target = toItems.value.find(item => item.value === toUserId.value)?.label
    toast.add({ title: 'Clientul a fost predat', description: target ? `Noul responsabil: ${target}` : undefined, color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('transferred')
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Predă clientul"
    :description="`Predarea definitivă a clientului ${client.name} către alt coleg.`"
    :dismissible="!loading"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-5">
        <FormError :message="errorMessage" />

        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Noul responsabil preia clientul, obligațiile lui și task-urile deschise ale celui care predă. Task-urile deja încheiate rămân în istoricul celui care le-a făcut. Pentru o singură deplasare, schimbă doar responsabilul pe acel task."
        />

        <UFormField label="De la">
          <USelect
            v-model="fromUserId"
            :items="fromItems"
            :disabled="fromItems.length <= 1"
            placeholder="Alege responsabilul actual"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Către">
          <USelect
            v-model="toUserId"
            :items="toItems"
            placeholder="Alege noul responsabil"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="!isAdmin && fromUserId === user?.id"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          description="După predare nu vei mai avea acces la acest client."
        />
      </div>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Renunță"
        :disabled="loading"
        @click="open = false"
      />
      <UButton
        label="Predă clientul"
        :loading="loading"
        :disabled="!fromUserId || !toUserId"
        @click="transfer"
      />
    </template>
  </UModal>
</template>
