# Evaluarea editorului DOCX

Obiectiv: vizualizarea și editarea documentelor Word direct în aplicație, fără servicii comerciale
(ONLYOFFICE etc.) și fără a trimite documentele către terți.

Evaluarea a fost făcută pe 10 noiembrie 2026, pe versiunile publicate atunci. Editorul **nu este
încă integrat în aplicație** – integrarea ține de Etapa 4. Aici sunt concluziile și rezultatele
unui test practic, făcut într-un proiect Nuxt separat.

## Concluzie

**Recomandare: `@docx-editor.dev/vue` + `@docx-editor.dev/core`** (Apache-2.0).

Este un editor real (nu doar viewer), are adaptor oficial pentru Vue 3, rulează complet în browser
și, în testul practic, a deschis, editat și salvat corect un DOCX generat cu docxtemplater.
`@extend-ai/react-docx` rămâne alternativa de rezervă, dar ar aduce React în proiect.

## Comparație

| Criteriu                | `@docx-editor.dev/vue`                                          | `@extend-ai/react-docx`                                         |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Versiune evaluată       | 2.36.0                                                          | 0.14.9                                                          |
| Repository              | [eigenpal/docx-editor](https://github.com/eigenpal/docx-editor) | [extend-hq/react-docx](https://github.com/extend-hq/react-docx) |
| Licență                 | Apache-2.0 (adaptorul Vue, `core`, `i18n`, `fonts`)             | MIT                                                             |
| Utilizare comercială    | Permisă                                                         | Permisă                                                         |
| Vue / Nuxt              | Adaptor oficial Vue 3; în Nuxt se montează în `<ClientOnly>`    | Doar React; există un build „vanilla” care include Preact       |
| Editare                 | Da – editor WYSIWYG complet                                     | Da, dar documentația îl descrie drept experimental              |
| Rulează doar în browser | Da                                                              | Da (parser Rust/WASM, necesită Web Worker)                      |
| Maturitate              | Versiunea 2.x, lansări foarte frecvente                         | Versiunea 0.x                                                   |

### Ce este gratuit și ce nu la `docx-editor`

Repository-ul are două regimuri de licență – de verificat din nou la fiecare actualizare majoră:

- **Apache-2.0 (gratuit, inclusiv comercial):** `core`, `vue`, `react`, `i18n`, `fonts`,
  `docx-to-markdown`. Acoperă deschiderea, editarea, formatarea, paginarea și salvarea DOCX.
- **EigenPal Pro License (necesită contract comercial în producție):** `pro` (modificări urmărite,
  comentarii, colaborare în timp real), `editor-api` (automatizare tip Office.js), `docx-to-pdf`,
  `telemetry`.

Pentru cerințele noastre este suficientă partea Apache-2.0. **Nu instalăm pachetele Pro.**
Consecință directă: conversia DOCX → PDF nu se face cu `docx-to-pdf`, ci cu **LibreOffice headless
în worker** (gratuit; verificat în testul de mai jos).

## Testul practic

Flux testat, identic cu cel dorit în aplicație:

1. Template DOCX cu antet, subsol, imagine, titluri, paragrafe formatate, tabel cu rând repetabil,
   liste, salt de pagină și text cu diacritice românești.
2. Completare cu **docxtemplater + pizzip** (variabile `{{client.name}}`, buclă `{{#participants}}`).
3. Deschidere în `@docx-editor.dev/vue` într-o aplicație **Nuxt 4** (`ssr: false`).
4. Editare în browser: text nou tastat (inclusiv „ș”, „ț”) și formatare bold.
5. Salvare cu `editor.save()` și verificarea fișierului rezultat.

| Verificare                            | Rezultat                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Compatibilitate Nuxt 4 / Vue 3        | ✅ Funcționează într-o componentă `.client.vue`, fără erori în consolă |
| Paginare, rigle, indicator de pagină  | ✅                                                                     |
| Antet și subsol                       | ✅ Afișate și păstrate la salvare                                      |
| Tabel (13 rânduri, stil „Table Grid”) | ✅ Afișat și păstrat                                                   |
| Imagine inline                        | ✅ Afișată și păstrată                                                 |
| Diacritice românești                  | ✅ La afișare, tastare și salvare                                      |
| Editare text + formatare              | ✅ Modificările se regăsesc în fișierul salvat                         |
| Structura după salvare                | ✅ Aceleași stiluri, liste, salt de pagină, număr de paragrafe         |
| Fișierul salvat este un DOCX valid    | ✅ Deschis cu python-docx și cu LibreOffice                            |
| Conversie PDF cu LibreOffice headless | ✅ Original și editat: câte 2 pagini                                   |
| Cereri către servicii externe         | ✅ Niciuna                                                             |
| Vizualizare pe iPhone (emulare)       | ✅ Lizibilă; interfața implicită ocupă însă mult spațiu vertical       |

### Observații de luat în seamă la integrare (Etapa 4)

1. **Interfața editorului este în engleză.** Biblioteca are 14 limbi, dar nu și româna.
   Traducerile se pot furniza prin proprietatea `i18n`; va trebui scris un fișier de traduceri.
2. **Evenimentul `change` se declanșează o dată și la încărcare.** Indicatorul „modificări
   nesalvate” trebuie să ignore acest prim eveniment.
3. **Pe mobil** e de preferat modul vizualizare cu interfața implicită dezactivată
   (`chrome`, `rulers`) și o bară minimală proprie.
4. **Fonturi.** Documentele Word folosesc fonturi (Cambria, Calibri, Times New Roman) care nu
   există în browser; editorul folosește înlocuitori, ceea ce poate muta ușor rândurile față de
   Word. Pachetul `@docx-editor.dev/fonts` (înlocuitori cu licență deschisă, serviți local) reduce
   diferențele. Nu activăm încărcarea din Google Fonts.
5. **Dimensiune.** `core` are ~11 MB pe disc; editorul trebuie încărcat doar la deschiderea unui
   document (import dinamic), nu în bundle-ul principal.
6. **CSP.** Motorul de text folosește WebAssembly, deci politica CSP va avea probabil nevoie de
   `'wasm-unsafe-eval'` pe pagina editorului.

### Constatare despre docxtemplater

Implicit, docxtemplater tratează `{{client.name}}` ca pe o cheie literală `"client.name"`, iar o
valoare lipsă apare în document ca textul „undefined”. La integrare sunt necesare:

- un **parser pentru căi cu punct** (câteva linii, fără evaluare de expresii);
- un **`nullGetter` care produce eroare** pentru variabile lipsă – exact comportamentul dorit
  pentru validarea câmpurilor obligatorii înainte de generare.

## Limite ale evaluării

- Testul a folosit un document construit de noi, cu date fictive. **Fidelitatea trebuie verificată
  pe documentele reale ale firmei** (tematici, decizii, procese-verbale), care pot conține
  elemente mai dificile: casete de text, tabele îmbinate, numerotări pe mai multe niveluri,
  câmpuri, ștampile/semnături ca imagini ancorate.
- Nu au fost testate: documente foarte mari, editarea pe un iPhone real, tipărirea din editor.

## Plan de rezervă

Dacă fidelitatea pe documentele reale nu este suficientă:

1. **Vizualizare prin PDF** (conversie cu LibreOffice în worker, afișare cu PDF.js) + descărcarea
   DOCX-ului pentru editare în Word și reîncărcarea ca versiune nouă. Fidelitate maximă la
   vizualizare, fără editare în browser.
2. **Collabora Online (CODE)** – open-source, găzduit pe serverul propriu, fidelitate foarte bună
   (motor LibreOffice), dar înseamnă un serviciu în plus de operat și mai multe resurse.
3. `@extend-ai/react-docx` (build-ul „vanilla”), izolat într-o singură componentă.
