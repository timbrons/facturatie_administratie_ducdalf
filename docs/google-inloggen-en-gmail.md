# Google: inloggen en Gmail-koppeling

De app gebruikt Google op twee manieren, met **één** Google Cloud-project en **één** OAuth Client:

- **A. Inloggen** in de app (via PocketBase, fase 1). Alleen accounts uit de allowlist op de NAS komen erin.
- **B. Mail versturen** vanuit `ducdalf.languedoc@gmail.com` via de Gmail API (fase 3). Dat gebeurt
  rechtstreeks vanuit de browser. Het toegangstoken blijft alleen in het geheugen van de browser.

Er komen **geen wachtwoorden, client secrets of refresh tokens** in de code of de repository.
Het client secret en (bij de vaste koppeling) de blijvende sleutel staan alleen in PocketBase op de NAS.

---

## Stap 1: Google Cloud-project

1. Ga naar <https://console.cloud.google.com> en log in met **ducdalf.languedoc@gmail.com**.
2. Bovenin: projectkiezer → **Nieuw project** → naam `ducdalf-verhuurbeheer` → **Maken**.
3. Selecteer het nieuwe project.

## Stap 2: Gmail API en Google Drive API aanzetten

1. Menu → **API's en services → Bibliotheek**.
2. Zoek **Gmail API** → **Inschakelen**.
3. Zoek **Google Drive API** → **Inschakelen** (voor de kopie van facturen in Drive, fase 4).

## Stap 3: OAuth-toestemmingsscherm

1. Menu → **API's en services → OAuth-toestemmingsscherm** (in nieuwere versies:
   **Google Auth Platform → Branding / Doelgroep / Gegevenstoegang**).
2. User type: **Extern** → Maken.
3. App-naam: `Duc'dalf verhuurbeheer`, ondersteuningsmail en contactmail: `ducdalf.languedoc@gmail.com`.
4. **Bereiken (scopes / gegevenstoegang)**: voeg toe:
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (inloggen)
   - `https://www.googleapis.com/auth/gmail.send` (mail versturen, fase 3)
   - `https://www.googleapis.com/auth/gmail.readonly` (reacties van huurders op mails uit de app
     lezen en bij de boeking tonen)
   - `https://www.googleapis.com/auth/drive.file` (kopieën in Google Drive; de app ziet alleen de
     bestanden die hij zelf maakt, fase 4)
   - `https://www.googleapis.com/auth/calendar.events` (eigen verblijven in Google Agenda tonen,
     toevoegen en wijzigen vanuit de kalender van de app)
5. **Testgebruikers (doelgroep)**: voeg `ducdalf.languedoc@gmail.com` toe, plus eventuele andere
   accounts die mogen inloggen.
6. Laat de publicatiestatus op **Testen** staan. Dat is voor jullie gebruik genoeg. Google toont
   bij het inloggen een melding "Google heeft deze app niet geverifieerd": klik op
   **Doorgaan**. Dat is normaal voor een app in testmodus.

## Stap 4: OAuth Client ID

1. Menu → **API's en services → Inloggegevens → Inloggegevens maken → OAuth-client-ID**.
2. Type applicatie: **Webapplicatie**. Naam: `Duc'dalf app`.
3. **Geautoriseerde JavaScript-bronnen** (origins):
   - `https://timbrons.github.io`
   - `http://localhost:5173` (alleen voor lokaal ontwikkelen)
   - later eventueel `https://api.vakantiehuis-ducdalf.nl` (als de app vanaf de NAS draait)
4. **Geautoriseerde omleidings-URI's** (redirect URIs):
   - `https://api.vakantiehuis-ducdalf.nl/api/oauth2-redirect`
5. **Maken**. Je krijgt een **Client-ID** (`...apps.googleusercontent.com`) en een **Clientgeheim**.

## Stap 5: Invullen

| Waarde | Waar | Geheim? |
|---|---|---|
| Client-ID | PocketBase → Collections → users → Options → OAuth2 → Google | Nee |
| Clientgeheim | idem (alleen in PocketBase op de NAS) | **Ja** |
| Client-ID | GitHub → Settings → Secrets and variables → Actions → **Variables** → `VITE_GOOGLE_CLIENT_ID` (fase 3) | Nee |

## Google in de app gebruiken (Gmail en Drive)

Mails, Drive-kopieën en aanmeldingen lopen altijd via het afzenderaccount (Instellingen → afzender
e-mail), ook als iemand met een eigen account in de app is ingelogd.

### Vaste koppeling (aanbevolen)

1. **Google Cloud**: Google Auth Platform → **Doelgroep** → Publicatiestatus → **App publiceren**
   (In productie). Een beoordeling door Google aanvragen is voor eigen gebruik niet nodig. In de
   status "Testen" laat Google de blijvende sleutel na 7 dagen verlopen.
2. **NAS**: werk de map `backend` bij en start het project opnieuw (installatiehandleiding,
   hoofdstuk 7). Dat voegt de collectie `google_koppeling` en de routes toe.
3. **App**: Instellingen → **Google-account (Gmail en Drive)** → **Google-account koppelen**. Kies in
   het Google-venster het afzenderaccount, klik bij "Google heeft deze app niet geverifieerd" op
   **Geavanceerd → Doorgaan** en vink alle rechten aan.

Daarna geeft de NAS iedere ingelogde gebruiker automatisch een kortlevende sleutel (± 1 uur) voor het
afzenderaccount: in elke browser, op elk apparaat en na het wissen van cookies, zonder
Google-venster. De blijvende sleutel (refresh token) staat alleen op de NAS, in een collectie zonder
API-toegang; hij komt nooit in de browser of in de repository. Let op: de back-ups van de NAS bevatten
die sleutel dus ook. **Koppeling verbreken** (zelfde plek) trekt de sleutel in bij Google en wist hem.

### Eigen verblijven uit Google Agenda

De kalender van de app toont ook de eigen verblijven uit Google Agenda (groen), en waarschuwt als een
boeking daarmee botst. Met **+ Eigen verblijf** voeg je er een toe; klik op een groene dag om hem te
wijzigen of te verwijderen. De app zet ze in Google Agenda als afspraak voor hele dagen, van de
aankomstdag tot en met de vertrekdag (zoals je het huis in je agenda blokkeert); in de app is de
vertrekdag vrij, net als bij boekingen. Huurders komen alleen uit de app (Nieuwe boeking), niet uit de
agenda. Instellen bij **Instellingen → Google Agenda (eigen verblijven)**: welke agenda
(`primary` = de hoofdagenda) en eventueel welke woorden in de titel staan (bijv. `eigen, familie`).
Leeg = alle afspraken van minstens één nacht; afspraken die de app zelf maakte tellen altijd mee, en
afspraken met precies dezelfde periode als een boeking worden overgeslagen. Zet bij **Gezinnen voor een eigen verblijf** één gezin per regel; bij een eigen verblijf kies je dan
voor wie het is. Het gezin komt in de titel van de afspraak (bijv. "Eigen verblijf – Gezin A") en elk
gezin krijgt een eigen kleur in Google Agenda. Was Google al gekoppeld vóór deze functie, klik dan bij Google-account op
**Opnieuw koppelen** en vink ook Google Agenda aan (en voeg in Google Cloud bij Data Access de scope
`calendar.events` toe).

### Zonder vaste koppeling (reserve)

Is er geen vaste koppeling, dan vraagt de app bij de eerste actie die Google nodig heeft (mail
versturen, factuur naar Drive, aanmeldingen ophalen) een sleutel via een Google-venster. Die staat
alleen in het geheugen van de browser en is ± 1 uur geldig. Kies het afzenderaccount; een ander
account wordt geweigerd.

> Vervolgmails aan dezelfde huurder komen in dezelfde Gmail-thread. Bij de huurder groepeert Gmail
> mails op onderwerp; met een ander onderwerp kan de mail daar als nieuw gesprek verschijnen.

> **Reacties van huurders** verschijnen bij de boeking onder **E-mails**. De app leest daarvoor het
> Gmail-gesprek van elke mail die vanuit die boeking is verstuurd en toont de berichten die er niet
> via de app in zijn gekomen: het antwoord van de huurder, of een antwoord dat je zelf rechtstreeks
> in Gmail schreef. Er wordt niets opgeslagen; Gmail blijft de bron. Een mail die de huurder als
> nieuw bericht stuurt (niet als antwoord), zit niet in het gesprek en verschijnt dus niet.

## Testen

1. Open de app op GitHub Pages → **Inloggen met Google**.
2. Er opent een pop-up van Google. Kies `ducdalf.languedoc@gmail.com` en klik door de melding
   "niet geverifieerd" heen.
3. Je komt in het overzicht. Een ander Google-account krijgt de melding
   "Dit account heeft geen toegang tot het verhuurbeheer".

**Werkt de pop-up niet?** Sta pop-ups toe voor de site. Krijg je `redirect_uri_mismatch`? Controleer dan
of de omleidings-URI exact `https://api.vakantiehuis-ducdalf.nl/api/oauth2-redirect` is en of in
PocketBase de Application URL op `https://api.vakantiehuis-ducdalf.nl` staat.

## Een extra persoon toegang geven

Iemand kan ook met een eigen Google-account inloggen, bijvoorbeeld `naam@gmail.com`:

1. **NAS**: zet het adres in `.env` achter `DUCDALF_ALLOWED_EMAILS`, gescheiden door een komma:
   `DUCDALF_ALLOWED_EMAILS=ducdalf.languedoc@gmail.com,naam@gmail.com`. Container Manager →
   Project `ducdalf` → **Stoppen** en daarna **Bouwen** (alleen herstarten leest `.env` niet opnieuw in).
2. **Google Cloud**: Google Auth Platform → **Doelgroep** → Testgebruikers → **Add users** → het adres.

Mails, Drive-kopieën en aanmeldingen lopen via het afzenderaccount. Met de vaste koppeling hoeft de
extra persoon daar niets voor te doen.
