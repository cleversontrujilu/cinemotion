<script setup lang="ts">
import type { Theater, TheaterSummary } from '#api'

useHead({ title: 'Salas' })

const api = useApi()
const toast = useToast()

const { data: theaters, status, refresh } = useAsyncData('admin-theaters', () => api<TheaterSummary[]>('/theaters'), { server: false, default: () => [] })

const formOpen = ref(false)
const form = reactive({ name: '', rows: 8, seatsPerRow: 12 })
const saving = ref(false)

const rowLetter = (index: number) => {
  let label = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label
  return label
}
const preview = computed(() => {
  const rows = Number(form.rows) || 0
  const per = Number(form.seatsPerRow) || 0
  return rows && per ? `${rows * per} assentos, de A1 a ${rowLetter(rows - 1)}${per}` : ''
})

async function create() {
  saving.value = true
  try {
    const theater = await api<Theater>('/theaters', {
      method: 'POST',
      body: { name: form.name, rows: Number(form.rows), seatsPerRow: Number(form.seatsPerRow) }
    })
    toast.add({ title: 'Sala criada. Marque agora os assentos acessíveis e em manutenção.', color: 'success', icon: 'i-lucide-check' })
    await navigateTo({ path: '/sala', query: { id: theater.id } })
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}

const deleting = ref<TheaterSummary | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: v => !v && (deleting.value = null) })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">
        Salas
      </h1>
      <UButton
        label="Nova sala"
        icon="i-lucide-plus"
        @click="Object.assign(form, { name: '', rows: 8, seatsPerRow: 12 }); formOpen = true"
      />
    </div>

    <USkeleton
      v-if="status !== 'success'"
      class="h-48"
    />
    <p
      v-else-if="!theaters.length"
      class="py-12 text-center text-muted"
    >
      Nenhuma sala cadastrada.
    </p>
    <div
      v-else
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="theater in theaters"
        :key="theater.id"
        :ui="{ body: 'flex items-center justify-between gap-3' }"
      >
        <div class="min-w-0">
          <p class="truncate font-semibold">
            {{ theater.name }}
          </p>
          <p class="text-sm text-muted">
            {{ theater.seatCount }} assentos
          </p>
        </div>
        <div class="flex shrink-0">
          <UButton
            label="Mapa"
            icon="i-lucide-armchair"
            color="neutral"
            variant="outline"
            :to="{ path: '/sala', query: { id: theater.id } }"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :aria-label="`Excluir ${theater.name}`"
            @click="deleting = theater"
          />
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="formOpen"
      title="Nova sala"
      description="O mapa é retangular: fileiras A, B, C… com assentos numerados a partir de 1."
    >
      <template #body>
        <UForm
          id="theater-form"
          :state="form"
          class="space-y-4"
          @submit="create"
        >
          <UFormField
            label="Nome"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
              maxlength="55"
              required
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField
              label="Fileiras"
              name="rows"
              required
            >
              <UInput
                v-model="form.rows"
                type="number"
                min="1"
                max="30"
                class="w-full"
                required
              />
            </UFormField>
            <UFormField
              label="Assentos por fileira"
              name="seatsPerRow"
              required
            >
              <UInput
                v-model="form.seatsPerRow"
                type="number"
                min="1"
                max="99"
                class="w-full"
                required
              />
            </UFormField>
          </div>
          <p
            v-if="preview"
            class="text-sm text-muted"
          >
            {{ preview }}. O mapa não muda depois de criado.
          </p>
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
            form="theater-form"
            label="Criar sala"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>

    <ConfirmDelete
      v-model:open="deleteOpen"
      :title="`Excluir ${deleting?.name}?`"
      description="Salas com sessões não podem ser excluídas."
      :action="() => api(`/theaters/${deleting!.id}`, { method: 'DELETE' })"
      @done="refresh(); toast.add({ title: 'Sala excluída.', icon: 'i-lucide-trash-2' })"
    />
  </div>
</template>
