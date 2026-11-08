<script setup lang="ts">
import type { Session } from '#api'

defineProps<{ session: Session }>()
</script>

<template>
  <UCard :ui="{ body: 'flex h-full flex-col gap-3' }">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate font-semibold">
          {{ session.movie.title }}
        </h3>
        <p class="text-sm text-muted">
          {{ formatDuration(session.movie.duration) }} · {{ session.theater.name }}
        </p>
      </div>
      <UBadge
        :label="formatTime(session.startsAt)"
        size="lg"
        variant="subtle"
        icon="i-lucide-clock"
      />
    </div>
    <div class="mt-auto flex items-center justify-between">
      <span class="font-medium">{{ formatPrice(session.price) }}</span>
      <UButton
        label="Escolher assentos"
        trailing-icon="i-lucide-arrow-right"
        :to="{ path: '/sessao', query: { id: session.id } }"
      />
    </div>
  </UCard>
</template>
