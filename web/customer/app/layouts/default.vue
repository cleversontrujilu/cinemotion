<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { user, loggedIn, logout } = useAuth()

const links = computed<NavigationMenuItem[]>(() => [
  { label: 'Sessões', icon: 'i-lucide-clapperboard', to: '/' },
  ...(loggedIn.value ? [{ label: 'Minhas reservas', icon: 'i-lucide-ticket', to: '/minhas-reservas' }] : [])
])

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [{ label: 'Sair', icon: 'i-lucide-log-out', onSelect: () => logout() }]
])
</script>

<template>
  <div>
    <UHeader to="/">
      <template #title>
        <img
          src="/logo.svg"
          alt=""
          class="size-7"
        >
        <span>Cinemotion</span>
      </template>

      <ClientOnly>
        <UNavigationMenu :items="links" />
      </ClientOnly>

      <template #right>
        <UColorModeButton />
        <ClientOnly>
          <UDropdownMenu
            v-if="loggedIn"
            :items="userMenu"
          >
            <UButton
              :label="user?.email ?? 'Minha conta'"
              icon="i-lucide-circle-user"
              color="neutral"
              variant="ghost"
              :aria-label="user?.email ?? 'Minha conta'"
              class="max-w-56"
              :ui="{ label: 'truncate max-sm:hidden' }"
            />
          </UDropdownMenu>
          <template v-else>
            <UButton
              label="Entrar"
              color="neutral"
              variant="ghost"
              to="/entrar"
            />
            <UButton
              label="Criar conta"
              to="/cadastro"
              class="max-sm:hidden"
            />
          </template>
        </ClientOnly>
      </template>

      <template #body>
        <ClientOnly>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
          />
        </ClientOnly>
      </template>
    </UHeader>

    <UMain>
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Cinemotion · horários no fuso de Brasília
        </p>
      </template>
    </UFooter>
  </div>
</template>
