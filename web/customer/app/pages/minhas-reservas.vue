<script setup lang="ts">
import type { Reservation } from '#api'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Minhas reservas' })

const api = useApi()
const { data: reservations, status, error, refresh } = useAsyncData(
  'my-reservations',
  () => api<Reservation[]>('/reservations'),
  { server: false, default: () => [] }
)
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <h1 class="text-2xl font-bold">
      Minhas reservas
    </h1>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="problemMessage(error)"
      :actions="[{ label: 'Tentar de novo', onClick: () => refresh() }]"
    />

    <div
      v-else-if="status !== 'success'"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-20"
      />
    </div>

    <div
      v-else-if="!reservations.length"
      class="flex flex-col items-center gap-3 py-16 text-center text-muted"
    >
      <UIcon
        name="i-lucide-ticket"
        class="size-10"
      />
      <p>Você ainda não fez nenhuma reserva.</p>
      <UButton
        label="Ver sessões"
        to="/"
      />
    </div>

    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="reservation in reservations"
        :key="reservation.id"
      >
        <NuxtLink
          :to="{ path: '/reserva', query: { id: reservation.id } }"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 ring-1 ring-default transition-colors hover:bg-elevated/50"
        >
          <div class="min-w-0">
            <p class="truncate font-semibold">
              {{ reservation.session.movieTitle }}
            </p>
            <p class="text-sm text-muted">
              {{ formatSessionTime(reservation.session.startsAt) }} · {{ reservation.session.theaterName }} ·
              {{ reservation.seats.map(s => s.label).join(', ') }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">{{ formatPrice(reservation.total) }}</span>
            <ReservationStatus :status="reservation.status" />
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
