# Alconst Serv – Management SSM/PSI

Aplicația internă a firmei Alconst Serv pentru gestionarea activității de securitate și sănătate în
muncă (SSM) și prevenire și stingere a incendiilor (PSI): clienți, angajați, obligații, task-uri,
calendar și documente.

Aplicația este **strict internă** (fără înregistrare publică, fără portal pentru clienți) și va rula
la `https://app.alconst-serv.ro`, complet separat de website-ul public `alconst-serv.ro`.

> **Stadiu:** Etapa 1 (Foundation) este implementată – monorepo, autentificare, administrare
> utilizatori, jurnal de activitate, layout responsive, PWA, worker pentru job-uri în fundal,
> configurare Docker. Vezi [docs/roadmap.md](docs/roadmap.md) pentru ce urmează.

## Tehnologii

| Zonă           | Alegere                                                               |
| -------------- | --------------------------------------------------------------------- |
| Frontend       | Nuxt 4 (SPA), Vue 3, TypeScript, Tailwind CSS 4, Nuxt UI 4, PWA       |
| Backend        | NestJS 12 (REST), TypeScript, class-validator                         |
| Bază de date   | PostgreSQL 16, Prisma ORM 7                                           |
| Job-uri fundal | Redis 7, BullMQ 6                                                     |
| Email          | Nodemailer (SMTP), trimis de worker                                   |
| Deployment     | Docker Compose, Caddy (HTTPS automat)                                 |
| Calitate       | Vitest, oxlint (backend), ESLint (frontend), Prettier, GitHub Actions |

Deciziile tehnice sunt explicate în [docs/arhitectura.md](docs/arhitectura.md).

## Structura repository-ului

```
alconst-serv-management/
├── apps/
│   ├── web/        # Frontend Nuxt (SPA + PWA)
│   ├── api/        # REST API NestJS
│   └── worker/     # Procesator de job-uri BullMQ (emailuri; ulterior documente, notificări)
├── packages/
│   ├── database/   # Schema Prisma, migrări, clientul de bază de date
│   └── shared/     # Tipuri, constante și contracte comune (DTO-uri, cozi)
├── docker/         # Dockerfile-uri și configurația Caddy
├── docs/           # Documentație
├── docker-compose.yml        # Servicii pentru dezvoltare (Postgres, Redis, Mailpit)
└── docker-compose.prod.yml   # Producție
```

## Pornire rapidă (dezvoltare)

Cerințe: **Node.js ≥ 22.18**, **pnpm 10** (`corepack enable`), **Docker**.

```bash
# 1. Dependențe
pnpm install

# 2. Configurare – valorile implicite funcționează direct în dezvoltare
cp .env.example .env

# 3. Servicii: PostgreSQL, Redis, Mailpit (emailuri de test: http://localhost:8025)
docker compose up -d

# 4. Schema bazei de date
pnpm db:deploy

# 5. Primul cont de administrator (parola se cere interactiv)
pnpm admin:create --email admin@alconst-serv.ro --first-name Prenume --last-name Nume

# 6. Pornește web + API + worker
pnpm dev
```

Aplicația este disponibilă la <http://localhost:3000>. API-ul rulează pe portul 3001, dar browserul
îl accesează prin `/api` pe aceeași origine (proxy), exact ca în producție.

## Comenzi

| Comandă             | Ce face                                                     |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | Pornește web, API și worker în mod dezvoltare               |
| `pnpm build`        | Build de producție pentru toate pachetele și aplicațiile    |
| `pnpm lint`         | Lint (oxlint pentru backend, ESLint pentru frontend)        |
| `pnpm typecheck`    | Verificare de tipuri TypeScript                             |
| `pnpm test`         | Teste unitare                                               |
| `pnpm test:e2e`     | Teste e2e ale API-ului (necesită Postgres și Redis pornite) |
| `pnpm format`       | Formatare cu Prettier                                       |
| `pnpm db:migrate`   | Creează și aplică o migrare nouă (dezvoltare)               |
| `pnpm db:deploy`    | Aplică migrările existente                                  |
| `pnpm db:studio`    | Deschide Prisma Studio                                      |
| `pnpm admin:create` | Creează un cont de administrator din linia de comandă       |

Testele e2e folosesc o bază de date separată (`alconst_test`), creată automat de
`docker compose up` și golită înaintea fiecărui test.

## Ce este implementat (Etapa 1)

- **Autentificare**: login cu email și parolă, logout, schimbare parolă, resetare prin email,
  parole temporare cu schimbare obligatorie la prima autentificare.
- **Utilizatori** (doar administratori): listă cu căutare și filtrare, creare, modificare,
  activare/dezactivare, resetare parolă. Roluri: Administrator și Angajat.
- **Securitate**: sesiuni revocabile în baza de date, cookie `httpOnly` + `SameSite=Strict`,
  protecție CSRF, limitare a încercărilor de autentificare, parole Argon2id, autorizare pe fiecare
  rută. Detalii în [docs/securitate.md](docs/securitate.md).
- **Jurnal de activitate** (audit log) pentru autentificări și operațiuni asupra conturilor.
- **Interfață**: layout cu sidebar pe desktop și meniu adaptat pe mobil, temă luminoasă/întunecată,
  interfață în limba română, stări de încărcare / eroare / listă goală.
- **PWA**: instalabilă pe iPhone (Add to Home Screen), fără mod offline.
- **Worker**: coadă BullMQ pentru emailuri – baza pentru generarea documentelor și notificări.

## Documentație

- [Arhitectură și decizii tehnice](docs/arhitectura.md)
- [Securitate](docs/securitate.md)
- [Evaluarea editorului DOCX](docs/evaluare-editor-docx.md)
- [Deployment în producție](docs/deploy.md)
- [Roadmap și întrebări deschise](docs/roadmap.md)
