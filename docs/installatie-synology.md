# Installatie op de Synology NAS

Deze handleiding zet de backend van het verhuurbeheer op je **Synology DS220+** (DSM 7.2 of nieuwer).
De backend is **PocketBase**: database, inloggen, bestandsopslag en beheerscherm in één programma.
Via een **Cloudflare Tunnel** wordt die veilig bereikbaar op `https://api.vakantiehuis-ducdalf.nl`,
**zonder dat je poorten op je router openzet**.

```
Browser (GitHub Pages-app)  ──https──▶  Cloudflare  ──tunnel──▶  cloudflared (NAS)  ──▶  PocketBase (NAS)
```

> **Over je NAS:** de DS220+ heeft een Intel Celeron J4025 (x86_64 / `amd64`). Het PocketBase-image
> wordt voor die architectuur gebouwd; de download wordt met een vaste SHA-256-checksum gecontroleerd.

Reken op ongeveer een uur voor de eerste installatie.

---

## 0. Wat je nodig hebt

- Toegang tot DSM als beheerder.
- **Container Manager** (Package Center → zoek "Container Manager" → Installeren).
- Je Cloudflare-account waar `vakantiehuis-ducdalf.nl` al in staat (dat is zo: je website loopt al via een tunnel).
- Het Google-account `ducdalf.languedoc@gmail.com`.
- De bestanden uit deze repository (via GitHub: **Code → Download ZIP**).

---

## 1. Mappen aanmaken op de NAS

1. Open **File Station**.
2. Ga naar de gedeelde map `docker` (bestaat die niet, maak hem aan via Configuratiescherm → Gedeelde map).
3. Maak de map `ducdalf` aan, met daarin:
   - `pb_data` (leeg; hier komt de database)
   - `pb_public` (leeg; voor later)
4. Pak de ZIP van de repository uit op je computer en upload naar `/volume1/docker/ducdalf/`:
   - de hele map **`backend`** (met `Dockerfile`, `pb_migrations` en `pb_hooks`; **niet** een eventuele `pb_data`)
   - het bestand **`deploy/synology/docker-compose.yml`**, direct in `ducdalf/` (dus niet in een submap).

   > ⚠️ Gebruik **niet** het bestand `docker-compose.dev.yml` uit de hoofdmap van de repository. Dat
   > is alleen voor lokaal ontwikkelen. Herken het goede bestand aan de twee diensten `pocketbase` én
   > `cloudflared` en aan de regel `- ./pb_data:/pb/pb_data`.

Het resultaat:

```
/volume1/docker/ducdalf/
├── docker-compose.yml
├── .env                (maak je in stap 3)
├── backend/
│   ├── Dockerfile
│   ├── pb_migrations/
│   └── pb_hooks/
├── pb_data/
└── pb_public/
```

---

## 2. Cloudflare Tunnel aanmaken

Je website gebruikt al een tunnel naar je thuisserver. Voor de NAS maken we een **aparte tunnel**,
zodat de website en het verhuurbeheer elkaar niet beïnvloeden.

1. Log in op <https://one.dash.cloudflare.com> → **Networks → Tunnels** → **Create a tunnel**.
2. Kies **Cloudflared**, geef de naam `ducdalf-nas` en klik **Save tunnel**.
3. Kies bij "Choose your environment" voor **Docker**. Je ziet een commando met
   `--token eyJ...`. **Kopieer alleen het lange token** (alles na `--token `). Dit is geheim.
4. Klik **Next** naar "Route traffic" (Public Hostnames) en vul in:
   - Subdomain: `api`
   - Domain: `vakantiehuis-ducdalf.nl`
   - Service type: `HTTP`
   - URL: `pocketbase:8090`
5. **Save tunnel**. Cloudflare maakt zelf het DNS-record `api.vakantiehuis-ducdalf.nl` aan.

> Het domein staat bij Mijn.host geregistreerd, maar de nameservers wijzen al naar Cloudflare
> (anders zou je huidige tunnel niet werken). Je hoeft bij Mijn.host niets te veranderen.

**Extra beveiliging:** het beheerscherm van PocketBase kun je achter een extra Cloudflare-login
zetten (Cloudflare Access). Dat staat in stap 5b uitgelegd.

---

## 3. Het `.env`-bestand

Maak op je computer een tekstbestand `.env` (met de punt vooraan) met deze inhoud en upload het naar
`/volume1/docker/ducdalf/`:

```
TUNNEL_TOKEN=plak-hier-het-token-uit-stap-2
DUCDALF_ALLOWED_EMAILS=ducdalf.languedoc@gmail.com
PB_ORIGINS=https://timbrons.github.io
```

- `DUCDALF_ALLOWED_EMAILS`: alleen deze Google-accounts kunnen inloggen. Meer accounts? Scheid met komma's.
- Dit bestand bevat een geheim en komt **nooit** in de repository.

---

## 4. Project starten in Container Manager

1. Open **Container Manager → Project → Maken**.
2. Projectnaam: `ducdalf`. Pad: `/docker/ducdalf`. Kies **"Bestaand docker-compose.yml gebruiken"**.
3. Klik door (Web Station-portal niet nodig) en **Gereed**. Container Manager bouwt nu het
   PocketBase-image (download ± 15 MB) en start beide containers.
4. Controleer onder **Container** dat `ducdalf-pocketbase` en `ducdalf-cloudflared` op *Actief* staan.
   In het logboek van `ducdalf-pocketbase` zie je `Server started at http://0.0.0.0:8090`.
5. In Cloudflare (Networks → Tunnels) staat de tunnel nu op **Healthy**.

Bij de eerste start worden de **migraties automatisch toegepast**: alle tabellen, toegangsregels en
standaardwaarden (workflow, seizoenen 2026, extra's, tarieven toeristenbelasting) worden aangemaakt.

---

## 5. Eerste keer instellen

### 5a. Beheerdersaccount (superuser)

We maken het account aan met de **Taakplanner** van DSM. Dat werkt betrouwbaarder dan de terminal
van Container Manager.

1. **Configuratiescherm → Taakplanner → Maken → Geplande taak → Door gebruiker gedefinieerd script**.
2. Tabblad **Algemeen**: taak `PocketBase beheerder`, gebruiker **root**. Haal het vinkje bij
   "Ingeschakeld" weg (de taak hoeft maar één keer te draaien).
3. Tabblad **Taakinstellingen** → bij "Door gebruiker gedefinieerd script" (vervang e-mail en
   wachtwoord; gebruik voor het wachtwoord alleen letters en cijfers, minimaal 16 tekens):
   ```
   /usr/local/bin/docker exec ducdalf-pocketbase /pb/pocketbase superuser upsert jouw@email.nl EenHeelSterkWachtwoord2026 > /volume1/docker/ducdalf/superuser.txt 2>&1
   ```
4. **OK**. Selecteer de taak en klik op **Uitvoeren** (bevestig met Ja).
5. Open in File Station `/docker/ducdalf/superuser.txt`. Daarin staat
   `Successfully saved superuser "jouw@email.nl"!`.
6. Verwijder daarna de taak in de Taakplanner (er staat een wachtwoord in) en het bestand
   `superuser.txt`.
7. Open <https://api.vakantiehuis-ducdalf.nl/_/> en log in.

> Staat er in `superuser.txt` "No such container"? Kijk in Container Manager → Container hoe de
> PocketBase-container precies heet en pas de naam in het script aan.
>
> Een andere mogelijkheid is de installatielink in het logboek van de container (regel met
> `/_/#/pbinstall/`, met `https://api.vakantiehuis-ducdalf.nl` in plaats van `http://0.0.0.0:8090`).
> Die werkt alleen binnen 30 minuten na het starten van de container en alleen als je de hele,
> lange link kopieert.

### 5b. Algemene instellingen in PocketBase

In het beheerscherm → **Settings**:

1. **Application**: Application URL = `https://api.vakantiehuis-ducdalf.nl`.
2. **Mail settings (optioneel)**: alleen nodig als je MFA voor het beheerscherm via PocketBase wilt
   (stap 3). De app zelf heeft dit **niet** nodig: inloggen met Google en mailen naar huurders via
   de Gmail-koppeling werken zonder SMTP.
   - Met Gmail heb je een **app-wachtwoord** nodig, en daarvoor moet **2-stapsverificatie** aan staan
     op `ducdalf.languedoc@gmail.com` (<https://myaccount.google.com/apppasswords>). Gebruik nooit het
     gewone Google-wachtwoord: dat geeft de fout `535 5.7.8 Username and Password not accepted`.
   - Vul in: Sender address `ducdalf.languedoc@gmail.com`, host `smtp.gmail.com`, port `587`,
     username het volledige adres, password het app-wachtwoord **zonder spaties**, TLS encryption
     **uit** (bij poort 465: aan). Klik **Send test email**.
   - Wil je geen 2-stapsverificatie op het gedeelde Gmail-account? Sla SMTP en stap 3 dan over en
     beveilig het beheerscherm met **Cloudflare Access** (stap 4 hieronder).
3. **MFA via PocketBase (alleen met werkende SMTP)**: Superusers → (tandwiel) → Options →
   Multi-factor authentication → aan. Daarna log je in met je wachtwoord **én** een eenmalige code per
   e-mail. Zet dit pas aan als de testmail uit stap 2 aankomt, anders sluit je jezelf buiten.
4. **Cloudflare Access voor het beheerscherm (aanbevolen, zeker zonder SMTP)**: zie hieronder.

#### Beheerscherm afschermen met Cloudflare Access

Cloudflare vraagt dan vóór het PocketBase-beheerscherm om een eenmalige code, die Cloudflare zelf
mailt naar een adres dat jij toestaat. Dat kan gewoon het gedeelde adres `ducdalf.languedoc@gmail.com`
zijn (iedereen met toegang tot die inbox kan dan inloggen); een persoonlijk adres van wie de
technische kant beheert mag er ook bij. Er hoeft niets ingesteld te worden op het Gmail-account.

1. <https://one.dash.cloudflare.com> → **Access → Applications → Add an application → Self-hosted**.
2. Naam `PocketBase beheer`; Application domain: subdomein `api`, domein
   `vakantiehuis-ducdalf.nl`, **path `_/`**. Zet het **niet** op het hele subdomein: de app moet de
   API (`/api/…`) kunnen blijven bereiken.
3. Policy (venster "Policy rules / Policy details"): Policy Name `Familie`, Action **Allow**. Links bij
   Include → **Emails**: typ de adressen die de code mogen ontvangen, bijv.
   `ducdalf.languedoc@gmail.com` (Enter na elk adres). De overige instellingen
   (MFA, Just-in-time, RDP) laat je zoals ze staan. **Save policy**.
4. One-time PIN staat niet in de policy maar bij de inlogmethoden:
   - In de applicatie, onderdeel **Login methods** / **Authentication**: zorg dat **One-time PIN**
     is aangevinkt (of "Accept all available identity providers").
   - Staat One-time PIN nergens in de lijst? Ga naar **Settings → Authentication → Login methods →
     Add new → One-time PIN** (geen verdere instellingen nodig) en kies hem daarna in de applicatie.
   Sla de applicatie op.
5. Test: open <https://api.vakantiehuis-ducdalf.nl/_/>. Je krijgt eerst een Cloudflare-scherm; vul het
   toegestane e-mailadres in, voer de code uit die inbox in en log daarna in bij PocketBase.

### 5c. Inloggen met Google instellen

Volg [docs/google-inloggen-en-gmail.md](google-inloggen-en-gmail.md), deel A (OAuth Client voor
inloggen). Vul daarna in PocketBase in:

- **Collections → users → (tandwiel) → Options → OAuth2 → Google**: Client ID en Client secret.
- Het client secret staat daarmee alleen op de NAS, nooit in de repository.

### 5d. Gegevens in de app

Log in op de app (GitHub Pages-adres) met het Google-account en vul onder **Instellingen** in:
afzender, bankgegevens, de brochure (PDF), de foto van het huis en de **factuurnummering**
(laatst uitgegeven nummer voor 2026: `5`, zodat de volgende factuur `2026-006` wordt).

---

## 6. Back-ups

### 6a. Automatisch, door PocketBase zelf

PocketBase maakt **elke nacht om 02:30 (UTC)** een volledige back-up (database + bestanden) als zip in
`pb_data/backups/`. De laatste 14 worden bewaard. Je ziet en downloadt ze in het beheerscherm onder
**Settings → Backups**. Daar kun je ook direct een back-up maken (**Initialize new backup**).

### 6b. Hyper Backup naar een tweede plek

1. Package Center → installeer **Hyper Backup**.
2. **Maken → Gegevensback-uptaak** → kies een doel: een **USB-schijf** of **Synology C2** / andere cloud.
3. Selecteer de map `docker/ducdalf` (dus inclusief `pb_data/backups`).
4. Schema: dagelijks om **04:00** (ná de PocketBase-back-up). Zet "Back-uprotatie" aan.
5. Zet **client-side encryptie** aan (er staan persoonsgegevens in) en bewaar het wachtwoord veilig.

> De zip-bestanden in `pb_data/backups/` zijn altijd consistent. De losse database in `pb_data/`
> kan tijdens het kopiëren in gebruik zijn; zet bij een noodherstel daarom bij voorkeur een
> PocketBase-back-up terug.

### 6c. Terugzetten (en dit één keer testen!)

**Via het beheerscherm (normaal):**

1. Settings → Backups → kies de back-up → **Restore**. PocketBase herstart vanzelf.

**Als PocketBase niet meer start:**

1. Container Manager → Project `ducdalf` → **Stoppen**.
2. Zet in File Station de map `pb_data` opzij (hernoem naar `pb_data_oud`) en maak een nieuwe lege `pb_data`.
3. Pak de gewenste back-up-zip (uit `pb_data_oud/backups/` of uit Hyper Backup) uit **in** de nieuwe `pb_data`.
4. Project **Starten**. Controleer of de app je boekingen weer toont.

**Herstel testen:** doe het eens per jaar op een kopie: zet een back-up terug in een tweede project
(`ducdalf-test`, andere map, zonder cloudflared, met `ports: "8091:8090"`) en kijk via
`http://<ip-van-nas>:8091/_/` of alles erin staat.

### 6d. Export vanuit de app

In fase 4 komt in de app een knop **"Exporteer alles"** (JSON/CSV en PDF's als zip) als extra kopie.

---

## 7. Updaten

### PocketBase of de app-backend (migraties/hooks)

1. Maak eerst een back-up: beheerscherm → Settings → Backups → **Initialize new backup**.
2. Download de nieuwste versie van de repository (ZIP) en vervang op de NAS de map `backend`
   (behalve een eventuele `pb_data`).
3. Container Manager → Project `ducdalf` → **Actie → Bouwen** (bij een nieuwe PocketBase-versie in de
   `Dockerfile`), daarna **Opnieuw starten**. Nieuwe migraties worden automatisch toegepast.
4. Controleer het logboek op fouten en test in de app.

### cloudflared

1. Pas in `docker-compose.yml` de regel `image: cloudflare/cloudflared:2026.9.3` aan naar de nieuwe
   versie (zie <https://hub.docker.com/r/cloudflare/cloudflared/tags>).
2. Project → **Actie → Opnieuw bouwen/Starten**. Controleer in Cloudflare dat de tunnel *Healthy* is.

Gebruik voor beide liever geen `latest`: met een vaste versie weet je precies wat er draait.

---

## 8. Controleren of alles werkt

| Controle | Hoe | Verwacht |
|---|---|---|
| PocketBase draait | Container Manager → `ducdalf-pocketbase` | *Actief*, status *healthy* |
| Tunnel | Cloudflare → Networks → Tunnels | *Healthy* |
| API bereikbaar | Open <https://api.vakantiehuis-ducdalf.nl/api/health> | `{"message":"API is healthy.", ...}` |
| Beheerscherm | <https://api.vakantiehuis-ducdalf.nl/_/> | Inlogscherm |
| App | GitHub Pages-adres → Inloggen met Google | Overzicht met actielijst |
| Back-up | Settings → Backups | Back-up van vannacht aanwezig |

### Foutmelding "Bind mount failed: … does not exist"

Een map die in `docker-compose.yml` staat, bestaat niet op de NAS. Synology maakt die mappen niet
zelf aan.
- Staat er `…/ducdalf/backend/pb_data` in de melding? Dan gebruik je per ongeluk het
  ontwikkelbestand. Vervang `docker-compose.yml` door `deploy/synology/docker-compose.yml` (zie stap 1).
- Staat er `…/ducdalf/pb_data` of `…/ducdalf/pb_public`? Maak die (lege) map aan in File Station.

Verwijder daarna in Container Manager het project (de mappen en bestanden blijven staan) en maak het
opnieuw aan zoals in stap 4. Gebruik daarbij hetzelfde pad.

### "De server is niet bereikbaar" in de app

Werk van achter naar voor:

1. **Staat de NAS aan** en heeft hij internet? (DSM openen.)
2. **Containers actief?** Container Manager → Project `ducdalf`. Zo niet: **Starten** en kijk in het logboek.
3. **Tunnel Healthy?** Zo niet: logboek van `ducdalf-cloudflared`. Vaak een verkeerd of ingetrokken
   `TUNNEL_TOKEN` in `.env`.
4. **`/api/health` werkt, de app niet?** Dan is het meestal CORS: staat `PB_ORIGINS` goed in `.env`
   (`https://timbrons.github.io`, zonder slash op het eind)? Of is de repository-variabele
   `VITE_API_URL` op GitHub verkeerd (zie README)?
5. **Inloggen geweigerd** ("Dit account heeft geen toegang")? Controleer `DUCDALF_ALLOWED_EMAILS`.

De app verliest geen gegevens als de server even weg is: hij toont de laatst geladen gegevens en
meldt dat opslaan niet lukt. Probeer het opnieuw als de server terug is.

### Foutmelding "Only superusers can perform this action." bij Inloggen met Google

Bij de eerste keer inloggen maakt PocketBase zelf de gebruiker aan. In versies van vóór migratie
`1760600000_oauth2_nieuwe_gebruiker.js` mocht dat niet. Werk de map `backend` bij en start het
project opnieuw (zie hoofdstuk 7). Registreren via de API blijft geblokkeerd en alleen adressen uit
`DUCDALF_ALLOWED_EMAILS` komen erin.

### Na Inloggen met Google verschijnt de Cloudflare-code of het superuser-inlogscherm

PocketBase stuurt het inlogvenster na de Google-login standaard door naar het beheerscherm (`/_/`),
dat achter Cloudflare Access staat. Sinds `backend/pb_hooks/oauth2_venster.pb.js` sluit het venster
zonder langs het beheerscherm te gaan. Zie je dit toch, werk dan de map `backend` bij en start het
project opnieuw (hoofdstuk 7).
