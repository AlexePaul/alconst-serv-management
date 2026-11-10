<script setup lang="ts">
/**
 * Afișează o singură dată parola temporară, imediat după crearea contului sau resetarea parolei.
 * Parola nu mai poate fi vizualizată ulterior (pe server se păstrează doar hash-ul).
 */
const props = defineProps<{
  userName: string
  email: string
  password: string
}>()

defineEmits<{ close: [] }>()

const toast = useToast()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.add({ title: 'Parola nu a putut fi copiată', description: 'Selecteaz-o și copiaz-o manual.', color: 'warning' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check-big"
      :title="`Parola temporară pentru ${userName}`"
      description="Transmite-o pe un canal sigur. La prima autentificare, utilizatorul va fi obligat să își aleagă propria parolă."
    />

    <dl class="space-y-3 text-sm">
      <div>
        <dt class="text-muted">
          Email
        </dt>
        <dd class="font-medium text-highlighted">
          {{ email }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Parolă temporară
        </dt>
        <dd class="mt-1 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-md bg-elevated px-3 py-2 font-mono text-base text-highlighted select-all">{{ password }}</code>
          <UButton
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copiat' : 'Copiază'"
            @click="copy"
          />
        </dd>
      </div>
    </dl>

    <p class="text-xs text-muted">
      Parola nu mai poate fi afișată după închiderea acestei ferestre.
    </p>

    <div class="flex justify-end">
      <UButton label="Am notat parola" @click="$emit('close')" />
    </div>
  </div>
</template>
