<script setup lang="ts">
import type { Movie, Page, Session, TheaterSummary } from '#api'

useHead({ title: 'Sessões' })

const api = useApi()
const toast = useToast()
const PAGE_SIZE = 20

const { data: movies } = useAsyncData('admin-movies', () => api<Movie[]>('/movies'), { server: false, default: () => [] })
const { data: theaters } = useAsyncData('admin-theaters', () => api<TheaterSummary[]>('/theaters'), { server: false, default: () => [] })

const filters = reactive({ movieId: 'all', theaterId: 'all', date: '', includePast: false })
const page = ref(1)
watch(filters, () => (page.value = 1))

const { data: sessions, status, error, refresh } = useAsyncData(
  'admin-sessions',
  () => api<Page<Session>>('/sessions', {
    query: {
      page: page.value,
      pageSize: PAGE_SIZE,
      ...(filters.movieId !== 'all' && { movieId: filters.movieId }),
      ...(filters.theaterId !== 'all' && { theaterId: filters.theaterId }),
      ...(filters.date && { date: filters.date }),
      ...(filters.includePast && { includePast: 'true' })
    }
  }),
  { server: false, watch: [filters, page] }
)

const movieItems = computed(() => [{ label: 'Todos os filmes', value: 'all' }, ...movies.value.map(m => ({ label: m.title, value: m.id }))])
const theaterItems = computed(() => [{ label: 'Todas as salas', value: 'all' }, ...theaters.value.map(t => ({ label: t.name, value: t.id }))])

const formOpen = ref(false)
const editing = ref<Session | null>(null)
function openForm(session: Session | null) {
  editing.value = session
  formOpen.value = true
}

const deleting = ref<Session | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: v => !v && (deleting.value = null) })

const isPast = (session: Session) => new Date(session.startsAt).getTime() < Date.now()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">
        Sessões
      </h1>
      <UButton
        label="Nova sessão"
        icon="i-lucide-plus"
        :disabled="!movies.length || !theaters.length"
        @click="openForm(null)"
      />
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Filme">
        <USelect
          v-model="filters.movieId"
          :items="movieItems"
          class="w-52"
        />
      </UFormField>
      <UFormField label="Sala">
        <USelect
          v-model="filters.theaterId"
          :items="theaterItems"
          class="w-40"
        />
      </UFormField>
      <UFormField label="Dia">
        <UInput
          v-model="filters.date"
          type="date"
          class="w-44"
        />
      </UFormField>
      <UCheckbox
        v-model="filters.includePast"
        label="Incluir sessões passadas"
        class="pb-2"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="problemMessage(error)"
    />
    <USkeleton
      v-else-if="status !== 'success'"
      class="h-64"
    />
    <p
      v-else-if="!sessions?.items.length"
      class="py-12 text-center text-muted"
    >
      Nenhuma sessão encontrada.
    </p>
    <div
      v-else
      class="overflow-x-auto rounded-lg ring-1 ring-default"
    >
      <table class="w-full text-sm">
        <thead class="bg-elevated/50 text-left text-muted">
          <tr>
            <th class="px-4 py-2 font-medium">
              Início
            </th>
            <th class="px-4 py-2 font-medium">
              Fim
            </th>
            <th class="px-4 py-2 font-medium">
              Filme
            </th>
            <th class="px-4 py-2 font-medium">
              Sala
            </th>
            <th class="px-4 py-2 text-right font-medium">
              Preço
            </th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="session in sessions.items"
            :key="session.id"
            :class="{ 'text-muted': isPast(session) }"
          >
            <td class="px-4 py-2 whitespace-nowrap">
              {{ formatSessionTime(session.startsAt) }}
            </td>
            <td class="px-4 py-2 whitespace-nowrap text-muted">
              {{ formatTime(session.endsAt) }}
            </td>
            <td class="px-4 py-2 font-medium">
              {{ session.movie.title }}
            </td>
            <td class="px-4 py-2">
              {{ session.theater.name }}
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              {{ formatPrice(session.price) }}
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                :aria-label="`Editar sessão de ${session.movie.title}`"
                :disabled="isPast(session)"
                @click="openForm(session)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                :aria-label="`Excluir sessão de ${session.movie.title}`"
                @click="deleting = session"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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

    <SessionForm
      v-model:open="formOpen"
      :session="editing"
      :movies="movies"
      :theaters="theaters"
      @saved="refresh()"
    />

    <ConfirmDelete
      v-model:open="deleteOpen"
      :title="deleting ? `Excluir a sessão de ${deleting.movie.title}?` : ''"
      :description="deleting ? `${formatSessionTime(deleting.startsAt)} · ${deleting.theater.name}. Sessões com Reservas ativas não podem ser excluídas.` : ''"
      :action="() => api(`/sessions/${deleting!.id}`, { method: 'DELETE' })"
      @done="refresh(); toast.add({ title: 'Sessão excluída.', icon: 'i-lucide-trash-2' })"
    />
  </div>
</template>
