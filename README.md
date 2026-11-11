# Alconst Serv – Management SSM/PSI

Aplicația internă a firmei Alconst Serv pentru gestionarea activității de securitate și sănătate în
muncă (SSM) și prevenire și stingere a incendiilor (PSI): clienți, obligații, task-uri,
calendar și documente.

Aplicația este **strict internă** (fără înregistrare publică, fără portal pentru clienți) și va rula
la `https://app.alconst-serv.ro`, complet separat de website-ul public `alconst-serv.ro`.

> **Stadiu:** Etapele 1 (Foundation), 2 (Clienți) și 3 (Task-uri, obligații și
> calendar) sunt implementate. Urmează documentele. Vezi [docs/roadmap.md](docs/roadmap.md).

## Tehnologii

| Zonă           | Alegere                                                               |
| -------------- | --------------------------------------------------------------------- |
| Frontend       | Nuxt 4 (SPA), Vue 3, TypeScript, Tailwind CSS 4, Nuxt UI 4, PWA       |
| Backend        | NestJS 12 (REST), TypeScript, class-validator                         |
| Bază de date   | PostgreSQL 16, Prisma ORM 7                                           |
| Job-uri fundal | Redis 7, BullMQ 6                                                     |
| Email          | Nodemailer (SMTP), trimis de worker                                   |
| Fișiere        | Amazon S3 (sau disc local), acces doar prin API                       |
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

## Ce este implementat

**Etapa 1 – Foundation**

- **Autentificare**: login cu email și parolă, logout, schimbare parolă, resetare prin email,
  parole temporare cu schimbare obligatorie la prima autentificare.
- **Utilizatori** (doar administratori): listă cu căutare și filtrare, creare, modificare,
  activare/dezactivare, resetare parolă. Roluri: Administrator și Angajat.
- **Securitate**: sesiuni revocabile în baza de date, cookie `httpOnly` + `SameSite=Strict`,
  protecție CSRF, limitare a încercărilor de autentificare, parole Argon2id, autorizare pe fiecare
  rută. Detalii în [docs/securitate.md](docs/securitate.md).
- **Jurnal de activitate** (audit log) pentru autentificări și toate modificările de date.
- **Interfață**: layout cu sidebar pe desktop și meniu adaptat pe mobil, temă luminoasă/întunecată,
  interfață în limba română, logo-ul și culorile firmei.
- **PWA**: instalabilă pe iPhone (Add to Home Screen), fără mod offline.
- **Worker**: coadă BullMQ pentru emailuri – baza pentru generarea documentelor și notificări.

**Etapa 2 – Clienți**

- **Clienți**: date de identificare și contact, status, căutare fără diacritice, filtrare,
  paginare pe server.
- **Responsabili**: un angajat vede și modifică doar clienții la care este responsabil și devine
  automat responsabil pentru clienții pe care îi adaugă; administratorii văd tot și stabilesc
  responsabilii.
- **Servicii**: catalog configurabil de administratori, asociat fiecărui client.
- **Puncte de lucru** ale clienților.
- **Numărul de angajați** al fiecărui client – doar numărul, reconfirmat la fiecare deplasare.
  Aplicația nu ține evidența persoanelor și nu stochează date personale despre angajații clienților.
- **Contracte și tarife**: perioadă, status și oricâte tarife pe contract, fiecare cu propria
  frecvență (săptămânal, lunar, la N luni, anual, la fiecare deplasare, o singură dată); venit
  lunar estimat; avertizare pentru contractele care expiră.
- **Pagina principală**: clienți activi, total angajați la clienți, venit lunar estimat, contracte
  care expiră.
- **Arhivare în loc de ștergere**: clienții, punctele de lucru și contractele nu se
  șterg; se arhivează (contractele se încheie), rămân în evidență cu tot istoricul și pot fi
  reactivate.

**Etapa 3 – Task-uri, obligații și calendar**

- **Obligații recurente**: activități care se repetă (deplasări, instruiri), cu frecvență
  configurabilă, client, punct de lucru și responsabil.
- **Lunile alese pe client**: pentru o deplasare la 3 luni se aleg lunile potrivite clientului
  (ian.–apr.–iul.–oct., feb.–mai–aug.–nov. sau mar.–iun.–sept.–dec.).
- **Termene flexibile**: o deplasare lunară poate fi făcută oricând în luna respectivă (una
  săptămânală, oricând în săptămână). Data este doar ziua planificată și se poate muta; restanța
  apare abia după încheierea perioadei.
- **Task-uri** generate automat din obligații sau create manual: tip, responsabil, prioritate,
  termen, status, observații și istoric de modificări.
- **Listă** grupată după urgență (restante, încă în termen, azi, următoarele 7 zile, mai târziu)
  și **calendar**
  pe lună, săptămână și zi.
- **Notificări** în aplicație și rezumat zilnic pe email, fără duplicate, cu preferințe per
  utilizator.
- **Deplasări**: interval orar estimat, evidența completării fișelor și preluarea unei deplasări
  de către un coleg.
- **Apariții sărite**: la bifarea unei deplasări, aplicația întreabă dacă și cea rămasă nebifată
  din perioada anterioară este făcută și le finalizează împreună.
- **Predarea definitivă a unui client**: direct de către un administrator sau prin cerere între
  colegi, cu acordul amândurora.
- **Emailuri imediate** pentru task-urile atribuite și cererile de predare.
- **Pagina principală**: restanțe, termenele de azi și din următoarele 7 zile.
- **Mobil**: bară de navigare rapidă către task-uri, calendar, clienți și notificări.

**Etapa 4 – Documente (prima parte)**

- **Secțiuni**: câte una pentru fiecare client, plus una generală a firmei.
- **Dosare** pe oricâte niveluri și **fișiere** încărcate cu butonul sau prin tragere: PDF, Word,
  Excel, imagini și alte tipuri uzuale, până la 25 MB.
- **Descărcare, redenumire, mutare, căutare** după nume. Fișierele nu se șterg: se arhivează și
  pot fi restaurate.
- **Acces**: documentele unui client le văd doar responsabilii lui și administratorii; fișierele nu
  au adrese publice.

Urmează: template-uri DOCX, generarea documentelor și editorul.

## Documentație

- [Arhitectură și decizii tehnice](docs/arhitectura.md)
- [Securitate](docs/securitate.md)
- [Evaluarea editorului DOCX](docs/evaluare-editor-docx.md)
- [Deployment în producție](docs/deploy.md)
- [Roadmap și întrebări deschise](docs/roadmap.md)
