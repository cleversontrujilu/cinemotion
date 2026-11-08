<script setup lang="ts">
/** Confirmação de exclusão. Erros da API (ex.: 409 in-use) aparecem num toast. */
const props = defineProps<{ title: string, description?: string, action: () => Promise<unknown> }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [] }>()

const toast = useToast()
const loading = ref(false)

async function confirm() {
  loading.value = true
  try {
    await props.action()
    open.value = false
    emit('done')
  } catch (err) {
    toast.add({ title: problemMessage(err), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description ?? 'Essa ação não pode ser desfeita.'"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Voltar"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Excluir"
          color="error"
          icon="i-lucide-trash-2"
          :loading="loading"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
