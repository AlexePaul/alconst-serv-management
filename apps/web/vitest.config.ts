import { defineConfig } from 'vitest/config'

// Teste unitare pentru utilitarele pure (fără dependențe de Nuxt).
export default defineConfig({
  test: {
    include: ['app/**/*.spec.ts', 'test/**/*.spec.ts']
  }
})
