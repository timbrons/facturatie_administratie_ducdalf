# Plan en architectuur

## Architectuur

```
┌──────────────────────────────┐        https         ┌────────────┐   tunnel   ┌──────────────────────────────┐
│ GitHub Pages (statisch)      │ ───────────────────▶ │ Cloudflare │ ─────────▶ │ Synology DS220+              │
│ React + TS + Vite + Tailwind │                      └────────────┘            │  ├─ cloudflared              │
│ - hash-routing               │                                                │  └─ PocketBase 0.40.4        │
│ - PDF in de browser (fase 2) │ ── Gmail API (fase 3, token alleen in geheugen) ─▶ Google │     SQLite, bestanden,     │
└──────────────────────────────┘                                                │     auth, back-ups           │
                                                                                └──────────────────────────────┘
```

- **Beveiliging zit in de backend**:
  - Elke collectie heeft API rules die alleen ingelogde `users` toelaten.
  - Een `users`-record kan alleen via Google OAuth2 ontstaan. Een hook weigert elk account buiten
    `DUCDALF_ALLOWED_EMAILS`, ook bij het vernieuwen van het token.
  - Inloggen met wachtwoord en registreren staan uit.
  - Rate limiting staat aan.
- **Configuratie**: publieke waarden (API-URL, Google Client-ID) komen tijdens de build uit
  GitHub-variabelen. Gevoelige gegevens (bank, afzender, tarieven) staan in de database.
- **Onbereikbare NAS**: de app toont een rode balk ("De server is niet bereikbaar"), blijft de laatst
  geladen gegevens tonen en meldt dat opslaan mislukt. Formulieren houden hun invoer vast.

## Datamodel (PocketBase-collecties)

| Collectie | Inhoud |
|---|---|
| `instellingen` | Eén record: afzender, bank, vaste kosten, termijnen, links, brochure (PDF), huisfoto |
| `seizoenen` | jaar, naam, van, t/m, prijs per nacht (incl. parkkosten), min. nachten |
| `extras` | linnen-/handdoekenpakketten enz.: prijs, eenheid (per stuk/nacht/verblijf), actief |
| `tb_tarieven` | parameters richtberekening toeristenbelasting, per ingangsdatum |
| `huurders` | contactgegevens, kenteken, taal; `geanonimiseerd_op` voor de AVG |
| `boekingen` | huurder, periode, personen, kenteken, status, prijsopbouw, betalingsafspraak, toeristenbelasting (portaal, aangifte), aanmelding (ruwe formulierdata), notities, unieke code |
| `statuswijzigingen` | historie van de workflow (wordt door de backend gevuld, alleen-lezen) |
| `workflow_stappen` | statussen, teksten, volgorde, "automatisch overslaan als …", aan/uit |
| `facturen` | nummer, soort (factuur/credit), vastgelegde regels en gegevens, PDF, vergrendeld na verzenden |
| `nummerreeksen` | laatste factuurnummer per jaar |
| `betalingen` | datum, bedrag, soort (aanbetaling/rest/…), gekoppeld aan boeking/factuur |
| `tb_aangiften` | maandaangifte: periode, indiendatum, referentie, bewijsstukken, afgedragen (datum/bedrag) |
| `mail_sjablonen` | per sleutel en taal (nl/en/fr/de): onderwerp, tekst, bijlagen |
| `mail_log` | verstuurde mails per boeking met Gmail message- en thread-ID |

Alle bedragen zijn centen (`*_cent`). Datums zonder tijd zijn tekst `JJJJ-MM-DD`.

## Fasering

1. **Fase 1 – Basis (deze oplevering)**
   - Repository, CI en GitHub Pages-deploy.
   - PocketBase met migraties, API rules en hooks; docker-compose en seed.
   - Synology-handleiding.
   - Inloggen met Google.
   - Boekingen met workflow, stappenbalk en volgende actie, huurders, prijzen en seizoenen.
   - Dashboard met actielijst, bezettingskalender met overlapwaarschuwing, huisstijl.
   - Al meegenomen uit fase 2: invulhulp toeristenbelasting vooraf (simulatiebedrag vastleggen)
     en achteraf (aangifte per maand met bewijsstuk).
2. **Fase 2 – Facturen en betalingen (opgeleverd)**
   - PDF-factuur in de browser, volgens de voorbeeldfactuur.
   - Een factuur is eerst een **concept** zonder nummer. Bij "Definitief maken" kent de backend in
     één transactie het volgende nummer toe. Daarna liggen inhoud en nummer vast.
   - "Markeer als verstuurd" vergrendelt de factuur. Corrigeren gaat met een creditfactuur en
     een nieuwe factuur.
   - Betalingen registreren. De workflow schuift automatisch door naar "Aanbetaling ontvangen" of
     "Volledig betaald".
   - Betaalstatus per factuur: open, deels betaald, betaald, vervallen of gecrediteerd.
   - Bij een boeking kort voor aankomst wordt een aanbetaling automatisch één betaaltermijn, met
     minimaal een week betaaltijd.
   - Financieel overzicht per jaar (huur, schoonmaak, parkkosten, extra's, toeristenbelasting,
     gefactureerd, ontvangen, openstaand), factuurlijst en jaaroverzicht toeristenbelasting
     (geïnd, aangegeven, afgedragen, verschil). Alle overzichten kunnen naar CSV.
   - Import van de bestaande Google Sheet (CSV) met voorbeeldweergave. Oude factuurnummers blijven
     behouden en de nummerreeks schuift mee.
3. **Fase 3 – E-mail**
   - Gmail-koppeling met sjablonen, preview, bijlagen en maillog.
   - Herinneringen in de actielijst.
4. **Fase 4 – Aanmeldformulier, export en back-up, AVG**
   - Koppeling met het aanmeldformulier.
   - "Exporteer alles".
   - Anonimiseren na de bewaartermijn; afronding van de documentatie.
5. **Fase 5 (optioneel)**: aanvragen uit de Gmail-inbox omzetten naar boekingen; meertalige sjablonen.

## Aanmeldformulier (advies voor fase 4)

Het bestaande formulier (`/aanmelden/`) post via **FormSubmit.co** naar `ducdalf.languedoc@gmail.com`.

- **Voorstel**: het formulier blijft zoals het is, met twee kleine aanpassingen.
  - De app stuurt de link mee als `…/aanmelden/?boeking=<code>`.
  - Een verborgen veld `boekingscode` op het formulier wordt met een paar regels JavaScript uit die
    link gevuld.
- In de app leest een knop "Aanmeldingen ophalen" de FormSubmit-mails uit Gmail. Daarvoor is de extra
  scope `gmail.readonly` nodig.
- De app koppelt de mail via de code aan de juiste boeking. Je ziet een voorbeeld en klikt op
  "Overnemen". Naam, adres, telefoon, kenteken en personen komen zo bij de boeking, zonder overtypen.
- **Aantal volwassenen en kinderen** volgt uit de geboortedata van de extra personen. Dat is precies
  wat de toeristenbelasting nodig heeft.
- **AVG**: het formulier vraagt ook om een paspoortnummer en geboortedata. Die bewaart de app alleen
  zolang nodig (anonimiseren na de bewaartermijn). Overweeg of het paspoortnummer echt nodig is.
- **https → http-redirect**: `https://vakantiehuis-ducdalf.nl/aanmelden` (zonder slash) stuurt de
  bezoeker waarschijnlijk door naar `http://…/aanmelden/`. De webserver achter de tunnel denkt dat hij
  via http bereikt wordt en maakt dus een http-doorverwijzing. Oplossingen:
  - Cloudflare → SSL/TLS → Edge Certificates → **Always Use HTTPS** aan.
  - Bij nginx: `absolute_redirect off;` (of `port_in_redirect off;`). Bij Apache: zorg dat `X-Forwarded-Proto`
    wordt gerespecteerd.
  - Link in mails altijd met slash: `https://vakantiehuis-ducdalf.nl/aanmelden/`.

## Openstaande punten

- **Termijn maandaangifte toeristenbelasting**: niet gevonden in openbare bronnen. Het portaal noemt
  een rubriek "Modalités 2026". De app gebruikt nu standaard de **15e van de maand na het verblijf**;
  instelbaar onder Instellingen. Graag controleren in het portaal of via de dienst taxe de séjour
  (04 48 20 05 28, grandpicsaintloup@taxesejour.fr). Vraag dan meteen hoe en wanneer jullie
  **afdragen** (betalen); de app heeft daarvoor per maand "Afgedragen op / bedrag" klaarstaan.
- **Verblijf over een maandgrens**: de app rekent het verblijf nu toe aan de maand van de laatste
  nacht. Als het portaal per maand alleen de nachten in die maand wil, splitsen we dat in fase 2.
