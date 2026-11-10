<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-muted px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex justify-center">
        <AppLogo />
      </div>

      <UCard :ui="{ body: 'p-6 sm:p-8' }">
        <slot />
      </UCard>

      <p class="mt-6 text-center text-xs text-muted">
        Aplicație internă Alconst Serv. Accesul este permis doar personalului autorizat.
      </p>
    </div>
  </div>
</template>
