<script setup lang="ts">
import type { Movie, Page, Session } from '#api'

useHead({ title: 'Sessões' })

const api = useApi()
const PAGE_SIZE = 12

const filters = reactive({ movieId: 'all', date: '' })
const page = ref(1)
watch(filters, () => (page.value = 1))

const { data: movies } = useAsyncData('movies', () => api<Movie[]>('/movies'), { server: false, default: () => [] })

const movieItems = computed(() => [
  { label: 'Todos os filmes', value: 'all' },
  ...movies.value.map(m => ({ label: m.title, value: m.id }))
])

const { data: sessions, status, error, refresh } = useAsyncData(
  'sessions',
  () => api<Page<Session>>('/sessions', {
    query: {
      page: page.value,
      pageSize: PAGE_SIZE,
      ...(filters.movieId !== 'all' && { movieId: filters.movieId }),
      ...(filters.date && { date: filters.date })
    }
  }),
  { server: false, watch: [filters, page] }
)

/** Sessões agrupadas pelo dia (no fuso da rede), na ordem em que a API devolve. */
const days = computed(() => {
  const groups = new Map<string, Session[]>()
  for (const session of sessions.value?.items ?? []) {
    const day = networkDate(new Date(session.startsAt))
    groups.set(day, [...(groups.get(day) ?? []), session])
  }
  return [...groups.entries()].map(([day, items]) => ({ day, label: formatLongDate(items[0]!.startsAt), items }))
})

const today = networkDate()
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Sessões
        </h1>
        <p class="text-muted">
          Escolha a sessão e os assentos. A reserva segura os lugares por {{ HOLD_MINUTES }} minutos.
        </p>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <UFormField label="Filme">
          <USelect
            v-model="filters.movieId"
            :items="movieItems"
            class="w-full sm:w-56"
          />
        </UFormField>
        <UFormField label="Dia">
          <div class="flex gap-1">
            <UInput
              v-model="filters.date"
              type="date"
              :min="today"
              class="w-full sm:w-44"
            />
            <UButton
              v-if="filters.date"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              aria-label="Limpar o dia"
              @click="filters.date = ''"
            />
          </div>
        </UFormField>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Não foi possível carregar as sessões"
      :description="problemMessage(error)"
      :actions="[{ label: 'Tentar de novo', onClick: () => refresh() }]"
    />

    <div
      v-else-if="status !== 'success'"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <USkeleton
        v-for="n in 6"
        :key="n"
        class="h-36"
      />
    </div>

    <div
      v-else-if="!days.length"
      class="flex flex-col items-center gap-2 py-16 text-center text-muted"
    >
      <UIcon
        name="i-lucide-calendar-x"
        class="size-10"
      />
      <p>Nenhuma sessão encontrada com esses filtros.</p>
    </div>

    <template v-else>
      <section
        v-for="group in days"
        :key="group.day"
        class="space-y-3"
      >
        <h2 class="text-lg font-semibold first-letter:uppercase">
          {{ group.label }}
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SessionCard
            v-for="session in group.items"
            :key="session.id"
            :session="session"
          />
        </div>
      </section>

      <div
        v-if="(sessions?.totalPages ?? 0) > 1"
        class="flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="sessions?.total ?? 0"
          :items-per-page="PAGE_SIZE"
        />
      </div>
    </template>
  </div>
</template>
