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

## Etapa 3 – Task-uri, obligații și calendar ✅

- [x] Obligații recurente configurabile (zilnic, săptămânal, lunar, anual, la N unități), cu sau
      fără client, cu punct de lucru și responsabil; nicio frecvență nu este fixată în cod
- [x] Generarea automată a task-urilor: imediat la salvarea obligației și periodic în worker,
      fără duplicate, cu 60 de zile în avans
- [x] Task-uri: tip (activitate / deplasare), responsabil, prioritate, termen, status,
      observații, istoric de modificări
- [x] Listă de task-uri grupată după urgență, cu căutare și filtre
- [x] Calendar: lună, săptămână, zi
- [x] Pagina principală: restanțe, azi, următoarele 7 zile
- [x] Notificări în aplicație: atribuire, termen apropiat, termen astăzi, restanță – fără duplicate
- [x] Rezumat zilnic pe email (cel mult unul pe zi, doar cu numere)
- [x] Preferințe de notificare per utilizator
- [x] Bară de navigare rapidă pe mobil
- [x] Curățarea periodică a sesiunilor și linkurilor expirate
- [x] Interval orar estimat pe task-uri și obligații; fiecare își planifică singur calendarul
- [x] Evidența completării fișelor la deplasări (doar confirmarea, nu fișele)
- [x] Preluarea unei singure deplasări de către un coleg
- [x] Predarea definitivă a unui client: direct de către un administrator sau prin cerere,
      inițiată de oricare dintre cei doi colegi, cu acordul celuilalt
- [x] Emailuri imediate pentru evenimente (task atribuit, cereri de predare și răspunsul la ele)

Completări după discuția din noiembrie 2026:

- [x] Arhivare în loc de ștergere pentru clienți, puncte de lucru, angajați și contracte; baza de
      date refuză ștergerea unui client cu istoric
- [x] Arhivarea unui client suspendă obligațiile lui; reactivarea le reia
- [x] Reamintirile unui coleg cu contul dezactivat ajung la responsabilii clientului sau la
      administratori
- [x] Teste pentru cazurile-limită ale obligațiilor: worker oprit, schimbarea frecvenței,
      dezactivare, schimbarea responsabilului, ora de vară/iarnă, anulări, rulări simultane
      (rezultatele sunt în [arhitectura.md](arhitectura.md), „Cazuri-limită verificate prin teste”)

Amânat: **Web Push**. Necesită un service worker propriu, chei VAPID și stocarea abonamentelor,
iar pe iPhone funcționează doar pentru aplicația instalată pe ecranul principal. Notificările din
aplicație și emailul acoperă nevoia de bază; Web Push se adaugă în etapa de stabilizare.

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
- Monitorizare și alerte – în primul rând pentru worker: dacă rularea periodică nu a avut loc de
  câteva ore, cineva trebuie să afle (o oprire mai lungă de 60 de zile ar pierde termene)
- Optimizări (de exemplu dimensiunea imaginilor Docker: CLI-ul Prisma ajunge acum și în imaginea API)
- Pipeline de deploy, lansarea în producție

## Module viitoare (neplanificate încă)

Sunt notate ca să nu se piardă; nu fac parte din etapele 1–5 și nu se implementează acum. Ce
permite deja modelul de date pentru ele este descris în [arhitectura.md](arhitectura.md),
„Extensii viitoare”.

- **Evidența instruirilor pe angajat.** Acum se confirmă fișele o dată pe deplasare. Extinderea
  la nivel de angajat se poate face printr-un tabel nou, fără restructurare.
- **Integrare SmartBill.** Emiterea facturilor și verificarea încasărilor; se analizează separat.
- **Planificarea automată a programului de lucru.** Propunerea unui program optim pentru fiecare
  angajat, ținând cont de: programul de lucru și disponibilitate, durata estimată a deplasărilor,
  termene și frecvențe, adresele și distanțele dintre puncte de lucru, timpii de deplasare (de
  exemplu prin Google Maps Routes API), gruparea geografică, priorități și task-uri care nu pot fi
  mutate, intervale blocate manual, recalculare la urgențe și acceptarea sau modificarea
  propunerii fără suprascrierea calendarului existent. Structura actuală (task-uri cu termen,
  interval orar, responsabil și punct de lucru; obligații cu frecvență) permite adăugarea lui ca
  modul separat; lipsesc, toate aditive: coordonatele adreselor, durata estimată, programul de
  lucru și blocajele, timpii de deplasare și stocarea propunerilor. Un serviciu extern de rutare
  ar primi adresele clienților, deci necesită aprobare explicită.

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
- **Deplasări**: o deplasare înseamnă mers la client și completarea fișelor. Este un tip de task,
  programat de regulă printr-o obligație recurentă.
- **Fișe**: aplicația ține doar evidența că au fost completate la deplasare, nu le generează.
- **Calendar**: fiecare persoană își planifică singură deplasările, cu un interval orar estimat.
- **Preluări**: o firmă poate fi preluată de un coleg pentru o singură deplasare sau definitiv.
  Definitiv doar dacă mută un administrator sau cu acordul amândurora; cererea o poate porni
  oricare dintre cei doi. Evenimentele sunt anunțate și pe email.
- **Facturare**: facturile se emit prin SmartBill și nu sunt legate unu-la-unu de deplasări – pot
  exista facturi fără deplasare și deplasări fără factură. De aceea deplasările nu conțin nimic
  despre încasare; integrarea cu SmartBill va fi un modul separat.
- **Vizibilitatea sumelor**: un angajat vede tarifele și venitul estimat doar pentru clienții lui;
  administratorii văd situația întregii firme. Angajații nu văd totalurile firmei și nici
  contractele colegilor.
- **Arhivare, nu ștergere**: clienții, punctele de lucru, angajații și contractele se arhivează
  sau se dezactivează. Istoricul activităților, al documentelor și al responsabilităților se
  păstrează, inclusiv după plecarea unui angajat sau încetarea unui contract.
- **Evidența instruirilor**: deocamdată confirmarea fișelor rămâne la nivel de deplasare; modelul
  permite extinderea ulterioară la nivel de angajat.
- **Emailuri**: rezumatul zilnic conține doar numere. Numele clienților și detaliile activităților
  nu se trimit prin email.
- **SmartBill**: nu se implementează acum; emiterea facturilor și verificarea încasărilor se
  analizează separat.
- **Documente**: înainte de implementarea template-urilor, firma furnizează câte un DOCX
  anonimizat pentru fiecare tip (tematică de instruire, decizie internă, proces-verbal).

## Întrebări deschise

1. **Documente reale** – așteptăm câte un DOCX anonimizat din fiecare tip (tematică de instruire,
   decizie internă, proces-verbal), pentru a testa editorul și a pregăti template-urile. Necesare
   la începutul Etapei 4.
2. **Ștergerea task-urilor și a obligațiilor** – un task creat manual poate fi șters doar cât timp
   nu a fost început, iar o obligație poate fi ștearsă (task-urile ei încheiate rămân). Dacă vreți
   ca și acestea să fie doar dezactivate, este o schimbare mică.
3. **Obligațiile unui punct de lucru arhivat** – rămân active până sunt dezactivate manual. Dacă
   arhivarea punctului de lucru ar trebui să le suspende automat, ca la clienți, se poate.
4. **Data plecării unui angajat** – acum se ține doar starea (activ/arhivat). Dacă data exactă
   contează, de exemplu pentru evidența instruirilor, se adaugă un câmp.
