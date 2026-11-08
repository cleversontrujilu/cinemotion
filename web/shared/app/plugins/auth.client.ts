// Antes da primeira navegação: recupera o token salvo e, sem bloquear, busca o usuário.
export default defineNuxtPlugin(() => {
  restoreToken()
  const { token, user, fetchUser } = useAuth()
  void fetchUser()
  // Quando o token some (logout ou 401), o usuário também.
  watch(token, (value) => {
    if (!value) user.value = null
  })
})
