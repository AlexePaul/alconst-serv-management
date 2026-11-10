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

| Pachet              | Rol                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`          | Interfața (Nuxt SPA). Nu accesează baza de date; vorbește doar cu `/api`.                            |
| `apps/api`          | REST API. Singurul loc în care se validează și se autorizează operațiunile.                          |
| `apps/worker`       | Procesează job-uri din Redis, în afara cererilor HTTP.                                               |
| `packages/database` | Schema Prisma, migrările, fabrica de client și generarea task-urilor – folosite de API și de worker. |
| `packages/shared`   | Contracte comune: DTO-uri, roluri, coduri de eroare, numele cozilor și payload-urile lor.            |

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

| Tabel                      | Rol                                                                      |
| -------------------------- | ------------------------------------------------------------------------ |
| `users`                    | Utilizatori interni, rol, stare, hash-ul parolei                         |
| `sessions`                 | Sesiuni active (hash token, expirare, IP, user agent)                    |
| `password_reset_tokens`    | Token-uri de resetare, de unică folosință                                |
| `activity_logs`            | Jurnal de activitate (cine, ce, asupra cui, când)                        |
| `clients`                  | Companiile cliente                                                       |
| `client_assignments`       | Responsabilii unui client (client ↔ utilizator intern)                   |
| `services`                 | Catalogul serviciilor oferite de firmă                                   |
| `client_services`          | Serviciile prestate unui client                                          |
| `locations`                | Punctele de lucru ale clienților                                         |
| `employees`                | Angajații clienților (date personale)                                    |
| `contracts`                | Contracte: perioadă, status                                              |
| `contract_fees`            | Tarifele unui contract: sumă + frecvență, opțional legate de un serviciu |
| `obligations`              | Activități recurente: frecvență, client, responsabil                     |
| `tasks`                    | Execuții concrete: termen, status, responsabil, observații               |
| `notifications`            | Notificările din aplicație, cu o cheie unică anti-duplicat               |
| `notification_settings`    | Preferințele de notificare ale fiecărui utilizator                       |
| `client_transfer_requests` | Cererile de predare a unui client între colegi și răspunsul la ele       |

Entitățile pentru documente se adaugă în Etapa 4, nu în avans.
Cheile primare sunt UUID v7 (ordonabile cronologic).

### Accesul la clienți

Regula este implementată într-un singur loc (`ClientAccessService`) și se aplică tuturor datelor
legate de un client – puncte de lucru, angajați, contracte:

- administratorii văd și modifică toți clienții și stabilesc responsabilii;
- un angajat vede și modifică doar clienții la care este responsabil; când adaugă un client,
  devine automat responsabilul lui;
- pentru clienții inaccesibili API-ul răspunde „nu există” (404), astfel încât un angajat să nu
  poată afla ce alți clienți are firma;
- un client arhivat rămâne vizibil responsabililor lui, cu toate datele (vezi mai jos).

### Arhivare în loc de ștergere

Clienții, punctele de lucru, angajații clienților și contractele **nu se șterg**. API-ul nu are
rute de ștergere pentru ele, iar în baza de date relațiile către client sunt `ON DELETE RESTRICT`,
deci nicio intervenție directă nu poate șterge un client care are istoric.

| Entitate       | Cum iese din uz               | Ce se întâmplă                                                                                                                                                           |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client         | Arhivare (`isActive = false`) | Dispare dintre clienții activi și din cifrele de pe pagina principală; rămâne accesibil responsabililor. Obligațiile lui sunt suspendate (vezi „Obligații și task-uri”). |
| Punct de lucru | Arhivare (`isActive = false`) | Nu mai poate fi ales pentru înregistrări noi; angajații și task-urile rămân legate de el.                                                                                |
| Angajat        | Arhivare (`isActive = false`) | De exemplu la plecarea din companie; rămâne în evidență, cu filtrul „arhivați”.                                                                                          |
| Contract       | Încheiere (`status = ENDED`)  | Rămâne cu tarifele lui; nu mai intră în venitul lunar estimat.                                                                                                           |
| Utilizator     | Dezactivare (din Etapa 1)     | Nu se mai poate autentifica; tot ce a făcut rămâne pe numele lui.                                                                                                        |

Arhivarea și reactivarea apar în jurnalul de activitate ca acțiuni distincte. Totul este
reversibil. Greșelile de introducere se corectează prin modificare, nu prin ștergere.

Ce se mai poate șterge, și de ce:

- un **serviciu** din catalog, doar dacă nu este folosit nicăieri;
- un **task creat manual și încă neînceput** (o greșeală de introducere); cele începute,
  finalizate sau anulate rămân ca istoric al activității;
- o **obligație**: definiția dispare, dar task-urile ei începute, finalizate sau anulate rămân.

Istoricul responsabilităților se păstrează în jurnalul de activitate (modificarea responsabililor
și predările de clienți, cu utilizatorii implicați) și pe task-uri (cine a fost responsabil, cine
a finalizat, cine a confirmat fișele).

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

### Obligații și task-uri

O **obligație** descrie ce se repetă (ex. „deplasare la 2 săptămâni la clientul X”); un **task**
este o execuție concretă, cu termen și responsabil. Un task poate exista și fără obligație.

- **Frecvența** este unitate (`DAY`, `WEEK`, `MONTH`, `YEAR`) + interval, calculată mereu de la
  primul termen, deci fără derivă: o obligație lunară începută pe 31 cade pe 28/29 februarie și
  revine pe 31 în martie. Logica este pură, în `packages/shared`, și testată separat.
- **Generarea** creează task-urile cu termene în următoarele 60 de zile (`TASK_HORIZON_DAYS`).
  Rulează imediat la salvarea obligației (din API) și din oră în oră (din worker). Constrângerea
  de unicitate (obligație, apariție) din baza de date face imposibile duplicatele, chiar și la
  rulări simultane. Termenele trecute nu se generează retroactiv.
- **Modificarea unei obligații** se propagă doar asupra task-urilor viitoare neîncepute. La
  schimbarea frecvenței sau a perioadei, task-urile ale căror termene nu mai fac parte din program
  sunt șterse, iar cele noi sunt generate; cele ale căror termene rămân în program sunt păstrate,
  cu reprogramările lor. Celelalte modificări se aplică pe loc, doar pentru câmpurile schimbate
  efectiv. Task-urile începute, finalizate sau anulate nu sunt atinse.
- **Dezactivarea** unei obligații și **arhivarea clientului** retrag task-urile viitoare
  neîncepute; reactivarea reia programul de azi încolo.
- Task-urile generate **nu se șterg, se anulează** – altfel următoarea generare le-ar recrea.
- Un task nu se finalizează niciodată automat. Generarea unui document (Etapa 4) și execuția
  activității sunt operațiuni distincte.
- **Deplasarea** este un tip de task (`VISIT`): mers la client și completarea fișelor. Nu conține
  nimic despre facturare – facturile se emit separat și nu corespund unu-la-unu cu deplasările.
- **Fișele**: aplicația ține doar evidența faptului că au fost completate (cine a confirmat și
  când), nu fișele propriu-zise. O deplasare poate fi finalizată și fără confirmare; rămâne atunci
  semnalată pe pagina principală și în filtrul „Deplasări fără fișe”.
- **Intervalul orar** (`startTime`–`endTime`, opțional) este o estimare a responsabilului, nu o
  programare fixă. Fiecare își organizează singur calendarul: mută deplasările pe altă zi sau la
  alte ore, iar aceste ajustări se păstrează când obligația este modificată fără legătură cu ele.

#### Cazuri-limită verificate prin teste

| Situație                                   | Comportament                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker-ul este oprit câteva zile           | Nu se pierde nimic: task-urile sunt create cu 60 de zile în avans, deci termenele din perioada opririi există deja și apar ca restanțe. La repornire se completează orizontul, iar reamintirile ratate sunt create o singură dată. |
| Se schimbă frecvența unei obligații active | Rămân task-urile ale căror termene coincid cu noul program (cu ora, reprogramarea sau preluarea de pe ele); celelalte task-uri viitoare neîncepute sunt înlocuite.                                                                 |
| Obligația este dezactivată                 | Task-urile viitoare neîncepute dispar; restanțele și cele începute, finalizate sau anulate rămân. Worker-ul nu le recreează.                                                                                                       |
| Se schimbă responsabilul                   | Noul responsabil primește task-urile neîncepute ale celui vechi. Un task preluat de un coleg pentru o singură deplasare rămâne la acel coleg; cele începute rămân la cine le-a început.                                            |
| Schimbarea orei de vară/iarnă              | Termenele sunt date calendaristice, fără oră, calculate în UTC; „azi” se stabilește în fusul orar al firmei. Ziua de 23 și cea de 25 de ore au fiecare exact un termen, o reamintire și un rezumat.                                |
| Un task generat este anulat manual         | Apariția rămâne ocupată de task-ul anulat, deci nu este regenerată de nicio operațiune ulterioară.                                                                                                                                 |
| Rulări simultane (API + worker)            | Constrângerea de unicitate împiedică duplicatele; în plus, generarea și modificările iau același blocaj pe rândul obligației, deci o generare nu poate folosi date depășite.                                                       |

Limite cunoscute, acceptate deocamdată:

- Dacă worker-ul stă oprit **mai mult decât orizontul de generare** (60 de zile), termenele care
  ar fi intrat în orizont și au și trecut în acest timp nu mai sunt create. Remediul potrivit este
  monitorizarea worker-ului (Etapa 5), nu generarea retroactivă.
- La schimbarea frecvenței, un task **început** pe vechiul program rămâne, chiar dacă noul program
  are un termen apropiat – aplicația nu ghicește că ar fi „același” task.
- Reprogramarea de pe un task viitor se pierde dacă termenul lui inițial nu mai face parte din
  noul program.

### Preluarea unui client de către alt coleg

- **Pentru o singură deplasare**: se schimbă responsabilul task-ului. Colegul vede task-ul (marcat
  „Înlocuire”) împreună cu adresa, persoana de contact și telefonul clientului – strictul necesar
  ca să ajungă acolo – dar nu primește acces la restul datelor clientului.
- **Definitiv**: responsabilitatea, obligațiile și task-urile deschise trec la noul responsabil;
  task-urile încheiate rămân în istoricul celui care le-a făcut. Predarea definitivă are loc doar:
  - **direct, de către un administrator**, între oricare doi utilizatori; sau
  - **cu acordul amândurora**: oricare dintre cei doi colegi trimite o cerere, iar transferul are
    loc abia după ce celălalt o acceptă. Cel care predă pornește cererea din pagina clientului;
    cel care preia o pornește dintr-un task pe care l-a executat deja pentru acel client (altfel
    nu are de unde ști că clientul există). Cererea poate fi refuzată sau retrasă, iar una
    depășită de situație (clientul a ajuns între timp la altcineva) se anulează singură.

### Notificări

Worker-ul rulează din oră în oră o sarcină idempotentă care:

1. generează task-urile lipsă din obligații;
2. creează reamintirile: cu N zile înainte de termen (N ales de fiecare utilizator), în ziua
   termenului și la restanță (în prima zi, apoi o dată la 7 zile);
3. trimite, după ora 7, cel mult un email-rezumat pe zi celor care au reamintiri noi;
4. șterge sesiunile și linkurile expirate.

Fiecare reamintire are o cheie care îi descrie motivul (tip, task, destinatar, termen), cu
constrângere de unicitate în baza de date. Rulările repetate nu pot produce notificări duplicate,
iar un task reprogramat primește reamintiri noi. Destinatarul este responsabilul task-ului; dacă
task-ul nu are responsabil sau contul acestuia a fost dezactivat, reamintirea ajunge la
responsabilii activi ai clientului, iar în lipsa lor la administratori. Astfel, după plecarea unui
coleg, termenele rămase pe numele lui nu trec neobservate.

Evenimentele – un task atribuit de altcineva, o cerere de predare a unui client, răspunsul la ea,
un transfer făcut de administrator – sunt anunțate imediat: în aplicație, cu toate detaliile, și
pe email, dacă destinatarul nu a oprit emailurile. Textul emailurilor este deliberat general
(„Un coleg vrea să îți predea un client”): titlurile task-urilor și numele clienților rămân în
aplicație și nu trec prin furnizorul de email.

„Azi” se stabilește în fusul orar al firmei (`APP_TIMEZONE`, implicit `Europe/Bucharest`), atât în
API, cât și în worker și în interfață.

### Căutare

Clienții și angajații au o coloană `searchText` – textul relevant, fără diacritice și cu litere
mici – actualizată la fiecare salvare. Căutarea normalizează la fel termenul introdus, deci
„stefan” găsește „Ștefan”. Soluția nu depinde de extensii PostgreSQL și poate primi ulterior un
index trigram dacă volumul o cere.

## Extensii viitoare: ce permite modelul actual

Niciuna dintre extensiile de mai jos nu este implementată. Analiza arată doar că se pot adăuga
fără restructurarea a ceea ce există – prin tabele și coloane noi.

### Evidența instruirilor pe angajat

Acum confirmarea fișelor se ține la nivel de deplasare (`tasks.sheetsCompletedAt`,
`sheetsCompletedById`). Evidența pe angajat se poate adăuga printr-un tabel nou, de exemplu
`task_employee_records` (task, angajat, tip, moment, cine a confirmat):

- task-ul are deja client și punct de lucru, deci lista angajaților vizați de o deplasare se
  obține direct;
- angajații nu se mai șterg, deci evidențele rămân valabile și după plecarea lor;
- confirmarea la nivel de deplasare rămâne ca rezumat („toate fișele”) sau se calculează din
  înregistrările individuale; datele existente nu trebuie migrate.

Ar mai fi de adăugat, tot aditiv: data plecării angajatului (acum există doar starea
activ/arhivat) și, dacă este nevoie, istoricul schimbărilor de funcție sau de punct de lucru.

### Planificarea automată a programului de lucru

Un modul separat ar propune fiecărui angajat un program (ordinea și orele deplasărilor) și ar
scrie în task-uri doar după acceptarea propunerii, prin aceeași operațiune de modificare folosită
azi – cu istoricul de modificări păstrat.

| Necesar pentru planificare                 | Stare în modelul actual                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Ce trebuie făcut, de cine, până când       | Există: task (tip, responsabil, termen, prioritate, status).                                                                      |
| Frecvențe                                  | Există: obligații; apariția inițială (`occurrenceDate`) este separată de termenul curent, deci reprogramarea nu strică recurența. |
| Interval orar pe zi                        | Există: `startTime`/`endTime` pe task, ajustabile manual.                                                                         |
| Adrese                                     | Există ca text: adresa clientului și a punctelor de lucru. Lipsesc coordonatele (două coloane noi pe `locations` și `clients`).   |
| Durata estimată a unei deplasări           | Se deduce doar când sunt completate ambele ore. De adăugat o durată estimată pe obligație și pe task.                             |
| Termen-limită separat de ziua planificată  | Acum există o singură dată (`dueDate`). De adăugat o dată planificată sau o fereastră permisă.                                    |
| Program de lucru, disponibilitate, blocaje | Lipsesc: tabele noi per utilizator (program săptămânal, intervale blocate).                                                       |
| Task-uri care nu pot fi mutate             | Lipsește: un marcaj pe task.                                                                                                      |
| Timpi de deplasare                         | Lipsesc: serviciu de rutare și un tabel de cache între perechi de adrese.                                                         |
| Propuneri care nu suprascriu calendarul    | Lipsesc: tabele pentru propunere și elementele ei, cu acceptare/modificare.                                                       |

De hotărât înainte de implementare: un serviciu extern de rutare (de exemplu Google Maps Routes
API) ar primi adresele clienților, deci are nevoie de aprobare explicită, conform regulii privind
datele trimise în afara aplicației; alternativa este un motor de rutare găzduit pe serverul
propriu.

## Convenții

- **Limbă**: interfața și mesajele către utilizator sunt în română; identificatorii din cod sunt în
  engleză; comentariile explică „de ce”, în română.
- **Validare**: pe frontend (zod, pentru feedback imediat) și pe backend (class-validator, sursa
  de adevăr). Regulile comune – de exemplu lungimea parolei – sunt în `packages/shared`.
- **Autorizare**: toate rutele cer autentificare implicit; excepțiile se marchează explicit cu
  `@Public()`. Verificările din frontend sunt doar pentru UX.
- **Audit**: orice operațiune care modifică date importante scrie în `activity_logs`.
