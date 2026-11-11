/**
 * Completează configurația generată pentru Vercel cu regula unei aplicații cu o singură pagină:
 * orice adresă care nu corespunde unui fișier (ex. /clienti/<id>, deschisă direct sau reîncărcată)
 * primește „carcasa” aplicației, iar rutarea o face aplicația în browser.
 *
 * Nitro generează `.vercel/output/config.json` doar la build-ul pe Vercel (sau cu
 * NITRO_PRESET=vercel-static); în celelalte cazuri scriptul nu are nimic de făcut.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../.vercel/output/config.json', import.meta.url)
if (!existsSync(file)) process.exit(0)

const config = JSON.parse(readFileSync(file, 'utf8'))
const fallback = { src: '/(.*)', dest: '/200.html' }
const routes = config.routes ?? []
const filesystem = routes.findIndex(route => route.handle === 'filesystem')
if (filesystem === -1) {
  console.error('Configurația Vercel nu are pasul „filesystem”; regula de rezervă nu a fost adăugată.')
  process.exit(1)
}
// Regula trebuie să fie după „filesystem”: fișierele existente au întotdeauna prioritate.
const already = routes.slice(filesystem + 1).some(route => route.dest === fallback.dest)
if (!already) {
  routes.splice(filesystem + 1, 0, fallback)
  writeFileSync(file, `${JSON.stringify({ ...config, routes }, null, 2)}\n`)
}
console.log('Vercel: adresele necunoscute primesc /200.html (aplicație cu o singură pagină).')
