<script setup lang="ts">
/** Formulário de login dos dois sites. Depois de entrar, segue para `?redirect=` ou para `home`. */
const props = withDefaults(defineProps<{ home?: string }>(), { home: '/' })

const { login } = useAuth()
const route = useRoute()

const state = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await login(state.email, state.password)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : props.home
    await navigateTo(redirect)
  } catch (err) {
    error.value = problemMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm
    :state="state"
    class="space-y-4"
    @submit="submit"
  >
    <UFormField
      label="E-mail"
      name="email"
      required
    >
      <UInput
        v-model="state.email"
        type="email"
        autocomplete="email"
        class="w-full"
        required
      />
    </UFormField>
    <UFormField
      label="Senha"
      name="password"
      required
    >
      <UInput
        v-model="state.password"
        type="password"
        autocomplete="current-password"
        class="w-full"
        required
      />
    </UFormField>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />
    <UButton
      type="submit"
      label="Entrar"
      block
      :loading="loading"
    />
  </UForm>
</template>
