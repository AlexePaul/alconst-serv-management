# Securitate

Aplicația gestionează date despre companii și date personale ale angajaților acestora. Documentul
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
- **Acces la clienți pe responsabili**: un angajat vede și modifică doar clienții la care este
  responsabil, împreună cu punctele de lucru, angajații și contractele lor. Regula este aplicată
  pe server, la fiecare cerere; pentru clienții altora răspunsul este „nu există”. Doar
  administratorii stabilesc responsabilii și pot șterge definitiv un client.
- **Task-uri și obligații**: un angajat vede ce îi este atribuit, ce a creat el și tot ce ține de
  clienții lui. Un task atribuit unui coleg îi dă acces la task și la datele de contact ale
  clientului (adresă, persoană de contact, telefon), nu și la restul datelor clientului.
- **Predarea unui client**: un angajat își poate preda propriii clienți unui coleg, dar nu poate
  prelua singur clientul altcuiva; administratorii pot transfera între oricare doi utilizatori.
- **Notificări**: fiecare utilizator își vede doar propriile notificări.

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
crearea, modificarea, activarea și dezactivarea conturilor, precum și orice adăugare, modificare
sau ștergere de clienți, responsabili, servicii, puncte de lucru, angajați, contracte, obligații
și task-uri (pentru task-uri, cu valorile vechi și noi – acesta este istoricul lor de modificări). Fiecare intrare conține autorul,
entitatea afectată, momentul și adresa IP. Jurnalul este vizibil doar administratorilor și nu poate
fi modificat din aplicație.

## Date trimise în afara aplicației

Singurul serviciu extern folosit este cel de email (SMTP). Prin el trec:

- emailul de resetare a parolei (prenumele și linkul de resetare);
- rezumatul zilnic de notificări, care conține **doar numere** (câte task-uri restante, cu termen
  azi sau în zilele următoare). Titlurile task-urilor, numele clienților și orice date despre
  angajați rămân în aplicație.

Sesiunile și linkurile de resetare expirate sunt șterse automat, la fel și notificările citite mai
vechi de 90 de zile.

## Secrete și configurare

- Toate secretele vin din variabile de mediu; nimic sensibil nu este în cod sau în Git
  (`.env*` este ignorat, cu excepția `.env.example`).
- Configurația este validată la pornire; API-ul refuză să pornească în producție fără HTTPS, iar
  worker-ul fără SMTP.
- În producție, PostgreSQL și Redis nu sunt expuse în afara rețelei interne Docker.

## Rămâne de făcut

| Subiect                                                                                             | Etapă       |
| --------------------------------------------------------------------------------------------------- | ----------- |
| Acces controlat la documente (URL-uri semnate, cu expirare scurtă; fără URL-uri publice permanente) | 4           |
| Validarea fișierelor încărcate (tip real, dimensiune, structură DOCX)                               | 4           |
| Backup automat al bazei de date și al fișierelor, cu test de restaurare                             | 5           |
| Politică de retenție a datelor personale (se stabilește împreună cu firma)                          | 5           |
| CSP fără `'unsafe-inline'` pentru scripturi (hash-uri)                                              | 5           |
| Autentificare în doi pași (opțional, dacă se dorește)                                               | de discutat |
