# Google: inloggen en Gmail-koppeling

De app gebruikt Google op twee manieren, met **één** Google Cloud-project en **één** OAuth Client:

- **A. Inloggen** in de app (via PocketBase, fase 1). Alleen accounts uit de allowlist op de NAS komen erin.
- **B. Mail versturen** vanuit `ducdalf.languedoc@gmail.com` via de Gmail API (fase 3). Dat gebeurt
  rechtstreeks vanuit de browser. Het toegangstoken blijft alleen in het geheugen van de browser.

Er komen **geen wachtwoorden, client secrets of refresh tokens** in de code of de repository.
Het client secret (nodig voor A) staat alleen in PocketBase op de NAS.

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
   - `https://www.googleapis.com/auth/gmail.readonly` (inzendingen van het aanmeldformulier lezen, fase 4)
   - `https://www.googleapis.com/auth/drive.file` (kopieën in Google Drive; de app ziet alleen de
     bestanden die hij zelf maakt, fase 4)
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

1. Zet `VITE_GOOGLE_CLIENT_ID` als repository-variabele (zie de tabel hierboven) en publiceer opnieuw.
2. **Inloggen met Google** vraagt meteen ook de rechten voor Gmail en Drive. Vink bij de eerste keer
   **alle gevraagde rechten aan**: mail versturen, mail lezen en de eigen bestanden in Drive. Na het
   inloggen staat onderaan "✓ Google gekoppeld".
3. Het toegangstoken staat alleen in het geheugen van de browser en is ± 1 uur geldig. Is het
   verlopen of heb je de pagina herladen, dan koppelt de app vanzelf opnieuw zodra je iets doet dat
   Google nodig heeft (mail versturen, factuur naar Drive, aanmeldingen ophalen). Er verschijnt dan
   kort een venster van Google dat zichzelf sluit. De knop **Koppel Google** onderaan blijft als
   reserve. Er worden geen tokens opgeslagen.
4. De afzender van de mails is het gekoppelde account. Vul bij Instellingen bij "E-mail" van de
   afzender hetzelfde adres in.

> Vervolgmails aan dezelfde huurder komen in dezelfde Gmail-thread. Bij de huurder groepeert Gmail
> mails op onderwerp; met een ander onderwerp kan de mail daar als nieuw gesprek verschijnen.

## Testen

1. Open de app op GitHub Pages → **Inloggen met Google**.
2. Er opent een pop-up van Google. Kies `ducdalf.languedoc@gmail.com` en klik door de melding
   "niet geverifieerd" heen.
3. Je komt in het overzicht. Een ander Google-account krijgt de melding
   "Dit account heeft geen toegang tot het verhuurbeheer".

**Werkt de pop-up niet?** Sta pop-ups toe voor de site. Krijg je `redirect_uri_mismatch`? Controleer dan
of de omleidings-URI exact `https://api.vakantiehuis-ducdalf.nl/api/oauth2-redirect` is en of in
PocketBase de Application URL op `https://api.vakantiehuis-ducdalf.nl` staat.
