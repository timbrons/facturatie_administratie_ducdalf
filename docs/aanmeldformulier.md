# Aanmeldformulier koppelen aan boekingen

Het aanmeldformulier op <https://vakantiehuis-ducdalf.nl/aanmelden/> blijft zoals het is: het verstuurt
via FormSubmit een mail naar `ducdalf.languedoc@gmail.com`. De app leest die mails (alleen lezen) en
neemt de gegevens na jouw controle over in de huurder en de boeking. Je hoeft niets meer over te typen.

## Hoe het werkt

1. Bij **Aanmeldformulier versturen** zet de app een link met de boekingscode in de mail, bijv.
   `https://vakantiehuis-ducdalf.nl/aanmelden/?boeking=AbC123…`.
2. De huurder vult het formulier in. FormSubmit mailt de inzending naar de Gmail-inbox.
3. In de app: **Aanmeldingen → Ophalen uit Gmail**. Per inzending zie je:
   - de voorgestelde boeking: op boekingscode, en anders op e-mailadres en datums;
   - de gegevens;
   - het aantal volwassenen en minderjarigen, berekend uit de geboortedata op de aankomstdatum;
   - waarschuwingen als datums of aantallen afwijken van de boeking.
4. Kies wat je wilt overnemen en klik **Overnemen**:
   - adres en contactgegevens gaan naar de huurder;
   - kenteken en aantallen gaan naar de boeking;
   - het volledige formulier wordt bij de boeking bewaard;
   - de status wordt "Aanmeldformulier ontvangen".

De zoekopdracht in Gmail is instelbaar onder Instellingen → Links. Standaard is dat
`from:formsubmit.co aanmelding`.

## Aanpassing op de website (eenmalig)

Zonder deze aanpassing werkt het koppelen ook, op e-mailadres en datums. Met de boekingscode is het
waterdicht. Voeg in `aanmelden/index.html` binnen het `<form>`, naast de andere verborgen velden, toe:

```html
<input type="hidden" name="boekingscode" id="boekingscode" value="" />
```

En onderaan, in het bestaande `<script>`-blok:

```js
// Boekingscode uit de link (?boeking=…) meesturen, zodat de aanmelding bij de juiste boeking komt.
const code = new URLSearchParams(window.location.search).get('boeking');
if (code) document.getElementById('boekingscode').value = code.replace(/[^A-Za-z0-9]/g, '');
```

## https → http-doorverwijzing

`https://vakantiehuis-ducdalf.nl/aanmelden` (zonder slash op het eind) stuurt de bezoeker door naar
`http://…/aanmelden/`. De webserver achter de Cloudflare-tunnel weet niet dat de bezoeker via https
kwam, en verwijst dus door naar http. Oplossingen, het liefst allebei:

- In Cloudflare: **SSL/TLS → Edge Certificates → Always Use HTTPS** aanzetten. Dan wordt elk
  http-verzoek meteen weer https.
- Op de webserver:
  - **nginx**: zet in de `server`-sectie `absolute_redirect off;`;
  - **Apache**: `UseCanonicalName Off` en de doorverwijzing laten werken met
    `X-Forwarded-Proto` (bijv. via `mod_remoteip`).

De app gebruikt zelf altijd de link met `https://` en een slash op het eind.

## Privacy

Het formulier vraagt ook naar het paspoortnummer en geboortedata. Die staan alleen in de database op de
NAS, en de app toont het paspoortnummer afgeschermd (`•••• 567`). Bij het anonimiseren van een huurder
(Instellingen → Export en privacy) worden ze gewist. Overweeg of het paspoortnummer echt nodig is; is
het niet nodig, haal het veld dan van het formulier.
