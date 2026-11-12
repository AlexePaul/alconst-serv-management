# Roadmap

Aplicația se construiește incremental. Fiecare etapă livrează funcționalități complete
(backend + bază de date + interfață + teste), nu ecrane simulate.

## Unde suntem acum

_Actualizat: 11 noiembrie 2026 · ramura `release/stage`._

**Pe scurt:** aplicația este gata de testat de către oameni. Ce lipsește pentru lansarea pe stage
nu mai este cod, ci configurarea infrastructurii (lista „De făcut de Alex” de mai jos).

| Etapă                               | Stare                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| 1 – Foundation                      | ✅ gata                                                            |
| 2 – Clienți                         | ✅ gata                                                            |
| 3 – Activități, recurențe, calendar | ✅ gata                                                            |
| 4 – Documente                       | 🟡 secțiunea de fișiere gata; documentele generate așteaptă DOCX   |
| 5 – Stabilizare                     | 🟡 backup, supraveghere worker și pipeline gata; restul după stage |
| Simplificarea interfeței            | ✅ gata (vezi mai jos)                                             |
| Lansare stage                       | ⏳ așteaptă configurarea infrastructurii                           |
| Lansare producție                   | ⏳ după perioada de testare pe stage                               |

### Ce pot face testerii pe stage

- intră în cont (parolă temporară la prima autentificare, apoi parola lor);
- adaugă un client și spun, în același formular, cât de des merg la el și în ce luni;
- văd pe pagina principală ce au de făcut și bifează deplasările (cu numărul de angajați și
  confirmarea fișelor);
- folosesc calendarul, contractele, punctele de lucru, documentele pe client și notificările;
- găsesc explicațiile în pagina „Ajutor” din meniu.

### De făcut de Alex pentru lansarea pe stage

Pașii sunt descriși în [instalare-server.md](instalare-server.md).

- [ ] Redis pe instanța EC2
- [ ] Baza de date și rolul PostgreSQL ale aplicației (fără drepturi pe baza celeilalte aplicații)
- [ ] Bucket S3 propriu și rolul IAM al instanței
- [ ] Parametrii din Parameter Store, sub prefixul aplicației
- [ ] Rolul OIDC de deploy, documentul SSM și blocul Caddy pentru API
- [ ] În GitHub: mediul `stage` (secrete și variabile) și variabila `DEPLOY_STAGE_ENABLED`
- [ ] Proiectul Vercel pentru interfață (`apps/web`), cu `NUXT_PUBLIC_API_BASE`
- [ ] Domeniile: interfața și API-ul ca subdomenii ale aceluiași domeniu
- [ ] Ramura implicită a repository-ului: `release/stage`
- [ ] Conturile testerilor (din „Utilizatori”, cu parolă temporară)
- [ ] Baza de date adăugată în scriptul de backup al instanței

### Verificat doar local, de confirmat pe stage

- deploy-ul prin GitHub Actions și SSM (repetat local cu PM2 real, nu pe AWS);
- stocarea în S3 (testată pe un server de probă, nu pe un bucket real);
- build-ul pe Vercel (reprodus local cu aceeași configurație);
- aplicația pe un iPhone fizic (verificată doar în emulare).

### Simplificarea interfeței (noiembrie 2026) ✅

Scop: cineva fără experiență tehnică să poată folosi aplicația din prima zi.

- [x] Cuvinte obișnuite: „De făcut” și „activitate” în loc de „task”, „activitate recurentă” în
      loc de „obligație” (în cod și în documentația tehnică au rămas `task` și `obligation`)
- [x] Pagina principală arată doar ce este de făcut; secțiunile goale nu mai apar
- [x] Client nou și frecvența deplasărilor într-un singur formular; câmpurile rare sunt strânse
      sub „Mai multe detalii”
- [x] Pagina „Ajutor”: cinci pași și întrebări frecvente
- [x] Parcurgere completă în browser, pe desktop și pe iPhone (emulat), ca utilizator nou
- [x] Contactele clientului: pe lângă contactul principal, oricâte persoane, fiecare cu rolul
      scris de utilizator („Administrator”, „Persoana care este mereu acolo”), telefon și email

- [x] Confirmarea cu clientul, manuală: sub fiecare deplasare, butonul „Am confirmat cu
      clientul”; confirmarea se șterge dacă data, ora sau clientul se schimbă

### Amânat: confirmarea deplasărilor prin email

Hotărât pe 12 noiembrie 2026: deocamdată confirmarea rămâne manuală (angajatul vorbește cu
clientul și apasă butonul). Aplicația nu trimite nimic clienților.

Varianta dorită pentru mai târziu, fără conturi pentru clienți:

- clientul primește un email cu data și ora deplasării și un link de forma
  `https://api.alconst-serv.ro/confirm/<cod>`, accesibil oricui are linkul;
- deschiderea linkului și apăsarea pe „Confirm” marchează deplasarea drept confirmată – aceeași
  bifă pe care o pune acum angajatul.

De ce este suficient de sigur: codul este aleator și imposibil de ghicit, linkul arată și
confirmă o singură deplasare, nu dă acces la nimic altceva, iar o confirmare făcută de altcineva
nu produce nicio pagubă. La implementare: codul separat de identificatorul intern al deplasării,
valabil până în ziua ei, confirmarea printr-un buton (nu la simpla deschidere, ca filtrele de
email care verifică linkurile să nu confirme singure) și limită de încercări pe adresă.

### Ce urmează după lansarea pe stage

1. Corecturi din observațiile testerilor.
2. Documentele generate (Etapa 4, partea a doua) – după primirea exemplelor DOCX anonimizate.
3. Restul stabilizării: retenția datelor, întărirea CSP, monitorizare externă, Web Push.
4. Crearea ramurii `release/prod` și lansarea în producție, cu aprobarea ta.

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

## Etapa 2 – Clienți ✅

- [x] Companii cliente: date de identificare, contact, reprezentant legal, status
- [x] Responsabili: angajații văd și modifică doar clienții lor; administratorii văd tot
- [x] Catalog de servicii configurabil și asocierea lui cu clienții
- [x] Puncte de lucru
- [x] Numărul de angajați al fiecărui client (inițial evidență nominală; înlocuită ulterior,
      vezi „Decizii luate împreună cu firma”)
- [x] Contracte cu oricâte tarife, fiecare cu propria frecvență; venit lunar estimat
- [x] Avertizare pentru contractele care expiră, pe pagina principală și în pagina clientului
- [x] Căutare fără diacritice, filtrare, paginare pe server
- [x] Logo-ul și culorile firmei în interfață, iconițe și emailuri

Importul din Excel a fost scos din plan: nu există fișiere Excel de migrat.

## Etapa 3 – Activități, recurențe și calendar ✅

În interfață, task-urile se numesc „activități” („De făcut”), iar obligațiile „activități
recurente”.

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

Completări după discuțiile din noiembrie 2026:

- [x] Termene flexibile: activitățile recurente pot fi făcute oricând în luna sau săptămâna lor;
      restanța apare abia după încheierea perioadei
- [x] Numărul de angajați pe client în locul evidenței nominale; întrebat la finalizarea fiecărei
      deplasări
- [x] Alegerea lunilor pentru frecvențele la 2, 3, 4 sau 6 luni și anuale, pe fiecare client

- [x] Arhivare în loc de ștergere pentru clienți, puncte de lucru și contracte; baza de
      date refuză ștergerea unui client cu istoric
- [x] Arhivarea unui client suspendă obligațiile lui; reactivarea le reia
- [x] Reamintirile unui coleg cu contul dezactivat ajung la responsabilii clientului sau la
      administratori
- [x] Teste pentru cazurile-limită ale obligațiilor: worker oprit, schimbarea frecvenței,
      dezactivare, schimbarea responsabilului, ora de vară/iarnă, anulări, rulări simultane
      (rezultatele sunt în [arhitectura.md](arhitectura.md), „Cazuri-limită verificate prin teste”)

- [x] Apariții sărite: la bifarea unei deplasări, aplicația întreabă dacă și cea rămasă nebifată
      din perioada anterioară este făcută și le finalizează împreună

Amânat: **Web Push**. Necesită un service worker propriu, chei VAPID și stocarea abonamentelor,
iar pe iPhone funcționează doar pentru aplicația instalată pe ecranul principal. Notificările din
aplicație și emailul acoperă nevoia de bază; Web Push se adaugă în etapa de stabilizare.

## Etapa 4 – Documente

Prima parte – secțiunea de documente ✅

- [x] Stocare pentru fișiere: Amazon S3 sau disc local, în spatele aceleiași interfețe
- [x] Acces doar prin API, autentificat și autorizat; fără adrese publice către fișiere
- [x] Câte o secțiune de documente pe client, plus una generală a firmei
- [x] Dosare pe mai multe niveluri; încărcare, descărcare, redenumire, mutare, căutare
- [x] Validarea fișierelor încărcate: tip acceptat, conținut conform extensiei, dimensiune, nume
- [x] Arhivare în loc de ștergere și pentru fișiere

A doua parte – documente generate (după primirea exemplelor DOCX)

- Template-uri DOCX: încărcare, validare, versionare, activare/dezactivare
- Motor de generare: docxtemplater + pizzip, determinist, cu snapshot al datelor folosite
- Numerotare fără duplicate (contor per tip/an, incrementat tranzacțional)
- Generare individuală în cerere scurtă; generare în masă și conversie PDF în worker
- Editor DOCX în aplicație (`@docx-editor.dev/vue`), cu versiuni separate de original
- Arhivă cu căutare și filtrare după companie, tip, dată, număr

## Etapa 5 – Stabilizare

- [x] Backup automat al bazei de date (zilnic, verificat, cu păstrare 14 zile) și test de
      restaurare; copia în afara serverului se configurează la instalare
- Politică de retenție a datelor
- Întărirea CSP, revizuire de securitate
- [x] Avertizare pentru administratori, pe pagina principală, dacă rularea periodică (worker-ul)
      nu a mai avut loc de 3 ore
- Monitorizare externă și alerte (serverul însuși, spațiul pe disc, certificatul)
- Optimizări (de exemplu dimensiunea imaginilor Docker: CLI-ul Prisma ajunge acum și în imaginea API)
- [x] Pipeline de deploy pentru stage (inactiv până la configurarea infrastructurii)
- Lansarea în producție

## Module viitoare (neplanificate încă)

Sunt notate ca să nu se piardă; nu fac parte din etapele 1–5 și nu se implementează acum. Ce
permite deja modelul de date pentru ele este descris în [arhitectura.md](arhitectura.md),
„Extensii viitoare”.

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
- **Găzduire**: API-ul și worker-ul pe o instanță AWS EC2 deja existentă, partajată cu o altă
  aplicație (PM2, Caddy și PostgreSQL direct pe mașină; deploy prin GitHub Actions și SSM);
  interfața pe Vercel; fișierele în Amazon S3, într-un bucket propriu.
- **Ramuri**: `release/stage` și `release/prod`, fără `main`.
- **Documente**: nu este nevoie de dosare vizibile doar administratorilor.
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
- **Arhivare, nu ștergere**: clienții, punctele de lucru și contractele se arhivează
  sau se dezactivează. Istoricul activităților, al documentelor și al responsabilităților se
  păstrează, inclusiv după plecarea unui angajat sau încetarea unui contract.
- **Fără date despre angajații clienților**: aplicația ține doar numărul de angajați al fiecărui
  client, reconfirmat la fiecare deplasare. Evidența nominală a fost scoasă – adăuga muncă fără
  folos și date personale de care firma nu are nevoie. Confirmarea fișelor rămâne la nivel de
  deplasare.
- **Termene pe perioadă**: o deplasare recurentă trebuie făcută în luna (sau săptămâna) ei, nu
  într-o zi anume. Se păstrează de regulă aceeași parte a lunii, cu mici mutări, ca facturile
  clientului să nu vină una după alta.
- **Emailuri**: rezumatul zilnic conține doar numere. Numele clienților și detaliile activităților
  nu se trimit prin email.
- **SmartBill**: nu se implementează acum; emiterea facturilor și verificarea încasărilor se
  analizează separat.
- **Lunile deplasărilor la 3 luni**: diferă de la client la client (ianuarie–aprilie–…,
  februarie–mai–… sau martie–iunie–…) și se aleg pe obligația clientului. Perioada unei astfel
  de deplasări este luna în care cade, nu întregul trimestru.
- **Fără planificare automată deocamdată**: aplicația știe doar ce trebuie făcut și cât de des
  (lunar, la 3 luni etc.); fiecare angajat bifează ce a făcut. Nu propune zile, ore sau trasee.
- **Clienți săriți**: un client ratat într-o lună este de regulă vizitat luna următoare, pentru
  ambele perioade; ambele se marchează ca făcute, fără alte explicații.
- **Secțiunea de documente**: un spațiu de fișiere pe secțiuni – fiecare client are documentele
  lui, plus o secțiune generală a firmei – cu dosare, ca într-un drive partajat.
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
