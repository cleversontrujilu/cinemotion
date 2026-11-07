// Site do administrador. Estático (`nuxt generate`), publicado no S3 atrás de outra
// distribuição CloudFront, que encaminha `/api/*` para a API admin (rotas em /api/admin).
// No ambiente local, o devProxy faz o mesmo.
export default defineNuxtConfig({
  extends: ['../shared'],

  runtimeConfig: {
    public: { apiBase: '/api/admin' }
  },

  app: {
    head: { meta: [{ name: 'robots', content: 'noindex' }] }
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/entrar', '/salas', '/sala', '/filmes']
    },
    devProxy: {
      '/api': { target: 'http://localhost:3001/api', changeOrigin: true }
    }
  },

  devtools: { enabled: true }
})
