<script setup lang="ts">
import type { Seat, Theater } from '#api'
import type { GridSeat, SeatLook } from '#seats'

useHead({ title: 'Mapa da sala' })

const api = useApi()
const route = useRoute()
const toast = useToast()

const theaterId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const { data: theater, error } = useAsyncData(
  'admin-theater',
  () => api<Theater>(`/theaters/${theaterId.value}`),
  { server: false, watch: [theaterId], immediate: !!theaterId.value }
)

// Rascunho das marcações: só o que mudou vai no PATCH.
type Flags = Pick<Seat, 'accessible' | 'underMaintenance'>
const draft = ref<Record<string, Flags>>({})
watch(theater, () => (draft.value = {}))

const flagsOf = (seat: Seat): Flags => draft.value[seat.id] ?? { accessible: seat.accessible, underMaintenance: seat.underMaintenance }

const seats = computed(() => (theater.value?.seats ?? []).map(seat => ({ ...seat, ...flagsOf(seat) })))

const changed = computed(() =>
  (theater.value?.seats ?? []).filter((seat) => {
    const d = draft.value[seat.id]
    return d && (d.accessible !== seat.accessible || d.underMaintenance !== seat.underMaintenance)
  })
)

const mode = ref<'underMaintenance' | 'accessible'>('underMaintenance')
const modes = [
  { label: 'Manutenção', value: 'underMaintenance', icon: 'i-lucide-wrench' },
  { label: 'Acessível', value: 'accessible', icon: 'i-lucide-accessibility' }
]

function toggle(gridSeat: GridSeat) {
  const seat = theater.value!.seats.find(s => s.id === gridSeat.id)!
  const flags = flagsOf(seat)
  draft.value = { ...draft.value, [seat.id]: { ...flags, [mode.value]: !flags[mode.value] } }
}

function look(gridSeat: GridSeat): SeatLook {
  const seat = seats.value.find(s => s.id === gridSeat.id)!
  if (changed.value.some(s => s.id === seat.id)) return seat.underMaintenance ? 'conflict' : 'selected'
  return seat.underMaintenance ? 'unavailable' : 'available'
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    theater.value = await api<Theater>(`/theaters/${theaterId.value}/seats`, {
      method: 'PATCH',
      body: {
        seats: changed.value.map(seat => ({ seat: seat.label, ...draft.value[seat.id] }))
      }
    })
    toast.add({ title: 'Marcações salvas.', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

const name = ref('')
watch(theater, value => (name.value = value?.name ?? ''), { immediate: true })
async function rename() {
  try {
    theater.value = await api<Theater>(`/theaters/${theaterId.value}`, { method: 'PATCH', body: { name: name.value } })
    toast.add({ title: 'Nome atualizado.', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const summary = computed(() => ({
  total: seats.value.length,
  accessible: seats.value.filter(s => s.accessible).length,
  maintenance: seats.value.filter(s => s.underMaintenance).length
}))

const legend: { look: SeatLook, label: string }[] = [
  { look: 'available', label: 'em uso' },
  { look: 'unavailable', label: 'em manutenção' },
  { look: 'selected', label: 'alterado' },
  { look: 'conflict', label: 'alterado para manutenção' }
]
</script>

<template>
  <div class="space-y-6">
    <UButton
      label="Salas"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      to="/salas"
      class="px-0"
    />

    <UAlert
      v-if="!theaterId || error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Sala não encontrada"
      :description="error ? problemMessage(error) : undefined"
    />

    <USkeleton
      v-else-if="!theater"
      class="h-96"
    />

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <form
          class="flex items-end gap-2"
          @submit.prevent="rename"
        >
          <UFormField label="Nome da sala">
            <UInput
              v-model="name"
              maxlength="55"
              class="w-64"
            />
          </UFormField>
          <UButton
            v-if="name !== theater.name"
            type="submit"
            label="Renomear"
            color="neutral"
            variant="outline"
          />
        </form>
        <p class="text-sm text-muted">
          {{ summary.total }} assentos · {{ summary.accessible }} acessíveis · {{ summary.maintenance }} em manutenção
        </p>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="text-sm text-muted">Clique para marcar:</span>
              <UTabs
                v-model="mode"
                :items="modes"
                :content="false"
                size="sm"
              />
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="changed.length"
                label="Descartar"
                color="neutral"
                variant="ghost"
                @click="draft = {}"
              />
              <UButton
                :label="changed.length ? `Salvar ${changed.length} ${changed.length === 1 ? 'alteração' : 'alterações'}` : 'Sem alterações'"
                icon="i-lucide-save"
                :disabled="!changed.length"
                :loading="saving"
                @click="save"
              />
            </div>
          </div>
        </template>
        <SeatGrid
          :seats="seats"
          :look="look"
          :clickable="() => true"
          @toggle="toggle"
        />
        <template #footer>
          <SeatLegend :items="legend" />
          <p class="mt-2 text-xs text-muted">
            Assento em manutenção não pode ser reservado; Reservas já feitas nele continuam valendo.
          </p>
        </template>
      </UCard>
    </template>
  </div>
</template>
