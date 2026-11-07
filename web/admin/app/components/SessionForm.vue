<script setup lang="ts">
import type { Movie, Session, TheaterSummary } from '#api'

/** Cria ou edita uma Sessão. Data e hora são digitadas no fuso da rede. */
const props = defineProps<{ session: Session | null, movies: Movie[], theaters: TheaterSummary[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const toast = useToast()

const form = reactive({ movieId: '', theaterId: '', date: '', time: '19:00', price: 30 })
const saving = ref(false)

watch(open, (value) => {
  if (!value) return
  const s = props.session
  Object.assign(form, s
    ? { movieId: s.movie.id, theaterId: s.theater.id, date: networkDate(new Date(s.startsAt)), time: networkTime(new Date(s.startsAt)), price: s.price }
    : { movieId: props.movies[0]?.id ?? '', theaterId: props.theaters[0]?.id ?? '', date: networkDate(new Date(Date.now() + 86_400_000)), time: '19:00', price: 30 })
})

const movieItems = computed(() => props.movies.map(m => ({ label: `${m.title} (${formatDuration(m.duration)})`, value: m.id })))
const theaterItems = computed(() => props.theaters.map(t => ({ label: t.name, value: t.id })))

const endsAt = computed(() => {
  const movie = props.movies.find(m => m.id === form.movieId)
  if (!movie || !form.date || !form.time) return ''
  return formatTime(new Date(new Date(toNetworkIso(form.date, form.time)).getTime() + (movie.duration + 15) * 60_000).toISOString())
})

async function save() {
  saving.value = true
  try {
    const body = { movieId: form.movieId, theaterId: form.theaterId, startsAt: toNetworkIso(form.date, form.time), price: Number(form.price) }
    if (props.session) await api(`/sessions/${props.session.id}`, { method: 'PATCH', body })
    else await api('/sessions', { method: 'POST', body })
    toast.add({ title: props.session ? 'Sessão atualizada.' : 'Sessão criada.', color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('saved')
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="session ? 'Editar sessão' : 'Nova sessão'"
    :description="session ? 'Sessões com Reservas ativas não podem ser alteradas.' : undefined"
  >
    <template #body>
      <UForm
        id="session-form"
        :state="form"
        class="space-y-4"
        @submit="save"
      >
        <UFormField
          label="Filme"
          name="movieId"
          required
        >
          <USelect
            v-model="form.movieId"
            :items="movieItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Sala"
          name="theaterId"
          required
        >
          <USelect
            v-model="form.theaterId"
            :items="theaterItems"
            class="w-full"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField
            label="Dia"
            name="date"
            required
          >
            <UInput
              v-model="form.date"
              type="date"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField
            label="Início"
            name="time"
            :help="endsAt ? `Sala ocupada até ${endsAt} (filme + 15 min)` : undefined"
            required
          >
            <UInput
              v-model="form.time"
              type="time"
              class="w-full"
              required
            />
          </UFormField>
        </div>
        <UFormField
          label="Preço por assento (R$)"
          name="price"
          required
        >
          <UInput
            v-model="form.price"
            type="number"
            min="0"
            step="0.01"
            class="w-full"
            required
          />
        </UFormField>
        <p class="text-xs text-muted">
          Horários no fuso de Brasília ({{ NETWORK_TIMEZONE }}).
        </p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="session-form"
          label="Salvar"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
