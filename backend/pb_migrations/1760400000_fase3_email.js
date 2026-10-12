/// <reference path="../pb_data/types.d.ts" />

// Fase 3: e-mail via Gmail. Standaardsjablonen (Nederlands) en het
// Message-ID per verstuurde mail, zodat vervolgmails in dezelfde thread komen.
// Variabelen tussen accolades worden bij het opstellen ingevuld; zie
// frontend/src/domein/sjablonen.ts voor de lijst.

migrate((app) => {
  const log = app.findCollectionByNameOrId("mail_log")
  log.fields.add(new TextField({ name: "message_id", max: 300 }))
  log.fields.add(new TextField({ name: "status_na", max: 50 }))
  app.save(log)

  const c = app.findCollectionByNameOrId("mail_sjablonen")
  const groet = "\n\nMet vriendelijke groet,\n{afzender}"
  const sjablonen = [
    {
      sleutel: "aanmeldformulier",
      naam: "Aanmeldformulier versturen",
      onderwerp: "Je verblijf in Duc'dalf van {aankomst} tot {vertrek}",
      tekst:
        "Beste {voornaam},\n\nWat leuk dat jullie in ons vakantiehuis Duc'dalf op Parc le Duc komen verblijven, van {aankomst} tot {vertrek}!\n\n" +
        "Wil je via onderstaande link het aanmeldformulier invullen? Het park gebruikt onder meer het kenteken voor de slagboom bij de ingang.\n\n{link_aanmeldformulier}" +
        groet,
      bijlagen: [],
    },
    {
      sleutel: "brochure",
      naam: "Informatiebrochure versturen",
      onderwerp: "Informatie over Duc'dalf en Parc le Duc",
      tekst:
        "Beste {voornaam},\n\nIn de bijlage vind je onze informatiebrochure met praktische informatie over het huis, het park en leuke uitjes in de omgeving." +
        groet,
      bijlagen: ["brochure"],
    },
    {
      sleutel: "factuur",
      naam: "Factuur versturen",
      onderwerp: "Factuur {factuurnummer} – verblijf Duc'dalf {aankomst} tot {vertrek}",
      tekst:
        "Beste {voornaam},\n\nIn de bijlage vind je de factuur ({factuurnummer}) voor jullie verblijf van {aankomst} tot {vertrek}. Het totaalbedrag is {bedrag_totaal}.\n\n" +
        "{betaalinstructie}\n\nBetaling graag op {iban} t.n.v. {rekeninghouder}, onder vermelding van het factuurnummer." +
        groet,
      bijlagen: ["factuur"],
    },
    {
      sleutel: "herinnering_aanbetaling",
      naam: "Herinnering aanbetaling",
      onderwerp: "Herinnering aanbetaling factuur {factuurnummer}",
      tekst:
        "Beste {voornaam},\n\nWe hebben de aanbetaling van {bedrag_aanbetaling} voor factuur {factuurnummer} (vervaldatum {vervaldatum_aanbetaling}) nog niet ontvangen. " +
        "Wil je dit bedrag overmaken op {iban} t.n.v. {rekeninghouder}, onder vermelding van het factuurnummer?\n\nHeb je al betaald, dan kun je deze mail als niet verzonden beschouwen." +
        groet,
      bijlagen: [],
    },
    {
      sleutel: "herinnering_rest",
      naam: "Herinnering restbetaling",
      onderwerp: "Herinnering betaling factuur {factuurnummer}",
      tekst:
        "Beste {voornaam},\n\nOver een paar weken is het zover: op {aankomst} komen jullie aan in Duc'dalf! Volgens onze administratie staat er nog {bedrag_open} open; dit bedrag moet uiterlijk {vervaldatum_rest} zijn voldaan. " +
        "Wil je het overmaken op {iban} t.n.v. {rekeninghouder}, onder vermelding van factuur {factuurnummer}?\n\nHeb je al betaald, dan kun je deze mail als niet verzonden beschouwen." +
        groet,
      bijlagen: [],
    },
    {
      sleutel: "bevestiging_betaling",
      naam: "Bevestiging betaling ontvangen",
      onderwerp: "Betaling ontvangen – factuur {factuurnummer}",
      tekst:
        "Beste {voornaam},\n\nBedankt! We hebben je betaling ontvangen. Er staat nu nog {bedrag_open} open." +
        groet,
      bijlagen: [],
    },
    {
      sleutel: "fijne_reis",
      naam: "Fijne reis / praktische info",
      onderwerp: "Bijna op vakantie in Duc'dalf!",
      tekst:
        "Beste {voornaam},\n\nNog even en jullie vertrekken naar Duc'dalf. Een paar praktische punten:\n\n" +
        "- Inchecken kan vanaf 15.00 uur, uitchecken graag vóór 10.00 uur.\n" +
        "- De sleutel en eventuele linnenpakketten haal je op bij de receptie.\n" +
        "- De slagboom opent automatisch op kenteken ({kenteken}); huisje 264 bereik je het makkelijkst via ingang 3.\n\n" +
        "We wensen jullie een goede reis en een heerlijk verblijf!" +
        groet,
      bijlagen: [],
    },
  ]
  for (const s of sjablonen) {
    const r = new Record(c)
    r.set("sleutel", s.sleutel)
    r.set("taal", "nl")
    r.set("naam", s.naam)
    r.set("onderwerp", s.onderwerp)
    r.set("tekst", s.tekst)
    r.set("bijlagen", s.bijlagen)
    app.save(r)
  }
}, (app) => {
  const log = app.findCollectionByNameOrId("mail_log")
  log.fields.removeByName("message_id")
  log.fields.removeByName("status_na")
  app.save(log)
  for (const r of app.findAllRecords("mail_sjablonen")) app.delete(r)
})
