<script setup lang="ts">
useHead({ title: 'Entrar' })
const route = useRoute()
</script>

<template>
  <div class="mx-auto max-w-sm">
    <UCard>
      <template #header>
        <h1 class="text-xl font-bold">
          Entrar
        </h1>
        <p class="text-sm text-muted">
          Para reservar e acompanhar suas reservas.
        </p>
      </template>
      <LoginForm />
      <template #footer>
        <p class="text-center text-sm text-muted">
          Ainda não tem conta?
          <ULink
            :to="{ path: '/cadastro', query: route.query }"
            class="font-medium text-primary"
          >
            Criar conta
          </ULink>
        </p>
      </template>
    </UCard>
  </div>
</template>
