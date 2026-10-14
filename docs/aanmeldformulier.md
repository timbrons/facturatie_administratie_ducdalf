# Aanmeldformulier

Het aanmeldformulier hoort bij de app zelf. Er is geen externe formulierdienst meer nodig. Huurders
hoeven niet in te loggen. Wat ze invullen komt rechtstreeks in de database op de NAS, in de collectie
`aanmeldingen`.

- Adres: `https://verhuur.vakantiehuis-ducdalf.nl/aanmelden/`
- De persoonlijke link in de mail **Aanmeldformulier** is hetzelfde adres met `?boeking=<code>` erachter.
  Daarmee staan de datums en het aantal personen alvast ingevuld.

## Hoe het werkt

1. Bij **Aanmeldformulier versturen** zet de app de persoonlijke link in de mail.
   - De link wijst naar het formulier van de app als **Instellingen → Links → Aanmeldformulier** leeg is.
   - Bij de update is het oude adres van de website daar automatisch weggehaald.
2. De huurder vult het formulier in.
   - Bij een gekozen aantal personen verschijnen precies zoveel blokken voor meereizenden.
   - Van iedereen zijn de naam en de geboortedatum verplicht; daarmee rekent de app het aantal
     minderjarigen voor de toeristenbelasting uit.
   - Het formulier controleert alles al tijdens het invullen. De server controleert het daarna nog een keer.
3. De server verwerkt de inzending:
   - **Automatisch**, als de boekingscode klopt en alles overeenkomt met de boeking: dezelfde datums,
     hetzelfde aantal volwassenen en minderjarigen, de boeking is niet geannuleerd en er is nog geen
     formulier ontvangen. Dan gebeurt hetzelfde als bij **Overnemen**:
     - de huurdergegevens en het kenteken worden bijgewerkt;
     - het formulier wordt bij de boeking bewaard;
     - de status wordt "Aanmeldformulier ontvangen".
   - **Anders** komt de inzending onder **Aanmeldingen → Te controleren** te staan en bij **Acties** op het
     overzicht. Je ziet daar waarom het niet automatisch ging. Je kiest de boeking, vinkt aan wat je wilt
     overnemen en klikt **Overnemen**. Spam of een dubbele inzending haal je weg met **Verwijderen**.
4. Je krijgt een korte melding per e-mail op het afzenderadres, via de vaste Google-koppeling. De
   melding gaat alleen naar jullie zelf en nooit naar de huurder. Ze bevat de naam, de datums en een
   link naar de app. Het paspoortnummer en de geboortedata staan er niet in.

## Spam en misbruik

- Er is een verborgen veld waar robots wel en mensen niet in typen, en een minimale invultijd. Een
  inzending die daarop afvalt, krijgt een gewoon "gelukt" te zien, maar wordt niet bewaard.
- Per internetverbinding kunnen maximaal 10 formulieren per 10 minuten worden verstuurd.
- De link met `?boeking=` geeft alleen de datums en het aantal personen terug, geen persoonsgegevens. De
  code is 16 willekeurige tekens en is dus niet te raden.

## Website

Laat de knop of pagina **Aanmelden** op de website naar het nieuwe formulier wijzen. Wil je dat oude
links (`https://vakantiehuis-ducdalf.nl/aanmelden/?boeking=…`) blijven werken? Vervang dan de inhoud van
`aanmelden/index.html` op de website door een doorverwijzing die de boekingscode meeneemt:

```html
<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Aanmelden — Duc'dalf</title>
<script>location.replace('https://verhuur.vakantiehuis-ducdalf.nl/aanmelden/' + location.search);</script>
</head><body><a href="https://verhuur.vakantiehuis-ducdalf.nl/aanmelden/">Naar het aanmeldformulier</a></body></html>
```

## Het oude formulier (FormSubmit)

Inzendingen die nog via FormSubmit in Gmail staan, haal je op onder **Aanmeldingen → Toon inzendingen van
het oude formulier**. Ze worden op dezelfde manier overgenomen. De zoekopdracht in Gmail stel je in bij
Instellingen → Links. Standaard is dat `from:formsubmit.co aanmelding`.

## Privacy

Het formulier vraagt ook naar het paspoortnummer en geboortedata. Die staan alleen in de database op de
NAS, en de app toont het paspoortnummer afgeschermd (`•••• 567`).

- Bij het anonimiseren van een huurder (Instellingen → Export en privacy) worden ze gewist, inclusief
  de ingevulde formulieren.
- Bij het volledig verwijderen van een huurder verdwijnen de formulieren met de boeking.
