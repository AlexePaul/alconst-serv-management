# Instalarea: API pe instanța partajată, interfața pe Vercel

Acesta este modul în care aplicația este instalată efectiv. (Varianta cu Docker Compose pe un
server dedicat rămâne descrisă în [deploy.md](deploy.md) și este folosită pentru probe locale.)

> **Nimic de aici nu a fost executat pe infrastructura reală.** Scripturile au fost repetate local,
> pe o structură identică de directoare; lista exactă este la „Ce a fost verificat”.
>
> Identificatorii (instanța, contul AWS, numele bucket-ului, adresele) și valorile de mediu **nu
> se scriu în acest repository**. Stau în secretele și variabilele GitHub și în Parameter Store.

## Imaginea de ansamblu

```
browser ──► Vercel            interfața (fișiere statice; nu vede nicio dată a aplicației)
   │
   └──────► Caddy (instanță) ─► API, 127.0.0.1:<port>   ─┬─► PostgreSQL (aceeași mașină)
                                worker (fără port)      ─┼─► Redis (aceeași mașină)
                                                         └─► S3 (bucket propriu)
```

Instanța este **partajată cu o altă aplicație**. Tot ce urmează este construit astfel încât un
deploy al acestei aplicații să nu o poată atinge pe cealaltă.

## Valorile acestei instalări

| Ce                         | Stage                                               | Unde se schimbă               |
| -------------------------- | --------------------------------------------------- | ----------------------------- |
| Portul API-ului            | **3200** (și 3201, liber, pentru pornirea de probă) | `API_PORT` în Parameter Store |
| Interfața pe care ascultă  | `127.0.0.1`                                         | `API_HOST`                    |
| Clona repository-ului      | `/srv/alconst/stage`                                | —                             |
| Scripturile de pe instanță | `/srv/alconst/remote-deploy.sh`, `fetch-env.sh`     | copiate din `deploy/`         |
| Fișierul de mediu          | `/etc/alconst/stage.env` (640, `root:admin`)        | scris la fiecare deploy       |
| Sursa variabilelor         | Parameter Store, prefixul `/alconst/stage/`         | —                             |
| Procesele PM2              | `alconst-stage-api`, `alconst-stage-worker`         | `deploy/ecosystem.config.cjs` |
| Baza de date și rolul      | proprii (de exemplu `alconst_stage`)                | `DATABASE_URL`                |
| Conexiuni la PostgreSQL    | cel mult 5 pe proces                                | `DATABASE_POOL_MAX`           |
| Cheile din Redis           | prefixul `alconst-stage`                            | `QUEUE_PREFIX`                |
| Fișierele încărcate        | bucket S3 propriu                                   | `S3_BUCKET`, `S3_REGION`      |
| Ramura instalată           | `release/stage`                                     | —                             |

Portul 3100 este ocupat de cealaltă aplicație. Dacă alegi alt port decât 3200, actualizează
tabelul de mai sus: un port nescris nicăieri arată, la depanare, exact ca un proces căzut.

## Cum sunt evitate coliziunile de pe o instanță partajată

| Risc                                      | Ce face aplicația                                                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portul                                    | Port propriu, scris aici; API-ul ascultă doar pe `127.0.0.1`.                                                                                                                                                                                            |
| PM2 este comun utilizatorului             | Deploy-ul folosește doar `pm2 startOrReload deploy/ecosystem.config.cjs`, care atinge numai cele două procese ale aplicației. Niciodată `all`, niciodată `pm2 kill`. Fiecare proces are `max_memory_restart`, `instances: 1`, `exec_mode: fork`.         |
| PostgreSQL este comun                     | Bază și rol proprii; limită explicită de conexiuni pe fiecare proces.                                                                                                                                                                                    |
| Rolul instanței este comun pentru S3      | Bucket propriu: o greșeală de cheie în această aplicație nu poate atinge fișierele celeilalte. Aplicația are nevoie doar de `PutObject` și `GetObject`.                                                                                                  |
| Parameter Store                           | Prefix propriu; `fetch-env.sh` citește doar acel prefix și scrie doar în `/etc/alconst/`.                                                                                                                                                                |
| Rolul de deploy poate rula orice ca root  | Document SSM propriu (`deploy/ssm-document.yml`) care rulează exact `/srv/alconst/remote-deploy.sh`, cu parametri validați. Rolul de deploy primește `ssm:SendCommand` doar pe acest document.                                                           |
| Redis (dacă este folosit și de altcineva) | Toate cheile au prefixul aplicației.                                                                                                                                                                                                                     |
| Memoria și discul sunt comune, fără swap  | Pe instanță se instalează și se construiesc doar API-ul și worker-ul (build de ~450 MB; interfața, de ~1 GB, se construiește pe Vercel). Build-ul rulează cu o limită de memorie impusă, deci, dacă nu ajunge memoria, este oprit el, nu altă aplicație. |

## Cum decurge un deploy

`remote-deploy.sh <mediu> <commit>`, pornit prin documentul SSM:

1. **Blocaj**: un singur deploy pe mediu la un moment dat.
2. **Variabilele de mediu** sunt aduse din Parameter Store într-un fișier separat
   (`stage.env.next`); cel activ rămâne neatins.
3. Ca utilizator obișnuit (`admin`), nu ca root:
   - clona este adusă la commit-ul cerut – acceptat doar dacă face parte din `release/<mediu>`;
   - dependențe și build, doar pentru API și worker;
   - se verifică faptul că build-ul a produs fișierele de pornire;
   - **configurarea nouă este validată** cu versiunea nouă, cu aceeași validare ca la pornire;
   - migrările bazei de date;
   - **pornire de probă**: API-ul nou pornește pe portul alăturat și trebuie să răspundă la
     `/api/ready`.
4. Abia acum fișierul de mediu verificat îl înlocuiește pe cel activ.
5. `pm2 startOrReload` pentru cele două procese, apoi se așteaptă ca `/api/ready` să raporteze
   exact commit-ul instalat și ca worker-ul să fie pornit.

Dacă oricare pas dinaintea punctului 5 eșuează, deploy-ul se oprește, iar versiunea veche
continuă să servească, cu fișierul ei de mediu.

Workflow-ul din GitHub verifică la final, din afară, că adresa publică răspunde la `/api/ready`
cu versiunea nouă. `/api/health` spune doar că procesul răspunde; `/api/ready` verifică și baza
de date, și Redis.

## Pregătirea instanței (o singură dată)

1. **Redis.** Aplicația are nevoie de Redis pentru cozile de emailuri și rularea periodică.
   Dacă nu există pe instanță, se instalează ca serviciu local: ascultă doar pe `127.0.0.1`,
   `maxmemory-policy noeviction`, cu persistență (AOF). Fără Redis, API-ul nu pornește.
2. **PostgreSQL**: bază și rol proprii, fără drepturi pe alte baze de date.

   ```sql
   CREATE ROLE alconst_stage LOGIN PASSWORD '<parolă generată>';
   CREATE DATABASE alconst_stage OWNER alconst_stage;
   REVOKE ALL ON DATABASE alconst_stage FROM PUBLIC;
   ```

3. **Directoare și clonă**, ca utilizatorul aplicației (repository-ul se citește cu o cheie de
   deploy doar pentru citire):

   ```bash
   sudo install -d -o admin -g admin /srv/alconst
   ```

   ```bash
   git clone --branch release/stage <adresa repository-ului> /srv/alconst/stage
   ```

4. **Scripturile de pe instanță** (se recopiază doar dacă se schimbă în repository):

   ```bash
   sudo install -m 750 -o root -g root /srv/alconst/stage/deploy/remote-deploy.sh /srv/alconst/stage/deploy/fetch-env.sh /srv/alconst/
   ```

   Dacă `node`, `pnpm` sau `pm2` nu sunt în `PATH`-ul unei sesiuni fără terminal a utilizatorului,
   se adaugă în `/srv/alconst/env.sh` (citit de `deploy.sh`), de exemplu `export PATH=...`.

5. **Parameter Store**, sub `/alconst/stage/` (toate ca `SecureString`):

   | Parametru                                                           | Valoare                                                            |
   | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
   | `APP_URL`                                                           | adresa interfeței de pe Vercel, exact (ex. `https://…`)            |
   | `API_HOST`, `API_PORT`                                              | `127.0.0.1`, `3200`                                                |
   | `TRUST_PROXY`                                                       | `1` (Caddy)                                                        |
   | `DATABASE_URL`                                                      | `postgresql://alconst_stage:<parolă>@127.0.0.1:5432/alconst_stage` |
   | `DATABASE_POOL_MAX`                                                 | `5`                                                                |
   | `REDIS_URL`                                                         | `redis://127.0.0.1:6379`                                           |
   | `QUEUE_PREFIX`                                                      | `alconst-stage`                                                    |
   | `FILES_STORAGE`, `S3_BUCKET`, `S3_REGION`                           | `s3`, bucket-ul propriu, regiunea lui                              |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | datele Resend (vezi [deploy.md](deploy.md))                        |

   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | primul administrator; parolă temporară, de cel puțin 12 caractere |

   `NODE_ENV=production` este pus de PM2; nu se adaugă aici.

   **Primul administrator.** La fiecare deploy, după migrări, dacă baza de date nu are niciun
   utilizator, se creează un administrator cu adresa și parola din `SEED_ADMIN_*` (opțional și
   `SEED_ADMIN_FIRST_NAME`, `SEED_ADMIN_LAST_NAME`). Parola este temporară: aplicația cere
   schimbarea ei la prima autentificare. Dacă există deja un utilizator, pasul nu face nimic,
   deci nu poate reseta o parolă și nu recreează un cont; `SEED_ADMIN_PASSWORD` poate fi ștearsă
   după prima autentificare.

6. **Rolul instanței** primește în plus: `ssm:GetParametersByPath` pe prefixul `/alconst/stage/`
   și `s3:PutObject`, `s3:GetObject` pe bucket-ul aplicației.
7. **Caddy**: se adaugă blocul din `deploy/Caddyfile.snippet`, cu hostname-ul API-ului și portul.
8. **Documentul SSM**, din `deploy/ssm-document.yml`.
9. **Rolul de deploy** (OIDC), propriu acestui repository. Nu se extinde rolul altei aplicații.
   - trust policy: `sub` egal cu `repo:<owner>/<repository>:environment:stage` (job-ul folosește
     mediul GitHub `stage`);
   - permisiuni: `ssm:SendCommand` pe documentul de mai sus și pe instanță,
     `ssm:GetCommandInvocation`.
10. **GitHub**, mediul `stage`:

    | Tip       | Nume                  | Conținut                                    |
    | --------- | --------------------- | ------------------------------------------- |
    | secret    | `AWS_DEPLOY_ROLE_ARN` | rolul de deploy                             |
    | secret    | `DEPLOY_INSTANCE_ID`  | instanța                                    |
    | variabilă | `AWS_REGION`          | regiunea                                    |
    | variabilă | `SSM_DOCUMENT_NAME`   | numele documentului SSM                     |
    | variabilă | `APP_URL`             | adresa publică a **API-ului** (fără `/api`) |

    Și o variabilă la nivel de repository: `DEPLOY_STAGE_ENABLED = true`. Până atunci, job-ul de
    deploy nu rulează, iar verificările automate funcționează ca înainte.

## După primul deploy

- [ ] `pm2 save`, **cu ambele aplicații pornite**. `pm2 save` scrie o singură listă pentru
      utilizator: rulat cu cealaltă aplicație oprită, la următorul reboot ar reveni doar aceasta.
- [ ] Un reboot de probă: revin amândouă aplicațiile.
- [ ] Baza de date a aplicației adăugată în scriptul de backup al instanței, apoi **un restore de
      probă** – nu citirea scriptului.
- [ ] Primul administrator: este creat de deploy, din `SEED_ADMIN_EMAIL` și `SEED_ADMIN_PASSWORD`
      (pasul 5 de mai sus). Intră cu parola temporară, schimb-o când ți se cere, apoi adaugă-i pe
      ceilalți din „Utilizatori”. După aceea șterge `SEED_ADMIN_PASSWORD` din Parameter Store.
- [ ] Swap pe instanță, dacă încă este 0.
- [ ] Avertizarea „rularea periodică este oprită” nu apare pe pagina principală.

## Interfața pe Vercel

Vercel găzduiește doar fișierele statice ale interfeței. Cererile cu date merg din browser direct
la API; prin Vercel nu trece nimic din datele aplicației.

Setările proiectului:

| Setare                 | Valoare                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| Root Directory         | `apps/web` (comenzile de build sunt în `apps/web/vercel.json`)       |
| `NUXT_PUBLIC_API_BASE` | adresa API-ului, cu `/api` la sfârșit – separat pentru fiecare mediu |
| Production Branch      | `release/prod`                                                       |
| Domeniul de stage      | atașat ramurii `release/stage`                                       |

**Cerință: interfața și API-ul trebuie să fie subdomenii ale aceluiași domeniu** (de exemplu
`stage.exemplu.ro` și `api-stage.exemplu.ro`). Sesiunea este un cookie `SameSite=Strict` al
API-ului: de pe un domeniu diferit – inclusiv adresele `*.vercel.app` – browserul nu îl trimite,
iar autentificarea nu funcționează. Din același motiv, adresele de previzualizare generate de
Vercel pentru alte ramuri nu se pot autentifica.

`APP_URL` din Parameter Store trebuie să fie exact adresa interfeței: este singura origine de la
care API-ul acceptă cereri.

Build-ul include antetele de securitate (inclusiv politica CSP, care permite conexiuni doar către
propria origine și către API) și regula prin care orice adresă a aplicației deschisă direct
primește pagina aplicației.

## Operare

| Vreau să…                      | Comandă                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| văd procesele                  | `pm2 ls`                                                     |
| văd logurile                   | `pm2 logs alconst-stage-api` / `alconst-stage-worker`        |
| repornesc aplicația            | `pm2 reload alconst-stage-api alconst-stage-worker`          |
| revin la o versiune anterioară | `sudo /srv/alconst/remote-deploy.sh stage <commit anterior>` |
| verific starea                 | `curl http://127.0.0.1:3200/api/ready`                       |

Nu se folosesc `pm2 reload all`, `pm2 restart all`, `pm2 delete all` sau `pm2 kill`.

Revenirea la o versiune anterioară nu anulează migrările bazei de date deja aplicate.

## Ce a fost verificat

Repetat local, cu aceeași structură (`/srv/alconst`, `/etc/alconst`, utilizator separat, PM2
real, PostgreSQL și Redis reale, AWS CLI înlocuit cu un fișier de parametri):

- un deploy complet, de la zero, și un al doilea peste el (repornire);
- o altă aplicație pornită sub același utilizator PM2 nu a fost atinsă (același proces, zero
  reporniri);
- o configurare greșită (o variabilă obligatorie lipsă) oprește deploy-ul; versiunea veche
  servește mai departe, cu fișierul ei de mediu neschimbat;
- o versiune care nu pornește (Redis inaccesibil în configurarea nouă) este oprită de pornirea
  de probă;
- un commit din afara ramurii, rularea ca root a lui `deploy.sh` și un al doilea deploy simultan
  sunt refuzate;
- valorile cu caractere speciale din Parameter Store ajung intacte în procese;
- interfața construită pentru Vercel și API-ul pe o origine diferită, într-un browser real:
  autentificare, reîncărcarea unei pagini, încărcare și descărcare de document; o pagină de pe alt
  site nu poate citi date.

**Nu a fost verificat**, pentru că nu se poate decât pe infrastructura reală: autentificarea OIDC
și rolurile IAM, documentul SSM, citirea reală din Parameter Store, limita de memorie impusă prin
systemd, blocul Caddy, build-ul pe Vercel, bucket-ul S3 și Redis-ul de pe instanță.
