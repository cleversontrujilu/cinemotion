<script setup lang="ts">
/**
 * Mapa de assentos de uma Sala: fileiras na vertical, a tela em cima.
 * Quem usa decide o estado visual de cada assento e quais podem ser clicados.
 */
import type { GridSeat, SeatLook } from '#seats'

const props = defineProps<{
  seats: GridSeat[]
  look: (seat: GridSeat) => SeatLook
  clickable?: (seat: GridSeat) => boolean
}>()

const emit = defineEmits<{ toggle: [seat: GridSeat] }>()

const rows = computed(() => {
  const byRow = new Map<string, GridSeat[]>()
  for (const seat of props.seats) byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat])
  return [...byRow.entries()]
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(([row, seats]) => ({ row, seats: seats.sort((a, b) => a.number - b.number) }))
})

const LOOK_CLASS: Record<SeatLook, string> = {
  available: 'bg-default text-default ring-accented hover:ring-primary hover:bg-primary/10',
  selected: 'bg-primary text-inverted ring-primary',
  reserved: 'bg-amber-400/80 text-amber-950 ring-amber-500',
  sold: 'bg-elevated text-dimmed ring-default',
  unavailable: 'bg-elevated text-dimmed ring-default bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--ui-border)_4px,var(--ui-border)_6px)]',
  conflict: 'bg-error text-inverted ring-error animate-pulse'
}

const LOOK_LABEL: Record<SeatLook, string> = {
  available: 'livre',
  selected: 'selecionado',
  reserved: 'reservado',
  sold: 'vendido',
  unavailable: 'indisponível',
  conflict: 'acabou de ser ocupado'
}

const canClick = (seat: GridSeat) => props.clickable?.(seat) ?? false
</script>

<template>
  <div class="overflow-x-auto">
    <div class="mx-auto flex w-max flex-col items-center gap-2 p-2">
      <div class="mb-4 w-full">
        <div class="mx-auto h-1.5 w-3/4 rounded-full bg-primary/60 shadow-[0_6px_18px] shadow-primary/40" />
        <p class="mt-1 text-center text-xs tracking-[0.3em] text-muted uppercase">
          Tela
        </p>
      </div>

      <div
        v-for="{ row, seats: rowSeats } in rows"
        :key="row"
        class="flex items-center gap-1.5"
      >
        <span class="w-6 text-right text-xs font-medium text-muted">{{ row }}</span>
        <button
          v-for="seat in rowSeats"
          :key="seat.id"
          type="button"
          :disabled="!canClick(seat)"
          :title="`${seat.label} · ${LOOK_LABEL[look(seat)]}${seat.accessible ? ' · acessível' : ''}`"
          :aria-label="`Assento ${seat.label}, ${LOOK_LABEL[look(seat)]}${seat.accessible ? ', acessível' : ''}`"
          :aria-pressed="look(seat) === 'selected'"
          class="relative flex size-8 items-center justify-center rounded-t-lg rounded-b-sm text-[10px] font-semibold ring-1 transition-colors ring-inset disabled:cursor-not-allowed enabled:cursor-pointer"
          :class="LOOK_CLASS[look(seat)]"
          @click="emit('toggle', seat)"
        >
          <UIcon
            v-if="seat.accessible"
            name="i-lucide-accessibility"
            class="size-4"
          />
          <span v-else>{{ seat.number }}</span>
        </button>
        <span class="w-6 text-xs font-medium text-muted">{{ row }}</span>
      </div>
    </div>
  </div>
</template>
