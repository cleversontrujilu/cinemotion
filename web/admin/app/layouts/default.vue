<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { user, logout } = useAuth()

const links: NavigationMenuItem[] = [
  { label: 'Sessões', icon: 'i-lucide-calendar-clock', to: '/' },
  { label: 'Salas', icon: 'i-lucide-armchair', to: '/salas' },
  { label: 'Filmes', icon: 'i-lucide-film', to: '/filmes' }
]

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [{ label: 'Sair', icon: 'i-lucide-log-out', onSelect: () => logout('/entrar') }]
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
        <UBadge
          label="Admin"
          variant="subtle"
          size="sm"
        />
      </template>

      <UNavigationMenu :items="links" />

      <template #right>
        <UColorModeButton />
        <ClientOnly>
          <UDropdownMenu :items="userMenu">
            <UButton
              :label="user?.email ?? 'Conta'"
              :aria-label="user?.email ?? 'Conta'"
              icon="i-lucide-circle-user"
              color="neutral"
              variant="ghost"
              class="max-w-56"
              :ui="{ label: 'truncate max-sm:hidden' }"
            />
          </UDropdownMenu>
        </ClientOnly>
      </template>

      <template #body>
        <UNavigationMenu
          :items="links"
          orientation="vertical"
        />
      </template>
    </UHeader>

    <UMain>
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </UMain>
  </div>
</template>
