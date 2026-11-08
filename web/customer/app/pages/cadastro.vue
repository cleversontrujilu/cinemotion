<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

useHead({ title: 'Criar conta' })

const api = useApi()
const route = useRoute()
const { login } = useAuth()

const state = reactive({ email: '', password: '', confirm: '' })
const loading = ref(false)
const error = ref('')

function validate(s: typeof state): FormError[] {
  const errors: FormError[] = []
  if (s.password && s.password.length < PASSWORD_MIN_LENGTH) {
    errors.push({ name: 'password', message: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.` })
  }
  if (s.confirm && s.confirm !== s.password) errors.push({ name: 'confirm', message: 'As senhas não conferem.' })
  return errors
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await api('/auth/register', { method: 'POST', body: { email: state.email, password: state.password } })
    await login(state.email, state.password)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (err) {
    error.value = problemMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <UCard>
      <template #header>
        <h1 class="text-xl font-bold">
          Criar conta
        </h1>
      </template>
      <UForm
        :state="state"
        :validate="validate"
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
          :hint="`mín. ${PASSWORD_MIN_LENGTH}`"
          required
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField
          label="Confirme a senha"
          name="confirm"
          required
        >
          <UInput
            v-model="state.confirm"
            type="password"
            autocomplete="new-password"
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
          label="Criar conta"
          block
          :loading="loading"
        />
      </UForm>
      <template #footer>
        <p class="text-center text-sm text-muted">
          Já tem conta?
          <ULink
            :to="{ path: '/entrar', query: route.query }"
            class="font-medium text-primary"
          >
            Entrar
          </ULink>
        </p>
      </template>
    </UCard>
  </div>
</template>
