<script setup lang="ts">
useHead({ titleTemplate: title => (title ? `${title} · Cinemotion Admin` : 'Cinemotion Admin') })
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
