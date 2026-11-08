<script setup lang="ts">
import type { Reservation } from '#api'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Reserva' })

const api = useApi()
const route = useRoute()
const toast = useToast()

const reservationId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const { data: reservation, error, refresh } = useAsyncData(
  'reservation',
  () => api<Reservation>(`/reservations/${reservationId.value}`),
  { server: false, watch: [reservationId], immediate: !!reservationId.value }
)

const isPending = computed(() => reservation.value?.status === 'pending')
const { seconds, label: countdown } = useCountdown(computed(() => (isPending.value ? reservation.value?.expiresAt : undefined)))

// Ao zerar o prazo, a API já considera a Reserva expirada: busca de novo para mostrar.
watch(seconds, (value, old) => {
  if (isPending.value && old > 0 && value === 0) void refresh()
})

const deadline = computed(() =>
  reservation.value
    ? new Date(new Date(reservation.value.session.startsAt).getTime() - CANCELLATION_DEADLINE_HOURS * 3_600_000).toISOString()
    : undefined
)
const canCancel = computed(() =>
  !!reservation.value
  && ['pending', 'confirmed'].includes(reservation.value.status)
  && new Date(deadline.value!).getTime() > Date.now()
)

const busy = ref<'confirm' | 'cancel' | null>(null)
const cancelOpen = ref(false)

async function act(action: 'confirm' | 'cancel') {
  busy.value = action
  try {
    reservation.value = await api<Reservation>(`/reservations/${reservationId.value}/${action}`, { method: 'POST' })
    toast.add(action === 'confirm'
      ? { title: 'Pagamento confirmado. Bom filme!', color: 'success', icon: 'i-lucide-party-popper' }
      : { title: 'Reserva cancelada. Os assentos foram liberados.', icon: 'i-lucide-circle-x' })
  } catch (err) {
    const problem = asProblem(err)
    toast.add({
      title: problemMessage(err),
      description: problem?.deadline ? `O prazo terminou em ${formatDateTime(problem.deadline)}.` : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    await refresh()
  } finally {
    busy.value = null
    cancelOpen.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <UButton
      label="Minhas reservas"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      to="/minhas-reservas"
      class="px-0"
    />

    <UAlert
      v-if="!reservationId || error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Reserva não encontrada"
      :description="error ? problemMessage(error) : undefined"
    />

    <USkeleton
      v-else-if="!reservation"
      class="h-72"
    />

    <UCard
      v-else
      :ui="{ body: 'space-y-6' }"
    >
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-xl font-bold">
              {{ reservation.session.movieTitle }}
            </h1>
            <p class="text-muted first-letter:uppercase">
              {{ formatLongDate(reservation.session.startsAt) }}, {{ formatTime(reservation.session.startsAt) }} ·
              {{ reservation.session.theaterName }}
            </p>
          </div>
          <ReservationStatus :status="reservation.status" />
        </div>
      </template>

      <div
        v-if="isPending"
        class="flex items-center gap-4 rounded-lg bg-warning/10 p-4"
      >
        <span class="font-mono text-3xl font-bold tabular-nums text-warning">{{ countdown }}</span>
        <p class="text-sm">
          Seus assentos estão guardados até {{ formatTime(reservation.expiresAt) }}.
          Confirme o pagamento antes disso, ou eles voltam a ficar livres.
        </p>
      </div>

      <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-muted">
            Assentos
          </dt>
          <dd class="font-medium">
            {{ reservation.seats.map(s => s.label).join(', ') }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Preço
          </dt>
          <dd>{{ formatPrice(reservation.session.price) }} × {{ reservation.seats.length }}</dd>
        </div>
        <div>
          <dt class="text-muted">
            Total
          </dt>
          <dd class="text-lg font-semibold">
            {{ formatPrice(reservation.total) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Feita em
          </dt>
          <dd>{{ formatDateTime(reservation.createdAt) }}</dd>
        </div>
        <div v-if="reservation.confirmedAt">
          <dt class="text-muted">
            Paga em
          </dt>
          <dd>{{ formatDateTime(reservation.confirmedAt) }}</dd>
        </div>
        <div v-if="reservation.cancelledAt">
          <dt class="text-muted">
            Cancelada em
          </dt>
          <dd>{{ formatDateTime(reservation.cancelledAt) }}</dd>
        </div>
      </dl>

      <p
        v-if="['pending', 'confirmed'].includes(reservation.status)"
        class="text-xs text-muted"
      >
        Cancelamento permitido até {{ formatDateTime(deadline!) }} ({{ CANCELLATION_DEADLINE_HOURS }} horas antes da sessão).
      </p>

      <template
        v-if="isPending || canCancel"
        #footer
      >
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            v-if="canCancel"
            label="Cancelar reserva"
            color="neutral"
            variant="outline"
            :disabled="!!busy"
            @click="cancelOpen = true"
          />
          <UButton
            v-if="isPending"
            label="Confirmar pagamento"
            icon="i-lucide-credit-card"
            :loading="busy === 'confirm'"
            :disabled="!!busy"
            @click="act('confirm')"
          />
        </div>
      </template>
    </UCard>

    <UModal
      v-model:open="cancelOpen"
      title="Cancelar a reserva?"
      description="Os assentos voltam a ficar livres para outras pessoas."
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Voltar"
            color="neutral"
            variant="ghost"
            @click="cancelOpen = false"
          />
          <UButton
            label="Cancelar reserva"
            color="error"
            :loading="busy === 'cancel'"
            @click="act('cancel')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
