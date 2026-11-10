import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Vue nu semnalează la compilare un tag de componentă necunoscut: pagina se afișează pur și
 * simplu fără el. Nuxt denumește componentele după director (și elimină prefixele duplicate:
 * `tasks/TasksList.vue` devine `TasksList`, nu `TasksTasksList`), deci o greșeală de nume este
 * ușor de făcut. Testul verifică fiecare tag folosit în template-uri cu lista generată de Nuxt.
 */
describe('componente', () => {
  const root = resolve(import.meta.dirname, '..')
  const registry = resolve(root, '.nuxt/components.d.ts')

  it('toate componentele folosite în template-uri sunt înregistrate', () => {
    expect(existsSync(registry), 'rulează `nuxt prepare` înainte de teste').toBe(true)
    const registered = readFileSync(registry, 'utf8')

    const unknown: string[] = []
    for (const file of globSync('app/**/*.vue', { cwd: root })) {
      const source = readFileSync(resolve(root, file), 'utf8')
      const template = source.slice(source.indexOf('<template'))
      for (const [, tag] of template.matchAll(/<([A-Z][A-Za-z0-9]+)(?=[\s/>])/g)) {
        if (tag && !new RegExp(`\\b${tag}\\b`).test(registered)) unknown.push(`${file}: <${tag}>`)
      }
    }
    expect([...new Set(unknown)]).toEqual([])
  })
})
