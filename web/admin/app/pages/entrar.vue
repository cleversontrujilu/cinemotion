<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Entrar' })
</script>

<template>
  <UCard class="w-full max-w-sm">
    <template #header>
      <div class="flex items-center gap-2">
        <img
          src="/logo.svg"
          alt=""
          class="size-8"
        >
        <div>
          <h1 class="font-bold">
            Cinemotion Admin
          </h1>
          <p class="text-sm text-muted">
            Gestão de Salas, Filmes e Sessões
          </p>
        </div>
      </div>
    </template>
    <LoginForm />
  </UCard>
</template>
