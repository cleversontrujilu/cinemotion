import type { Token } from '#api'

interface StoredToken {
  accessToken: string
  /** Instante (ms) em que o token expira. */
  expiresAt: number
}

// O site é estático e a API usa Bearer: o token fica no localStorage do domínio do site.
// Cada site tem o seu domínio, então os tokens do cliente e do admin não se misturam.
const STORAGE_KEY = 'cinemotion:token'

export const useAuthToken = () => useState<StoredToken | null>('auth-token', () => null)

export function saveToken(token: Token | null) {
  const state = useAuthToken()
  state.value = token && { accessToken: token.accessToken, expiresAt: Date.now() + token.expiresIn * 1000 }
  try {
    if (state.value) localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* navegação privada: o token vale só nesta aba */ }
}

/** Lê o token salvo (só no navegador), descartando o que já expirou. */
export function restoreToken() {
  const state = useAuthToken()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as StoredToken | null
    state.value = saved && saved.expiresAt > Date.now() ? saved : null
  } catch {
    state.value = null
  }
}
