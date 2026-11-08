// Site do cliente. Estático (`nuxt generate`), publicado no S3 atrás do CloudFront,
// que encaminha `/api/*` para a API do cliente. No ambiente local, o devProxy faz o mesmo.
export default defineNuxtConfig({
  extends: ['../shared'],

  runtimeConfig: {
    public: { apiBase: '/api' }
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/entrar', '/cadastro', '/sessao', '/reserva', '/minhas-reservas']
    },
    devProxy: {
      '/api': { target: `${process.env.API_PROXY_TARGET ?? 'http://localhost:3000'}/api`, changeOrigin: true }
    }
  },

  devtools: { enabled: true }
})
