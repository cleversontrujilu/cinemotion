// Páginas com `definePageMeta({ middleware: 'auth' })` exigem login.
// No prerender (servidor) não há sessão: a verificação acontece no navegador.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (!useAuth().loggedIn.value) {
    return navigateTo({ path: '/entrar', query: { redirect: to.fullPath } })
  }
})
