<script setup lang="ts">
import type { SeatLook } from '#seats'

defineProps<{ items: { look: SeatLook, label: string }[] }>()

const SWATCH: Record<SeatLook, string> = {
  available: 'bg-default ring-accented',
  selected: 'bg-primary ring-primary',
  reserved: 'bg-amber-400/80 ring-amber-500',
  sold: 'bg-elevated ring-default',
  unavailable: 'bg-elevated ring-default bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--ui-border)_3px,var(--ui-border)_5px)]',
  conflict: 'bg-error ring-error'
}
</script>

<template>
  <ul class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
    <li
      v-for="item in items"
      :key="item.look"
      class="flex items-center gap-1.5"
    >
      <span
        class="size-4 rounded-t-md rounded-b-sm ring-1 ring-inset"
        :class="SWATCH[item.look]"
      />
      {{ item.label }}
    </li>
    <li class="flex items-center gap-1.5">
      <UIcon
        name="i-lucide-accessibility"
        class="size-4"
      />
      acessível
    </li>
  </ul>
</template>
