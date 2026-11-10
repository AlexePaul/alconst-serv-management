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

## Etapa 2 – Clienți și angajați

- CRUD companii cliente (date de identificare, contact, reprezentant legal, status)
- Contracte (perioadă, servicii, preț, status)
- Catalog de servicii configurabil și asocierea lor cu clienții
- Puncte de lucru
- Angajații clienților (cu punct de lucru, funcție, status)
- Căutare, filtrare, paginare pe server
- Import din Excel – de evaluat pe fișierele reale ale firmei

## Etapa 3 – Task-uri, obligații și calendar

- Obligații recurente configurabile per client (fără frecvențe legale hardcodate)
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
| Stocarea S3 self-hosted (MinIO community a intrat în mod de mentenanță)         | Mediu  | Decizie la începutul Etapei 4: serviciu găzduit (ex. Hetzner, Cloudflare R2) sau Garage/SeaweedFS                      |
| Un singur server = un singur punct de eșec                                      | Mediu  | Backup în afara serverului + procedură de restaurare (Etapa 5)                                                         |

## Întrebări deschise

Nu blochează Etapa 2, dar răspunsurile sunt necesare pe parcurs:

1. **Identitate vizuală** – există un logo și culori oficiale? Acum se folosește un simbol
   provizoriu (scut) și albastru; se schimbă din `apps/web/app/app.config.ts` și `apps/web/public/`.
2. **Găzduire** – pe ce server/furnizor va rula aplicația? De aici depind stocarea fișierelor și
   backup-ul.
3. **Email** – ce cont SMTP folosim pentru emailurile aplicației (ex. `no-reply@alconst-serv.ro`)?
4. **Documente reale** – câte un exemplu din fiecare tip (tematică, decizie, proces-verbal),
   ideal anonimizate, pentru a testa editorul și a pregăti template-urile.
5. **Fișierele Excel actuale** – un exemplu de structură, pentru a decide dacă importul merită
   făcut în Etapa 2.
6. **Permisiunile rolului „Angajat”** – ce poate vedea și modifica față de administrator
   (de exemplu: toți clienții sau doar cei alocați? poate șterge?).
