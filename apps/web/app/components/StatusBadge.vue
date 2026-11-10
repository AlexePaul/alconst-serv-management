<script setup lang="ts">
withDefaults(defineProps<{
  active: boolean
  activeLabel?: string
  inactiveLabel?: string
}>(), {
  activeLabel: 'Activ',
  inactiveLabel: 'Inactiv'
})
</script>

<template>
  <UBadge
    :label="active ? activeLabel : inactiveLabel"
    :color="active ? 'success' : 'neutral'"
    variant="subtle"
  />
</template>
