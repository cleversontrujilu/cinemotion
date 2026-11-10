<script setup lang="ts">
import type { Movie } from '#api'

useHead({ title: 'Filmes' })

const api = useApi()
const toast = useToast()

const { data: movies, status, refresh } = useAsyncData('admin-movies', () => api<Movie[]>('/movies'), { server: false, default: () => [] })

const formOpen = ref(false)
const editing = ref<Movie | null>(null)
const form = reactive({ title: '', duration: 120 })
const saving = ref(false)

function openForm(movie: Movie | null) {
  editing.value = movie
  Object.assign(form, movie ? { title: movie.title, duration: movie.duration } : { title: '', duration: 120 })
  formOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const body = { title: form.title, duration: Number(form.duration) }
    if (editing.value) await api(`/movies/${editing.value.id}`, { method: 'PATCH', body })
    else await api('/movies', { method: 'POST', body })
    toast.add({ title: editing.value ? 'Filme atualizado.' : 'Filme cadastrado.', color: 'success', icon: 'i-lucide-check' })
    formOpen.value = false
    await refresh()
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

const deleting = ref<Movie | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: v => !v && (deleting.value = null) })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">
        Filmes
      </h1>
      <UButton
        label="Novo filme"
        icon="i-lucide-plus"
        @click="openForm(null)"
      />
    </div>

    <USkeleton
      v-if="status !== 'success'"
      class="h-48"
    />
    <p
      v-else-if="!movies.length"
      class="py-12 text-center text-muted"
    >
      Nenhum filme cadastrado.
    </p>
    <div
      v-else
      class="overflow-x-auto rounded-lg ring-1 ring-default"
    >
      <table class="w-full text-sm">
        <thead class="bg-elevated/50 text-left text-muted">
          <tr>
            <th class="px-4 py-2 font-medium">
              Título
            </th>
            <th class="px-4 py-2 font-medium">
              Duração
            </th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="movie in movies"
            :key="movie.id"
          >
            <td class="px-4 py-2 font-medium">
              {{ movie.title }}
            </td>
            <td class="px-4 py-2 text-muted">
              {{ formatDuration(movie.duration) }}
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                :aria-label="`Editar ${movie.title}`"
                @click="openForm(movie)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                :aria-label="`Excluir ${movie.title}`"
                @click="deleting = movie"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editing ? 'Editar filme' : 'Novo filme'"
    >
      <template #body>
        <UForm
          id="movie-form"
          :state="form"
          class="space-y-4"
          @submit="save"
        >
          <UFormField
            label="Título"
            name="title"
            required
          >
            <UInput
              v-model="form.title"
              class="w-full"
              maxlength="200"
              required
            />
          </UFormField>
          <UFormField
            label="Duração (minutos)"
            name="duration"
            help="As sessões ocupam a sala pela duração mais 15 minutos de limpeza."
            required
          >
            <UInput
              v-model="form.duration"
              type="number"
              min="1"
              max="600"
              class="w-full"
              required
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="ghost"
            @click="formOpen = false"
          />
          <UButton
            type="submit"
            form="movie-form"
            label="Salvar"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>

    <ConfirmDelete
      v-model:open="deleteOpen"
      :title="`Excluir ${deleting?.title}?`"
      description="Filmes com sessões não podem ser excluídos."
      :action="() => api(`/movies/${deleting!.id}`, { method: 'DELETE' })"
      @done="refresh(); toast.add({ title: 'Filme excluído.', icon: 'i-lucide-trash-2' })"
    />
  </div>
</template>
