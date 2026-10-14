/// <reference path="../pb_data/types.d.ts" />

// Openbare privacyverklaring van de app, op https://api.vakantiehuis-ducdalf.nl/privacy.
// Google vraagt deze link (Google Auth Platform → Branding) om de app te mogen
// publiceren. Het contactadres komt uit de instellingen (afzender).

routerAdd("GET", "/privacy", (e) => {
  let contact = ""
  try {
    contact = $app.findFirstRecordByFilter("instellingen", "id != ''").getString("afzender_email")
  } catch (_) {}
  const veilig = String(contact).replace(/[^a-zA-Z0-9@._+-]/g, "")
  const mail = veilig ? '<a href="mailto:' + veilig + '">' + veilig + "</a>" : "de beheerder van vakantiehuis Duc'dalf"
  return e.html(
    200,
    `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacyverklaring – Duc'dalf verhuurbeheer</title>
<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#3c362c;background:#faf7ef}h1,h2{font-family:Georgia,serif;font-weight:500}a{color:#8a6a3d}</style>
</head><body>
<h1>Privacyverklaring Duc'dalf verhuurbeheer</h1>
<p>Duc'dalf verhuurbeheer is een interne app van de eigenaren van vakantiehuis Duc'dalf (Parc le Duc, Languedoc). Alleen de eigenaren gebruiken de app, om de verhuur, facturen, betalingen en de toeristenbelasting bij te houden. De app is niet bedoeld voor huurders of andere bezoekers.</p>

<h2>Welke gegevens</h2>
<p>Van huurders: naam, contactgegevens, adres, kenteken, de gegevens van het aanmeldformulier (zoals geboortedata van medereizigers), de boeking, facturen en betalingen. Van de eigenaren: het e-mailadres waarmee zij inloggen.</p>

<h2>Waarvoor</h2>
<p>Uitsluitend voor het afhandelen van de verhuur: boekingen bevestigen, facturen maken en versturen, betalingen bijhouden, de toeristenbelasting aangeven en de wettelijke administratie bewaren.</p>

<h2>Gebruik van Google-gegevens</h2>
<p>De app gebruikt het Google-account van de verhuur alleen om:</p>
<ul>
<li>in te loggen (naam en e-mailadres);</li>
<li>e-mails aan huurders te versturen vanuit dat account (gmail.send);</li>
<li>eigen verblijven in Google Agenda te tonen, toe te voegen en te wijzigen, en de bezette periodes te bepalen (calendar.events);</li>
<li>kopieën van facturen en bewijsstukken in Google Drive te zetten; de app ziet alleen de bestanden die zij zelf heeft gemaakt (drive.file).</li>
</ul>
<p>Gegevens uit Google worden niet verkocht, niet gedeeld met derden, niet gebruikt voor advertenties en niet gebruikt om AI-modellen te trainen. Het gebruik voldoet aan het <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, inclusief de eisen voor beperkt gebruik (Limited Use).</p>

<h2>Opslag en beveiliging</h2>
<p>Alle gegevens staan op een eigen server (NAS) van de eigenaren, bereikbaar via een versleutelde verbinding. Alleen vooraf toegestane accounts kunnen inloggen. De sleutel voor de koppeling met Google staat alleen op die server.</p>

<h2>Bewaartermijn</h2>
<p>Facturen en betalingen worden bewaard zolang de wet dat vereist (7 jaar). Persoonsgegevens van huurders worden daarna geanonimiseerd.</p>

<h2>Je rechten</h2>
<p>Je kunt vragen om inzage, correctie of verwijdering van je gegevens, voor zover de wettelijke bewaarplicht dat toelaat. Je kunt de toegang van de app tot een Google-account altijd intrekken via <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

<h2>Contact</h2>
<p>Vragen over deze verklaring: ${mail}.</p>
</body></html>`,
  )
})
