// No admin, tudo exige login, menos a própria tela de login.
// No prerender (servidor) não há sessão: a verificação acontece no navegador.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server || to.path === '/entrar') return
  if (useAuth().loggedIn.value) return

  const target = { path: '/entrar', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  // No primeiro carregamento, o HTML pré-renderizado é o da página pedida, com o layout
  // completo. Trocar de layout durante a hidratação deixa a tela de login sem o layout
  // `auth`, então esse caso recarrega a página de login de verdade.
  if (useNuxtApp().isHydrating) {
    return navigateTo(useRouter().resolve(target).href, { replace: true, external: true })
  }
  return navigateTo(target)
})
