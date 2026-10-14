# Duc'dalf verhuurbeheer

Web-app voor de verhuur, facturatie en administratie van vakantiehuis **Duc'dalf**
(huisje 264 op Parc le Duc, Languedoc). Elke boeking doorloopt een workflow van aanvraag tot
afronding. De app laat steeds zien wat de volgende actie is.

- **Frontend**: statische app (React, TypeScript, Vite, Tailwind) op **GitHub Pages**.
- **Backend**: **PocketBase** op de eigen **Synology NAS**, bereikbaar via een Cloudflare Tunnel.
- **Inloggen**: Google, alleen voor e-mailadressen op de allowlist (afgedwongen in de backend).

> ⚠️ **Privacy.** Deze repository is openbaar. Er staan alleen fictieve gegevens in. Echte huurder-,
> adres- en bankgegevens staan uitsluitend in de database op de NAS. De map `referentie/`, `.env`-
> bestanden, exports en `pb_data/` staan in `.gitignore`. `scripts/privacy-check.sh` controleert
> dat bij elke commit (pre-commit hook) en in CI.

## Inhoud

| Map | Wat |
|---|---|
| `frontend/` | De app (React). Kernlogica met tests in `src/domein/`. |
| `backend/` | PocketBase: `Dockerfile`, `pb_migrations/` (schema, API rules, standaardwaarden), `pb_hooks/` (allowlist, workflowbewaking). |
| `deploy/synology/` | `docker-compose.yml` en `.env.example` voor de NAS (PocketBase + cloudflared). |
| `docs/` | [Installatie Synology](docs/installatie-synology.md), [Google-inloggen en Gmail](docs/google-inloggen-en-gmail.md), [Aanmeldformulier](docs/aanmeldformulier.md), [Plan en architectuur](docs/plan.md). |
| `scripts/` | Seed met fictieve testdata en de privacycontrole. |

## Lokaal draaien

Vereist: Docker en Node.js 22.

```bash
# 1. Backend (PocketBase) starten
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec pocketbase /pb/pocketbase superuser upsert admin@example.com 'EenLangWachtwoord123!' --dir=/pb/pb_data

# 2. Fictieve testdata laden (alleen tegen localhost)
node scripts/seed.mjs

# 3. Frontend starten
cd frontend
cp .env.example .env.local      # VITE_API_URL=http://127.0.0.1:8090, VITE_DEV_LOGIN=true
npm install
npm run dev                     # http://localhost:5173
```

Log in met **test@ducdalf.test / testtest123** (de knop "Inloggen (ontwikkeling)" verschijnt alleen
met `VITE_DEV_LOGIN=true`; in de gepubliceerde versie bestaat alleen Google-login).
Het PocketBase-beheerscherm staat op <http://127.0.0.1:8090/_/>.

Tests en controle:

```bash
cd frontend
npm test            # kernlogica: prijzen, seizoenen, toeristenbelasting, nummering, termijnen, workflow
npx tsc -b          # typecheck
../scripts/privacy-check.sh
git config core.hooksPath scripts/git-hooks   # privacycontrole vóór elke commit
```

## Backend op de Synology

Zie **[docs/installatie-synology.md](docs/installatie-synology.md)**: Container Manager, Cloudflare
Tunnel (`api.vakantiehuis-ducdalf.nl`, geen open poorten), eerste start, MFA, back-ups
(PocketBase en Hyper Backup), terugzetten, updaten en storingen oplossen.

## Google-login en Gmail

Zie **[docs/google-inloggen-en-gmail.md](docs/google-inloggen-en-gmail.md)**: Google Cloud-project,
toestemmingsscherm in testmodus en de OAuth Client ID (met `https://timbrons.github.io` als
JavaScript-origin).

## Publicatie via GitHub Pages

Bij elke push naar `main` draait `.github/workflows/ci-pages.yml`: privacycontrole, typecheck, tests,
controle van de PocketBase-migraties, en daarna build en publicatie. Bij een pull request draaien
alleen de controles en de build.

Eenmalig instellen in de repository op GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → tab Variables → New repository variable**:
   - `VITE_API_URL` = `https://api.vakantiehuis-ducdalf.nl`
   - `VITE_GOOGLE_CLIENT_ID` = de Client-ID uit Google Cloud (pas nodig vanaf fase 3)

   Dit zijn geen geheimen: ze komen in de publieke app terecht. De beveiliging zit in de backend.

De app staat daarna op `https://timbrons.github.io/facturatie_administratie_ducdalf/`. Zonder login
ziet een bezoeker alleen het inlogscherm. `robots.txt` en `noindex` houden zoekmachines weg.

**Eigen domein** (bijv. `https://verhuur.vakantiehuis-ducdalf.nl`): de build gebruikt relatieve paden en
werkt dus onder elk adres. Stappen:

1. **Cloudflare → DNS → Add record**: type `CNAME`, naam `verhuur`, doel `timbrons.github.io`, Proxy status
   **DNS only** (grijze wolk).
2. **GitHub → Settings → Pages → Custom domain**: `verhuur.vakantiehuis-ducdalf.nl` → Save. Wacht tot de
   DNS-controle groen is en zet **Enforce HTTPS** aan. Het oude github.io-adres stuurt daarna vanzelf door.
3. **NAS**: in `.env` `PB_ORIGINS=https://timbrons.github.io,https://verhuur.vakantiehuis-ducdalf.nl`, daarna
   in Container Manager het project opschonen en opnieuw bouwen (zodat `.env` opnieuw wordt gelezen).
4. **Google Cloud → Clients → Duc'dalf app → Authorized JavaScript origins**: `https://verhuur.vakantiehuis-ducdalf.nl` toevoegen.

**Later alles op de NAS?** Bouw met `VITE_BASE=/` en `VITE_API_URL=https://api.vakantiehuis-ducdalf.nl`
en zet de inhoud van `frontend/dist/` in de map `pb_public/` op de NAS. PocketBase serveert de app
dan zelf op `https://api.vakantiehuis-ducdalf.nl/`. Voeg dat adres toe aan `PB_ORIGINS` en aan de
JavaScript-origins in Google Cloud.

## Back-up en beheer

- **Automatisch**: PocketBase maakt elke nacht een back-up (laatste 14 bewaard), plus Hyper Backup
  naar een tweede plek. Zie de installatiehandleiding, hoofdstuk 6.
- **Instellingen** in de app: afzender, bank, vaste kosten, termijnen, brochure, huisfoto,
  factuurnummering en de workflowstappen (teksten, volgorde, aan/uit).
- **Prijzen** in de app: seizoenen per jaar (prijs per nacht inclusief parkkosten), extra's
  en de parameters voor de richtberekening van de toeristenbelasting.

## Facturen en betalingen

1. Leg bij de boeking eerst het bedrag uit het portaal voor de toeristenbelasting vast.
2. **Facturen → Factuur maken**: er ontstaat een concept. Bekijk het met "Voorbeeld (PDF)".
3. **Definitief maken**: de factuur krijgt het volgende nummer (`JJJJ-NNN`) en de PDF wordt
   opgeslagen.
4. Stuur de PDF naar de huurder en klik **Markeer als verstuurd**. De factuur is dan vergrendeld.
   Vanaf fase 3 gebeurt dit vanzelf bij het versturen via Gmail.
5. **Betaling registreren** (knop bij de volgende actie of "+ Betaling"). De workflow schuift
   vanzelf door.
6. Iets veranderd, of geannuleerd? **Factuur annuleren**: hij blijft bewaard met zijn nummer maar telt niet meer mee.
   Daarna zo nodig **Nieuwe (gecorrigeerde) factuur**. Een terugbetaling spreek je met de huurder af en registreer
   je als betaling met een negatief bedrag. Bij het annuleren van een boeking gebeurt dit vanzelf.

**Bestaande administratie overnemen**: Instellingen → *Oude administratie importeren*. Download de
Google Sheet als CSV en kies het bestand. Je ziet eerst een voorbeeld; pas na je klik wordt er iets
opgeslagen. Stel vóór de import de afzender- en bankgegevens in.

## E-mail via Gmail

1. Zet de repository-variabele `VITE_GOOGLE_CLIENT_ID` (zie
   [docs/google-inloggen-en-gmail.md](docs/google-inloggen-en-gmail.md)).
2. Koppel eenmalig het afzenderaccount bij **Instellingen → Google-account (Gmail en Drive)**. De
   blijvende sleutel staat alleen op de NAS; daarna werken mailen, Drive en aanmeldingen in elke
   browser zonder Google-venster. Zie [docs/google-inloggen-en-gmail.md](docs/google-inloggen-en-gmail.md).
3. Bij een boeking: **E-mail opstellen**, of de knop bij de volgende actie. Kies of combineer
   sjablonen, pas de preview aan en klik **Versturen**. De mail staat daarna in Gmail onder
   "Verzonden" en in het maillog van de boeking.

Sjablonen beheer je onder **Instellingen → E-mailsjablonen**.

## Aanmeldingen, Google Drive, export en privacy

- **Aanmeldingen** (menu): ingevulde aanmeldformulieren ophalen uit Gmail en na controle overnemen in
  de huurder en de boeking. Zie [docs/aanmeldformulier.md](docs/aanmeldformulier.md), met de kleine
  aanpassing voor de website.
- **Google Drive**: definitieve facturen en bewijsstukken toeristenbelasting komen als kopie in
  `Duc'dalf verhuurbeheer/…` in Google Drive. Aan of uit te zetten onder Instellingen.
- **Instellingen → Export en privacy**:
  - **Exporteer alles** maakt één zip met alle gegevens en bestanden.
  - **AVG**: huurders anonimiseren na de bewaartermijn. Facturen blijven bewaard.

## Rekenregels (kort)

- Bedragen worden als **centen** (gehele getallen) opgeslagen, nooit als zwevendekommagetallen.
- **Huur**: per nacht het tarief van het seizoen waarin die nacht begint. Op een grensdatum geldt het
  nieuwe seizoen. Seizoensprijzen zijn inclusief parkkosten (€ 10 per nacht); op de factuur staan
  huur en parkkosten apart (instelbaar). Een afwijkende huur is mogelijk en wordt zichtbaar gemarkeerd.
- **Toeristenbelasting**: het bedrag uit de simulatie in het portaal van Grand Pic Saint-Loup gaat
  altijd voor. De app rekent ter controle een richtbedrag uit: 5% van de prijs per persoon per nacht,
  afgetopt op € 4,00, plus opslagen van 10% (Hérault) en 34% (regio), elk apart afgerond, maal het
  aantal volwassenen en nachten. Minderjarigen tellen mee als bewoner, maar zijn vrijgesteld.
- **Betaling**: standaard 50% aanbetaling, binnen 1 maand na de factuurdatum. De rest uiterlijk 4 weken
  voor aankomst. Valt de restbetaling al vóór de aanbetaling (boeking kort voor aankomst), dan wordt
  het één termijn van minimaal een week. Alles is instelbaar.
- **Factuurnummers**: `JJJJ-NNN`, doorlopend per jaar.
