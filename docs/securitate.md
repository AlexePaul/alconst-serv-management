# Securitate

Aplicația gestionează date despre companiile cliente. Nu ține evidența angajaților acestora –
doar numărul lor – deci nu stochează date personale despre ei; rămân datele de contact ale
clienților (persoană de contact, telefon, email) și conturile utilizatorilor interni. Documentul
descrie măsurile implementate în Etapa 1 și ce rămâne de făcut.

## Autentificare

- **Fără înregistrare publică.** Conturile sunt create de un administrator; primul administrator se
  creează din linia de comandă (`pnpm admin:create`).
- **Parole**: Argon2id (parametrii recomandați de OWASP), minimum 10 caractere. Regula este
  aceeași pe frontend și pe backend (`packages/shared`).
- **Parole temporare**: la crearea contului sau la resetarea de către administrator, utilizatorul
  primește o parolă temporară și este obligat să o schimbe. Până atunci, API-ul refuză orice altă
  operațiune (`PASSWORD_CHANGE_REQUIRED`), nu doar interfața.
- **Resetare prin email**: token aleatoriu de 256 biți, valabil 60 de minute, de unică folosință,
  stocat doar ca hash. Răspunsul este identic indiferent dacă adresa există.
- **Mesaj unic la login eșuat** („Email sau parolă incorectă”) pentru email necunoscut, parolă
  greșită sau cont dezactivat; timpul de răspuns este egalizat pentru adrese inexistente.
- **Limitare a încercărilor**: 10 autentificări/minut și 5 cereri de resetare/15 minute per IP,
  plus o limită generală de 300 de cereri/minut.

## Sesiuni și cookie-uri

- Token de sesiune opac (256 biți), stocat în baza de date doar ca hash SHA-256.
- Cookie `httpOnly`, `SameSite=Strict`, `Secure` în producție, cu prefixul `__Host-` (acceptat de
  browser doar prin HTTPS și doar pentru acest host).
- Durată implicită 14 zile, cu prelungire automată la utilizare activă.
- Sesiunile sunt **revocate imediat** la: logout, dezactivarea contului, schimbarea parolei
  (celelalte dispozitive), resetarea parolei (toate dispozitivele).

## CSRF

- Cookie-ul `SameSite=Strict` nu este trimis la cereri inițiate de alte site-uri.
- Suplimentar, API-ul respinge orice cerere care modifică date dacă antetul `Origin` nu corespunde
  cu `APP_URL` (sau, în lipsa lui, dacă `Sec-Fetch-Site` indică altă origine).
- API-ul acceptă doar `application/json`; formularele HTML clasice sunt respinse.
- CORS nu este activat – web și API sunt pe aceeași origine.

## Autorizare

- Toate rutele cer autentificare implicit (guard global); rutele publice sunt marcate explicit.
- Restricțiile de rol se declară cu `@Roles('ADMIN')` și sunt verificate pe server la fiecare cerere.
- Un administrator nu își poate dezactiva propriul cont și nu își poate schimba rolul, deci există
  mereu cel puțin un administrator activ.
- Conturile nu se șterg, ci se dezactivează – istoricul din audit rămâne intact.
- **Fără ștergere definitivă** pentru clienți, puncte de lucru și contracte: se
  arhivează (contractele se încheie) și pot fi reactivate. API-ul nu are rute de ștergere pentru
  ele, iar baza de date refuză ștergerea unui client care are date asociate.
- **Acces la clienți pe responsabili**: un angajat vede și modifică doar clienții la care este
  responsabil, împreună cu punctele de lucru și contractele lor. Regula este aplicată
  pe server, la fiecare cerere; pentru clienții altora răspunsul este „nu există”. Doar
  administratorii stabilesc responsabilii. Tarifele și venitul estimat urmează aceeași regulă: un
  angajat le vede doar pentru clienții lui, iar totalurile firmei doar administratorii.
- **Task-uri și obligații**: un angajat vede ce îi este atribuit, ce a creat el și tot ce ține de
  clienții lui. Un task atribuit unui coleg îi dă acces la task și la datele de contact ale
  clientului (adresă, persoană de contact, telefon, număr de angajați), nu și la restul datelor
  clientului. La finalizarea deplasării poate actualiza numărul de angajați.
- **Predarea definitivă a unui client** are loc doar prin acțiunea unui administrator sau cu
  acordul ambilor colegi. Nimeni nu își poate aproba singur cererea, iar cererile sunt vizibile
  doar celor doi implicați și administratorilor. Un angajat poate cere preluarea unui client doar
  dacă a executat deja un task pentru el.
- **Notificări**: fiecare utilizator își vede doar propriile notificări.
- **Documente**: fișierele unui client sunt accesibile doar responsabililor lui și
  administratorilor; secțiunea generală, tuturor utilizatorilor. Pentru ceilalți, dosarele și
  fișierele „nu există”.

## Fișiere încărcate

- **Fără URL-uri publice**: fișierele stau într-un spațiu de stocare privat (bucket S3 privat sau
  un director de pe server) și se descarcă doar prin API, după autentificare și verificarea
  accesului. Nu există linkuri permanente sau partajabile către fișiere.
- **Tipuri acceptate**: documente, tabele, prezentări, imagini și arhive ZIP. Executabilele,
  paginile HTML și scripturile sunt respinse. Tipul se verifică și după conținut (primii octeți),
  nu doar după extensie.
- **Dimensiune**: cel mult 25 MB pe fișier (`MAX_UPLOAD_MB`); cererea este întreruptă imediat ce
  limita este depășită.
- **Nume**: caracterele care ar permite ieșirea din dosar (`/`, `\`, `..`) sunt respinse, iar
  cheia de stocare nu conține numele fișierului.
- **Descărcare ca atașament**, cu `X-Content-Type-Options: nosniff`: un fișier încărcat nu poate
  rula cod în originea aplicației.
- **Fără ștergere din aplicație**: fișierele se arhivează. În S3, obiectele sunt criptate pe
  server (SSE-S3); versionarea bucket-ului protejează suplimentar împotriva suprascrierii.

## Validarea datelor

- DTO-uri cu class-validator; câmpurile necunoscute sunt respinse (`forbidNonWhitelisted`).
- Corpul cererilor este limitat la 1 MB.
- Erorile neașteptate nu expun detalii interne către client; sunt doar înregistrate în loguri.

## Antete și transport

- HTTPS obligatoriu în producție (certificat automat prin Caddy), HSTS activ.
- API: antete Helmet, `Cache-Control: no-store` pe toate răspunsurile.
- Web: Content-Security-Policy care permite resurse doar de pe propria origine,
  `X-Frame-Options: DENY`, `noindex` (aplicația nu trebuie să apară în motoarele de căutare).
- Aplicația nu încarcă nimic de la terți (fonturi, iconițe, analytics).

## Jurnal de activitate

Se înregistrează: autentificări reușite și eșuate, deconectări, schimbări și resetări de parolă,
crearea, modificarea, activarea și dezactivarea conturilor, precum și orice adăugare, modificare,
arhivare sau reactivare de clienți, responsabili, servicii, puncte de lucru, contracte,
obligații și task-uri (pentru task-uri, cu valorile vechi și noi – acesta este istoricul lor de
modificări). Fiecare intrare conține autorul,
entitatea afectată, momentul și adresa IP. Jurnalul este vizibil doar administratorilor și nu poate
fi modificat din aplicație.

## Date trimise în afara aplicației

Singurul serviciu extern folosit este cel de email (SMTP). Prin el trec:

- emailul de resetare a parolei (prenumele și linkul de resetare);
- notificările imediate (task atribuit, cereri de predare a unui client), cu text general: fără
  titluri de task-uri, nume de clienți sau nume de colegi;
- rezumatul zilnic de notificări, care conține **doar numere** (câte task-uri restante, cu termen
  azi sau în zilele următoare). Titlurile task-urilor, numele clienților și orice date despre
  angajați rămân în aplicație.

Reamintirile pentru un task al cărui responsabil are contul dezactivat ajung la responsabilii
activi ai clientului sau, în lipsa lor, la administratori – adică doar la persoane care au deja
acces la acel task.

Sesiunile și linkurile de resetare expirate sunt șterse automat, la fel și notificările citite mai
vechi de 90 de zile.

## Secrete și configurare

- Toate secretele vin din variabile de mediu; nimic sensibil nu este în cod sau în Git
  (`.env*` este ignorat, cu excepția `.env.example`).
- Configurația este validată la pornire; API-ul refuză să pornească în producție fără HTTPS, iar
  worker-ul fără SMTP.
- În producție, PostgreSQL și Redis nu sunt expuse în afara rețelei interne Docker.

## Rămâne de făcut

| Subiect                                                                                        | Etapă        |
| ---------------------------------------------------------------------------------------------- | ------------ |
| Validarea structurii template-urilor DOCX (la încărcarea template-urilor)                      | 4            |
| Scanare antivirus a fișierelor încărcate (opțional; acum se verifică doar tipul și conținutul) | de discutat  |
| Copia backup-urilor în afara serverului (backup-ul zilnic și testul de restaurare există)      | la instalare |
| Politică de retenție a datelor personale (se stabilește împreună cu firma)                     | 5            |
| CSP fără `'unsafe-inline'` pentru scripturi (hash-uri)                                         | 5            |
| Autentificare în doi pași (opțional, dacă se dorește)                                          | de discutat  |
