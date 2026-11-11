# Deployment în producție

> **Nimic din acest document nu a fost executat.** Aplicația nu este instalată în producție și
> DNS-ul nu a fost modificat. Pașii de mai jos descriu cum se face instalarea, după aprobare.

Ținta este o instanță AWS EC2 cu Docker, la `https://app.alconst-serv.ro`. Website-ul public
`alconst-serv.ro` nu este atins: aplicația are propriul subdomeniu, propriul server/containere și
propriul pipeline.

## Componente

`docker-compose.prod.yml` pornește:

| Serviciu   | Rol                                                                      | Expus public |
| ---------- | ------------------------------------------------------------------------ | ------------ |
| `web`      | Caddy: HTTPS automat (Let's Encrypt), fișierele statice, proxy către API | 80, 443      |
| `api`      | NestJS                                                                   | nu           |
| `worker`   | Emailuri și rularea periodică                                            | nu           |
| `migrate`  | Aplică migrările bazei de date la fiecare lansare, apoi se oprește       | nu           |
| `postgres` | Baza de date (volum persistent)                                          | nu           |
| (S3)       | Fișierele încărcate – bucket privat, în afara serverului                 | nu           |
| `redis`    | Cozile BullMQ (cu parolă și persistență)                                 | nu           |

## Cerințe

- Instanță EC2 Linux (Ubuntu LTS sau Amazon Linux) cu Docker Engine și pluginul Compose.
  2 vCPU / 4 GB RAM sunt suficiente pentru început (de exemplu `t3.medium`); generarea documentelor
  și LibreOffice, din Etapa 4, vor folosi mai mult. Imaginile au fost construite și testate doar
  pe x86-64; instanțele ARM (`t4g`) nu au fost încercate.
- **Elastic IP** asociat instanței, ca adresa să nu se schimbe la repornire.
- **Security Group**: 80 și 443 deschise public; 22 (SSH) doar de la adresele administratorilor
  sau, preferabil, acces prin Session Manager. PostgreSQL și Redis nu se expun.
- Înregistrare DNS de tip `A`: `app.alconst-serv.ro` → Elastic IP. Website-ul public rămâne
  neschimbat; se adaugă doar această înregistrare nouă.
- Trimiterea emailurilor prin **Resend** (vezi mai jos).
- Volumul EBS criptat; snapshot-urile EBS se pot folosi ca plasă de siguranță, pe lângă backup-ul
  bazei de date.

### Email prin Resend

Căsuțele de email ale firmei sunt pe Zoho, iar trimiterea automată se face prin Resend – la fel
ca pe website. Aplicația trimite prin SMTP, deci nu este nevoie de cod specific Resend:

| Variabilă       | Valoare                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| `SMTP_HOST`     | `smtp.resend.com`                                                                          |
| `SMTP_PORT`     | `465`                                                                                      |
| `SMTP_USER`     | `resend`                                                                                   |
| `SMTP_PASSWORD` | o cheie API Resend, creată special pentru aplicație                                        |
| `MAIL_FROM`     | o adresă de pe domeniul verificat în Resend, ex. `Alconst Serv <no-reply@alconst-serv.ro>` |

Valorile sunt cele din documentația Resend pentru SMTP; verifică-le în contul Resend la
configurare. Recomand o cheie API separată de cea a website-ului, cu drept doar de trimitere, ca
să poată fi revocată independent. AWS limitează implicit portul 25 la ieșire; porturile 465 și 587
nu sunt afectate.

### Documente în Amazon S3

Fișierele încărcate în aplicație se păstrează într-un bucket S3 privat:

1. Creează un bucket (de exemplu `alconst-serv-documente`) în regiunea instanței, cu **Block all
   public access** activ, **versionare** activă și criptare implicită (SSE-S3).
2. Creează un rol IAM pentru instanța EC2, cu o politică limitată la acest bucket:
   `s3:PutObject` și `s3:GetObject` pe `arn:aws:s3:::<bucket>/*`. Aplicația nu șterge obiecte,
   deci nu are nevoie de `s3:DeleteObject`.
3. Atașează rolul instanței. Containerele îl folosesc prin serviciul de metadate al instanței;
   limita de salturi IMDSv2 trebuie să fie cel puțin 2 (`HttpPutResponseHopLimit=2`), altfel
   containerele Docker nu ajung la el.
4. În `.env.production`: `FILES_STORAGE=s3`, `S3_BUCKET=<bucket>`, `S3_REGION=<regiune>`. Nu se pun
   chei de acces pe server.

Alternativă fără S3: `FILES_STORAGE=local` păstrează fișierele în volumul Docker `files-data` de pe
server. Este mai simplu, dar fișierele trebuie incluse atunci în backup-ul serverului.

## Instalare

```bash
git clone <repository> alconst-serv-management
```

```bash
cd alconst-serv-management
```

```bash
cp .env.example .env.production
```

În `.env.production` se completează secțiunea „Producție”:

| Variabilă                                              | Descriere                                   |
| ------------------------------------------------------ | ------------------------------------------- |
| `APP_DOMAIN`                                           | `app.alconst-serv.ro`                       |
| `ACME_EMAIL`                                           | Adresă de contact pentru certificatul TLS   |
| `POSTGRES_PASSWORD`                                    | Parolă generată (`openssl rand -base64 32`) |
| `REDIS_PASSWORD`                                       | Parolă generată (`openssl rand -base64 32`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Datele Resend (vezi „Email prin Resend”)    |
| `MAIL_FROM`                                            | Expeditorul emailurilor                     |
| `FILES_STORAGE`, `S3_BUCKET`, `S3_REGION`              | Stocarea documentelor (vezi „Documente”)    |

Fișierul trebuie să fie lizibil doar de utilizatorul care rulează Docker (`chmod 600`).

Pornire:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Primul administrator:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
  node dist/cli/create-admin.js --email admin@alconst-serv.ro --first-name Prenume --last-name Nume
```

Parola se cere interactiv și nu rămâne în istoricul comenzilor.

## Actualizare

```bash
git pull
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrările se aplică automat înainte de repornirea API-ului. Dacă o migrare eșuează, API-ul vechi
rămâne oprit până la rezolvare – de aceea, înainte de fiecare actualizare se face un backup.

## Verificare după instalare

- `https://app.alconst-serv.ro/api/health` răspunde `{"status":"ok"}`.
- Autentificarea funcționează; în cookie apare `__Host-alconst_session` cu `Secure` și `HttpOnly`.
- „Ai uitat parola?” trimite efectiv emailul (verifică și logul: `docker compose ... logs worker`).
- Pe iPhone: Safari → Partajare → „Adaugă pe ecranul principal”.

## Backup

Nu este încă automatizat (planificat în Etapa 5). Până atunci, manual:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backup-$(date +%F).dump
```

Backup-urile trebuie păstrate **în afara serverului** și restaurarea trebuie testată periodic.
Documentele stau în Amazon S3 (bucket privat, cu versionare), deci nu depind de server. Dacă se
folosește stocarea locală, volumul `files-data` trebuie copiat împreună cu baza de date.

## CI/CD

`.github/workflows/ci.yml` rulează la fiecare push și pull request: formatare, lint, typecheck,
teste unitare, teste e2e (cu PostgreSQL și Redis) și build. Deployment-ul automat nu este
configurat; se adaugă după alegerea serverului, ca pipeline separat de cel al website-ului public.

## Ce a fost verificat până acum

- Imaginile Docker (`api`, `worker`, `migrate`, `web`) se construiesc cu succes.
- Ambele fișiere Compose sunt valide (`docker compose config`).
- Build-ul static al frontend-ului a fost rulat în browser cu service worker-ul activ.

**Nu a fost verificat:** pornirea întregului `docker-compose.prod.yml` pe o instanță EC2 reală,
obținerea certificatului TLS, trimiterea de emailuri prin Resend și stocarea documentelor într-un
bucket S3 real (driverul S3 este testat doar împotriva unui server care îi imită operațiunile).
