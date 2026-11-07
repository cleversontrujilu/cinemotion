import type { Token, User } from '#api'

export function useAuth() {
  const token = useAuthToken()
  const user = useState<User | null>('auth-user', () => null)
  const api = useApi()

  const loggedIn = computed(() => !!token.value && token.value.expiresAt > Date.now())

  async function fetchUser() {
    if (!token.value) {
      user.value = null
      return null
    }
    try {
      user.value = await api<User>('/auth/me')
    } catch {
      user.value = null
    }
    return user.value
  }

  async function login(email: string, password: string) {
    saveToken(await api<Token>('/auth/login', { method: 'POST', body: { email, password } }))
    await fetchUser()
  }

  async function logout(to = '/') {
    saveToken(null)
    user.value = null
    await navigateTo(to)
  }

  return { token, user, loggedIn, fetchUser, login, logout }
}
