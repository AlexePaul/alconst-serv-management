# Roadmap

Aplicația se construiește incremental. Fiecare etapă livrează funcționalități complete
(backend + bază de date + interfață + teste), nu ecrane simulate.

## Etapa 1 – Foundation ✅

- [x] Monorepo pnpm: `apps/web`, `apps/api`, `apps/worker`, `packages/database`, `packages/shared`
- [x] Nuxt 4 + Nuxt UI 4 + Tailwind 4, interfață în română, temă luminoasă/întunecată
- [x] NestJS 12 + Prisma 7 + PostgreSQL, migrarea inițială
- [x] Redis + BullMQ, worker cu prima coadă reală (emailuri)
- [x] Autentificare: login, logout, schimbare parolă, resetare prin email, parole temporare
- [x] Administrare utilizatori: creare, modificare, activare/dezactivare, resetare parolă, roluri
- [x] Jurnal de activitate (audit log) + afișare pe pagina principală pentru administratori
- [x] Layout general: sidebar pe desktop, meniu adaptat pe mobil
- [x] PWA instalabilă (manifest, iconițe, service worker fără mod offline)
- [x] Docker Compose pentru dezvoltare și producție, Caddy pentru `app.alconst-serv.ro`
- [x] Teste (unitare + e2e), lint, typecheck, CI pe GitHub Actions
- [x] Evaluarea bibliotecilor de editare DOCX, cu test practic

## Etapa 2 – Clienți și angajați ✅

- [x] Companii cliente: date de identificare, contact, reprezentant legal, status
- [x] Responsabili: angajații văd și modifică doar clienții lor; administratorii văd tot
- [x] Catalog de servicii configurabil și asocierea lui cu clienții
- [x] Puncte de lucru
- [x] Angajații clienților (funcție, punct de lucru, data angajării, status)
- [x] Contracte cu oricâte tarife, fiecare cu propria frecvență; venit lunar estimat
- [x] Avertizare pentru contractele care expiră, pe pagina principală și în pagina clientului
- [x] Căutare fără diacritice, filtrare, paginare pe server
- [x] Logo-ul și culorile firmei în interfață, iconițe și emailuri

Importul din Excel a fost scos din plan: nu există fișiere Excel de migrat.

## Etapa 3 – Task-uri, obligații și calendar

- Obligații recurente configurabile per client (fără frecvențe legale hardcodate), inclusiv
  deplasările: unele lunare, altele săptămânale sau la 3 luni, uneori cu frecvențe diferite pentru
  angajați diferiți ai aceluiași client
- Generarea automată a task-urilor din obligații (job programat în worker)
- Task-uri: responsabil, prioritate, termen, status, istoric de modificări
- Calendar (zi / săptămână / lună) și vedere listă
- Dashboard real: restanțe, azi, următoarele 7 zile, termene apropiate
- Notificări: în aplicație, email, Web Push (pe iOS doar pentru PWA instalată), fără duplicate
- Navigare rapidă pe mobil către task-uri și calendar (bară inferioară)
- Curățarea periodică a sesiunilor și token-urilor expirate

## Etapa 4 – Documente

- Stocare S3-compatibilă pentru fișiere; acces doar prin URL-uri semnate, cu expirare scurtă
- Template-uri DOCX: încărcare, validare, versionare, activare/dezactivare
- Motor de generare: docxtemplater + pizzip, determinist, cu snapshot al datelor folosite
- Numerotare fără duplicate (contor per tip/an, incrementat tranzacțional)
- Generare individuală în cerere scurtă; generare în masă și conversie PDF în worker
- Editor DOCX în aplicație (`@docx-editor.dev/vue`), cu versiuni separate de original
- Arhivă cu căutare și filtrare după companie, tip, dată, angajat, număr

## Etapa 5 – Stabilizare

- Backup automat (bază de date + fișiere) și test de restaurare
- Politică de retenție a datelor
- Întărirea CSP, revizuire de securitate
- Monitorizare și alerte
- Optimizări (de exemplu dimensiunea imaginilor Docker: CLI-ul Prisma ajunge acum și în imaginea API)
- Pipeline de deploy, lansarea în producție

## Riscuri tehnice identificate

| Risc                                                                            | Impact | Cum îl tratăm                                                                                                          |
| ------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Fidelitatea editorului DOCX pe documentele reale ale firmei                     | Mare   | Test pe documentele reale la începutul Etapei 4; plan de rezervă în [evaluare-editor-docx.md](evaluare-editor-docx.md) |
| Pachetele „Pro” ale editorului au licență comercială                            | Mediu  | Folosim doar pachetele Apache-2.0; PDF prin LibreOffice; licența se reverifică la actualizări                          |
| Editorul nu are interfață în română                                             | Mic    | Traduceri proprii prin proprietatea `i18n`                                                                             |
| Fonturile din documente nu există în browser/pe server                          | Mediu  | Fonturi înlocuitoare servite local; aceleași fonturi instalate în imaginea worker-ului                                 |
| Prisma 8 schimbă modelul de lucru                                               | Mic    | Rămânem pe 7.x stabil; evaluare după lansarea finală                                                                   |
| Ecosistem foarte nou (NestJS 12, BullMQ 6, Nuxt 4)                              | Mic    | Versiuni fixate în lockfile, teste automate, actualizări controlate                                                    |
| Web Push pe iOS funcționează doar pentru PWA instalată, cu permisiune explicită | Mediu  | Emailul și notificările din aplicație rămân canalele de bază                                                           |
| Stocarea fișierelor                                                             | Mic    | Amazon S3 (bucket privat, versionare), accesat prin rol IAM de pe instanța EC2                                         |
| Un singur server = un singur punct de eșec                                      | Mediu  | Backup în afara serverului + procedură de restaurare (Etapa 5)                                                         |

## Decizii luate împreună cu firma

- **Identitate vizuală**: logo-ul oficial (din repository-ul website-ului) și bleumarinul lui.
- **Găzduire**: AWS EC2; fișierele vor sta în Amazon S3.
- **Email**: căsuțe pe Zoho, trimitere automată prin Resend (SMTP).
- **Import Excel**: nu este necesar.
- **Permisiuni**: un angajat vede și modifică doar clienții lui și își poate adăuga clienți noi.
- **Încasări**: fiecare client are propriile sume și frecvențe; cerințele se vor rafina pe parcurs,
  deci modelul de tarife este deliberat flexibil.

## Întrebări deschise

Nu blochează Etapa 3, dar răspunsurile sunt necesare pe parcurs:

1. **Documente reale** – câte un exemplu din fiecare tip (tematică, decizie, proces-verbal),
   ideal anonimizate, pentru a testa editorul și a pregăti template-urile (Etapa 4).
2. **Vizibilitatea sumelor** – acum un angajat vede tarifele clienților lui. Dacă sumele trebuie
   să fie vizibile doar administratorilor, este o schimbare mică.
3. **Urmărirea încasărilor** – aplicația reține ce s-a convenit (tarife și frecvențe), nu și ce
   s-a încasat efectiv. Dacă vreți evidența plăților (plătit / restant per deplasare sau lună),
   trebuie stabilit cum arată – se leagă natural de deplasările din Etapa 3.
4. **Deplasări** – ce înseamnă concret o deplasare (cine merge, la ce punct de lucru, ce se face,
   ce se încasează) și cum se stabilește frecvența ei pentru fiecare client.
5. **Mai mulți responsabili pe client** – modelul permite mai mulți; de confirmat că așa se lucrează.
6. **Ștergerea** – acum un angajat poate șterge puncte de lucru, angajați și contracte ale
   clienților lui, dar nu clientul. De confirmat.
