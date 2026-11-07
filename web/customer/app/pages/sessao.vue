<script setup lang="ts">
import type { OccupancyMap, OccupancySeat, Reservation, Session } from '#api'
import type { GridSeat, SeatLook } from '#seats'

useHead({ title: 'Escolha os assentos' })

const api = useApi()
const route = useRoute()
const toast = useToast()
const { loggedIn } = useAuth()

// O id vem na query (`/sessao?id=`): o site é estático e não conhece as Sessões no build.
const sessionId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const { data: session, error: sessionError } = useAsyncData(
  'session',
  () => api<Session>(`/sessions/${sessionId.value}`),
  { server: false, watch: [sessionId], immediate: !!sessionId.value }
)
const { data: map, refresh: refreshMap } = useAsyncData(
  'session-seats',
  () => api<OccupancyMap>(`/sessions/${sessionId.value}/seats`),
  { server: false, watch: [sessionId], immediate: !!sessionId.value }
)

// O mapa muda enquanto o cliente escolhe: atualiza a cada 20 s e ao voltar para a aba.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => sessionId.value && refreshMap(), 20_000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
function onVisible() {
  if (document.visibilityState === 'visible' && sessionId.value) void refreshMap()
}

const selected = ref<string[]>([])
const conflicts = ref<string[]>([])

const seatById = computed(() => new Map((map.value?.seats ?? []).map(s => [s.id, s])))

// Assento que deixou de estar livre sai da seleção.
watch(map, (value) => {
  if (!value) return
  selected.value = selected.value.filter(id => seatById.value.get(id)?.state === 'available')
})

function look(seat: GridSeat): SeatLook {
  if (conflicts.value.includes(seat.id)) return 'conflict'
  if (selected.value.includes(seat.id)) return 'selected'
  return (seat as OccupancySeat).state
}

const clickable = (seat: GridSeat) => (seat as OccupancySeat).state === 'available'

function toggle(seat: GridSeat) {
  conflicts.value = []
  if (selected.value.includes(seat.id)) {
    selected.value = selected.value.filter(id => id !== seat.id)
  } else if (selected.value.length >= MAX_SEATS_PER_RESERVATION) {
    toast.add({ title: `Uma reserva tem no máximo ${MAX_SEATS_PER_RESERVATION} assentos.`, color: 'warning', icon: 'i-lucide-info' })
  } else {
    selected.value = [...selected.value, seat.id]
  }
}

const selectedLabels = computed(() =>
  selected.value.map(id => seatById.value.get(id)?.label).filter(Boolean).join(', ')
)
const total = computed(() => (session.value?.price ?? 0) * selected.value.length)

const reserving = ref(false)

async function reserve() {
  if (!loggedIn.value) {
    toast.add({ title: 'Entre na sua conta para reservar.', icon: 'i-lucide-log-in' })
    return navigateTo({ path: '/entrar', query: { redirect: route.fullPath } })
  }
  reserving.value = true
  try {
    const reservation = await api<Reservation>('/reservations', {
      method: 'POST',
      body: { sessionId: sessionId.value, seatIds: selected.value }
    })
    await navigateTo({ path: '/reserva', query: { id: reservation.id } })
  } catch (err) {
    const problem = asProblem(err)
    if (problem?.conflictingSeats?.length) {
      conflicts.value = problem.conflictingSeats.map(s => s.id)
      selected.value = selected.value.filter(id => !conflicts.value.includes(id))
      toast.add({
        title: `Outra pessoa acabou de reservar: ${problem.conflictingSeats.map(s => s.label).join(', ')}`,
        description: 'Escolha outro assento. Nenhum dos lugares ficou reservado.',
        color: 'error',
        icon: 'i-lucide-armchair'
      })
    } else {
      toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    await refreshMap()
  } finally {
    reserving.value = false
  }
}

const legend: { look: SeatLook, label: string }[] = [
  { look: 'available', label: 'livre' },
  { look: 'selected', label: 'sua escolha' },
  { look: 'reserved', label: 'reservado' },
  { look: 'sold', label: 'vendido' },
  { look: 'unavailable', label: 'indisponível' }
]
</script>

<template>
  <div class="space-y-6">
    <UButton
      label="Sessões"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      to="/"
      class="px-0"
    />

    <UAlert
      v-if="!sessionId || sessionError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Sessão não encontrada"
      :description="sessionError ? problemMessage(sessionError) : 'Escolha uma sessão na lista.'"
    />

    <template v-else>
      <div
        v-if="session"
        class="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 class="text-2xl font-bold">
            {{ session.movie.title }}
          </h1>
          <p class="text-muted first-letter:uppercase">
            {{ formatLongDate(session.startsAt) }}, {{ formatTime(session.startsAt) }} ·
            {{ session.theater.name }} · {{ formatDuration(session.movie.duration) }}
          </p>
        </div>
        <span class="text-lg font-semibold">{{ formatPrice(session.price) }} <span class="text-sm font-normal text-muted">por assento</span></span>
      </div>
      <USkeleton
        v-else
        class="h-14 w-2/3"
      />

      <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <UCard>
          <SeatGrid
            v-if="map"
            :seats="map.seats"
            :look="look"
            :clickable="clickable"
            @toggle="toggle"
          />
          <USkeleton
            v-else
            class="h-80"
          />
          <template #footer>
            <SeatLegend :items="legend" />
          </template>
        </UCard>

        <UCard
          class="h-fit lg:sticky lg:top-(--ui-header-height)"
          :ui="{ body: 'space-y-4' }"
        >
          <h2 class="font-semibold">
            Sua reserva
          </h2>
          <p
            v-if="!selected.length"
            class="text-sm text-muted"
          >
            Clique nos assentos livres para escolher (até {{ MAX_SEATS_PER_RESERVATION }}).
          </p>
          <dl
            v-else
            class="space-y-1 text-sm"
          >
            <div class="flex justify-between gap-4">
              <dt class="text-muted">
                Assentos
              </dt>
              <dd class="text-right font-medium">
                {{ selectedLabels }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted">
                Total
              </dt>
              <dd class="font-semibold">
                {{ formatPrice(total) }}
              </dd>
            </div>
          </dl>
          <UButton
            label="Reservar"
            icon="i-lucide-ticket"
            block
            size="lg"
            :disabled="!selected.length"
            :loading="reserving"
            @click="reserve"
          />
          <p class="text-xs text-muted">
            Os assentos ficam seus por {{ HOLD_MINUTES }} minutos até a confirmação do pagamento.
          </p>
          <p
            v-if="map"
            class="text-xs text-muted"
          >
            {{ map.summary.available }} livres · {{ map.summary.reserved }} reservados · {{ map.summary.sold }} vendidos
          </p>
        </UCard>
      </div>
    </template>
  </div>
</template>
