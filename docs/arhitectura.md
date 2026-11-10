# Arhitectură și decizii tehnice

Documentul explică structura aplicației și motivele din spatele alegerilor făcute în Etapa 1.

## Imagine de ansamblu

```
                    ┌──────────────────────────────────────────────┐
  Browser / PWA ──▶ │ Caddy (HTTPS, app.alconst-serv.ro)           │
                    │   /        → fișiere statice (SPA Nuxt)      │
                    │   /api/*   → API NestJS                      │
                    └───────────────┬──────────────────────────────┘
                                    │
                             ┌──────▼──────┐   job-uri    ┌───────────┐
                             │ API NestJS  │ ───────────▶ │  Worker   │
                             └──┬───────┬──┘   (BullMQ)   └─────┬─────┘
                                │       │                       │
                         ┌──────▼──┐ ┌──▼────┐            SMTP / (ulterior)
                         │Postgres │ │ Redis │            S3, LibreOffice
                         └─────────┘ └───────┘
```

Este un **modular monolith**: un singur API, un singur worker, o singură bază de date. Nu există
microservicii. Separarea este logică (module NestJS, pachete în monorepo), nu de infrastructură.

## Monorepo

| Pachet              | Rol                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web`          | Interfața (Nuxt SPA). Nu accesează baza de date; vorbește doar cu `/api`.                  |
| `apps/api`          | REST API. Singurul loc în care se validează și se autorizează operațiunile.                |
| `apps/worker`       | Procesează job-uri din Redis, în afara cererilor HTTP.                                     |
| `packages/database` | Schema Prisma, migrările și fabrica de client – folosită de API (și, ulterior, de worker). |
| `packages/shared`   | Contracte comune: DTO-uri, roluri, coduri de eroare, numele cozilor și payload-urile lor.  |

`packages/config` din propunerea inițială a fost omis: un singur `tsconfig.base.json` în rădăcină
este suficient deocamdată.

Gestionarul de pachete este **pnpm** (workspaces). Nu folosim Turborepo/Nx – la dimensiunea actuală
ar adăuga doar complexitate.

## Decizii

### Frontend: SPA, nu SSR

Aplicația este internă și complet în spatele autentificării, deci SEO și randarea pe server nu aduc
nimic. `ssr: false` + `nuxt generate` produce fișiere statice, servite direct de Caddy:

- nu există un proces Node pentru frontend în producție (mai puține lucruri care pot cădea);
- cookie-ul de sesiune nu trebuie retransmis între un server Nuxt și API;
- PWA-ul se configurează simplu.

### O singură origine pentru web și API

Browserul accesează API-ul prin `/api` pe aceeași origine (în dezvoltare prin proxy-ul Nuxt, în
producție prin Caddy). Consecințe: nu avem nevoie de CORS, cookie-ul poate fi `SameSite=Strict`,
iar protecția CSRF se reduce la verificarea antetului `Origin`.

### Sesiuni în baza de date, nu JWT

Cookie-ul conține un token aleatoriu opac; baza de date păstrează doar hash-ul lui. Față de JWT:

- sesiunile se pot **revoca imediat** (logout, dezactivare cont, schimbare parolă);
- nu există secrete de semnare de gestionat și rotit;
- costul (o interogare pe cerere) este neglijabil pentru 3–5 utilizatori.

### Roluri: enum, nu tabel

Cerința actuală are două roluri fixe (Administrator, Angajat). Un enum `UserRole` este suficient și
se verifică printr-un decorator `@Roles(...)`. Dacă vor fi necesare permisiuni granulare, se poate
introduce un tabel `Role`/`Permission` fără a schimba modul în care rutele își declară cerințele.

### Prisma 7 (nu Prisma 8)

Pe npm, CLI-ul `prisma` are deja eticheta `latest` pe 8.0.0-rc, dar `@prisma/client` stabil este
7.x, iar Prisma 8 schimbă fundamental modelul de lucru (contract-first). Am fixat **7.10.1** –
versiunea stabilă, cu `schema.prisma` și migrări SQL clasice. Migrarea la 8 se poate evalua după
lansarea versiunii finale.

Clientul Prisma este generat în `packages/database/src/generated` (ignorat de Git) și compilat
împreună cu pachetul.

### NestJS 12 – ESM

NestJS 12 este exclusiv ESM, deci tot backend-ul folosește module ES (`"type": "module"`, importuri
relative cu extensia `.js`). Testele rulează pe Vitest, lint-ul pe oxlint – setările implicite ale
NestJS 12.

### Worker ca aplicație NestJS fără HTTP

Worker-ul folosește `NestFactory.createApplicationContext` și procesoare `@nestjs/bullmq`. Astfel
are aceeași structură (module, injecție de dependențe, configurare validată) ca API-ul, iar logica
viitoare – generarea documentelor, conversia PDF, notificările – se adaugă ca procesoare noi.

Contractul dintre API și worker (numele cozii și forma payload-ului) este definit o singură dată în
`packages/shared/src/queues.ts`.

### Erori API uniforme, în română

Toate erorile au forma `{ statusCode, code, message, fieldErrors? }`. `code` este stabil și folosit
de frontend pentru logică; `message` este în română și poate fi afișat direct utilizatorului.
Erorile de validare sunt returnate pe câmpuri și apar sub câmpul corespunzător din formular.

### Fără resurse externe în frontend

Fontul (Inter) și iconițele (Lucide) sunt incluse în build. Aplicația nu face nicio cerere către
servicii terțe (Google Fonts, API-ul Iconify etc.) – verificat automat în browser. Asta contează
pentru confidențialitate și permite o politică CSP strictă (`connect-src 'self'`).

## Modelul de date

| Tabel                   | Rol                                                                      |
| ----------------------- | ------------------------------------------------------------------------ |
| `users`                 | Utilizatori interni, rol, stare, hash-ul parolei                         |
| `sessions`              | Sesiuni active (hash token, expirare, IP, user agent)                    |
| `password_reset_tokens` | Token-uri de resetare, de unică folosință                                |
| `activity_logs`         | Jurnal de activitate (cine, ce, asupra cui, când)                        |
| `clients`               | Companiile cliente                                                       |
| `client_assignments`    | Responsabilii unui client (client ↔ utilizator intern)                   |
| `services`              | Catalogul serviciilor oferite de firmă                                   |
| `client_services`       | Serviciile prestate unui client                                          |
| `locations`             | Punctele de lucru ale clienților                                         |
| `employees`             | Angajații clienților (date personale)                                    |
| `contracts`             | Contracte: perioadă, status                                              |
| `contract_fees`         | Tarifele unui contract: sumă + frecvență, opțional legate de un serviciu |

Entitățile pentru task-uri și documente se adaugă în etapele respective, nu în avans.
Cheile primare sunt UUID v7 (ordonabile cronologic).

### Accesul la clienți

Regula este implementată într-un singur loc (`ClientAccessService`) și se aplică tuturor datelor
legate de un client – puncte de lucru, angajați, contracte:

- administratorii văd și modifică toți clienții și stabilesc responsabilii;
- un angajat vede și modifică doar clienții la care este responsabil; când adaugă un client,
  devine automat responsabilul lui;
- pentru clienții inaccesibili API-ul răspunde „nu există” (404), astfel încât un angajat să nu
  poată afla ce alți clienți are firma;
- ștergerea definitivă a unui client este rezervată administratorilor.

### Contracte și tarife

Clienții plătesc foarte diferit: lunar, săptămânal, la 3 luni, la deplasare sau combinat. De aceea
un contract nu are un singur „preț”, ci o listă de **tarife**, fiecare cu:

- o sumă (lei);
- o frecvență = unitate (`WEEK`, `MONTH`, `YEAR`, `VISIT`, `ONCE`) + interval
  (ex. `MONTH` + 3 = la 3 luni);
- opțional un serviciu din catalog și/sau o descriere liberă.

Exemplu: „400 lei lunar pentru SSM + 300 lei la 3 luni pentru verificare + 150 lei la fiecare
deplasare suplimentară” înseamnă trei tarife pe același contract.

Din tarifele recurente se calculează un **venit lunar estimat** (pe contract, pe client și total).
Tarifele „la deplasare” și cele unice nu intră în estimare, pentru că depind de câte deplasări au
loc. Aplicația ține evidența a ceea ce s-a convenit, **nu** a încasărilor efective – facturarea și
urmărirea plăților sunt în afara etapelor curente.

Frecvența deplasărilor (când mergem la client) nu ține de contract, ci de obligații și task-uri –
Etapa 3.

### Căutare

Clienții și angajații au o coloană `searchText` – textul relevant, fără diacritice și cu litere
mici – actualizată la fiecare salvare. Căutarea normalizează la fel termenul introdus, deci
„stefan” găsește „Ștefan”. Soluția nu depinde de extensii PostgreSQL și poate primi ulterior un
index trigram dacă volumul o cere.

## Convenții

- **Limbă**: interfața și mesajele către utilizator sunt în română; identificatorii din cod sunt în
  engleză; comentariile explică „de ce”, în română.
- **Validare**: pe frontend (zod, pentru feedback imediat) și pe backend (class-validator, sursa
  de adevăr). Regulile comune – de exemplu lungimea parolei – sunt în `packages/shared`.
- **Autorizare**: toate rutele cer autentificare implicit; excepțiile se marchează explicit cu
  `@Public()`. Verificările din frontend sunt doar pentru UX.
- **Audit**: orice operațiune care modifică date importante scrie în `activity_logs`.
