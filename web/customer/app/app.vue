<script setup lang="ts">
useHead({ titleTemplate: title => (title ? `${title} · Cinemotion` : 'Cinemotion') })
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
