import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Camada comum aos dois sites (web/customer e web/admin), usada com `extends: ['../shared']`.
// Cada site define a própria base da API (`runtimeConfig.public.apiBase`) e o devProxy.
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  css: [here('./app/assets/css/main.css')],

  alias: {
    '#api': here('./app/types/api'),
    '#seats': here('./app/types/seats')
  },

  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]
    }
  },

  // Site estático: os dados vêm da API no navegador, nunca no `nuxt generate`.
  ssr: true,

  runtimeConfig: {
    public: {
      /** Prefixo da API no mesmo domínio do site (o CloudFront encaminha `/api/*`). */
      apiBase: '/api'
    }
  },

  compatibilityDate: '2026-06-30',

  // O padrão do Nuxt Icon é /api/_nuxt_icon, mas /api é da API. Os ícones usados
  // vão no bundle do cliente, já que o site estático não tem servidor.
  icon: {
    localApiEndpoint: '/_nuxt_icon',
    clientBundle: { scan: true }
  }
})
