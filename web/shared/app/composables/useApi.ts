/**
 * $fetch apontando para a API do site, no mesmo domínio (`/api` ou `/api/admin`).
 * Envia o token Bearer; em 401 a sessão local é descartada.
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public
  const token = useAuthToken()

  return $fetch.create({
    baseURL: apiBase,
    onRequest({ options }) {
      if (token.value) options.headers.set('authorization', `Bearer ${token.value.accessToken}`)
    },
    onResponseError({ response }) {
      if (response.status === 401) saveToken(null)
    }
  })
}
