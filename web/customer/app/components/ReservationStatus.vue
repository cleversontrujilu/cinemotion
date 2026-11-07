<script setup lang="ts">
import type { ReservationStatus } from '#api'

defineProps<{ status: ReservationStatus }>()

const STATUS: Record<ReservationStatus, { label: string, color: 'warning' | 'success' | 'neutral' | 'error', icon: string }> = {
  pending: { label: 'Aguardando pagamento', color: 'warning', icon: 'i-lucide-hourglass' },
  confirmed: { label: 'Confirmada', color: 'success', icon: 'i-lucide-circle-check' },
  cancelled: { label: 'Cancelada', color: 'neutral', icon: 'i-lucide-circle-x' },
  expired: { label: 'Expirada', color: 'error', icon: 'i-lucide-timer-off' }
}
</script>

<template>
  <UBadge
    :label="STATUS[status].label"
    :color="STATUS[status].color"
    :icon="STATUS[status].icon"
    variant="subtle"
  />
</template>
