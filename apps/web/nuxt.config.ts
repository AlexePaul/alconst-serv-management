// https://nuxt.com/docs/api/configuration/nuxt-config
const apiTarget = process.env.NUXT_API_PROXY_TARGET ?? 'http://localhost:3001'

/**
 * Adresa API-ului, așa cum o vede browserul.
 *  - implicit `/api`, pe aceeași origine cu interfața (dezvoltare; instalarea cu un reverse proxy
 *    care servește și interfața, și API-ul);
 *  - o adresă completă (ex. `https://api.exemplu.ro/api`) atunci când interfața este găzduită
 *    separat de API, de exemplu pe Vercel. Se stabilește la build, prin `NUXT_PUBLIC_API_BASE`.
 */
const apiBase = (process.env.NUXT_PUBLIC_API_BASE || '/api').replace(/\/+$/, '')
const apiOrigin = /^https?:\/\//.test(apiBase) ? new URL(apiBase).origin : null

/**
 * Antetele de securitate ale interfeței, pentru platformele care le preiau din build (Vercel).
 * La instalarea cu Caddy, aceleași antete sunt puse de Caddy (docker/Caddyfile).
 * Interfața încarcă resurse doar de pe propria origine și vorbește doar cu API-ul.
 */
const securityHeaders = {
  'Content-Security-Policy': [
    'default-src \'self\'',
    'script-src \'self\' \'unsafe-inline\'',
    'style-src \'self\' \'unsafe-inline\'',
    'img-src \'self\' data: blob:',
    'font-src \'self\' data:',
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    'worker-src \'self\' blob:',
    'manifest-src \'self\'',
    'frame-ancestors \'none\'',
    'base-uri \'self\'',
    'form-action \'self\'',
    'object-src \'none\''
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow'
}
const isProductionBuild = process.env.NODE_ENV === 'production'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vite-pwa/nuxt'],

  // Aplicație internă, în spatele autentificării: nu avem nevoie de SSR/SEO.
  // Rezultatul build-ului este un SPA static, servit de reverse proxy.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'ro' },
      title: 'Alconst Serv',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Aplicația internă de management SSM/PSI – Alconst Serv' },
        // Aplicație internă: nu trebuie indexată de motoarele de căutare.
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Alconst Serv' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'format-detection', content: 'telephone=no' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  ui: {
    // Fontul este servit local (@fontsource), fără cereri către servicii externe.
    fonts: false
  },

  runtimeConfig: {
    public: { apiBase }
  },

  // Doar în build-ul de producție: în dezvoltare, o politică strictă ar bloca reîncărcarea la cald.
  routeRules: isProductionBuild
    ? {
        '/**': { headers: securityHeaders },
        // Fișierele cu hash în nume nu se schimbă niciodată.
        '/_nuxt/**': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }
      }
    : {},

  compatibilityDate: '2026-06-30',

  nitro: {
    // În dezvoltare, cererile /api sunt redirecționate către NestJS, astfel încât browserul
    // vede o singură origine – exact ca în producție (cookie-uri SameSite=Strict, fără CORS).
    devProxy: {
      '/api': { target: `${apiTarget}/api` }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    // Iconițele sunt incluse în bundle; aplicația nu apelează API-ul public Iconify.
    provider: 'none',
    fallbackToApi: false,
    clientBundle: {
      // Implicit sunt scanate doar componentele; unele iconițe sunt definite în fișiere .ts
      // (de exemplu în `utils/`), așa că le includem și pe acestea.
      scan: {
        globInclude: ['**/*.{vue,ts}']
      }
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: '/',
      name: 'Alconst Serv – Management SSM/PSI',
      short_name: 'Alconst Serv',
      description: 'Aplicația internă de management SSM/PSI – Alconst Serv',
      lang: 'ro',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#ffffff',
      theme_color: '#344881',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // Fără mod offline: service worker-ul păstrează doar „carcasa” aplicației pentru pornire
      // rapidă. Datele vin mereu din rețea, iar /api nu este niciodată servit din cache.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true
    },
    client: {
      installPrompt: false
    },
    devOptions: {
      enabled: false
    }
  }
})
