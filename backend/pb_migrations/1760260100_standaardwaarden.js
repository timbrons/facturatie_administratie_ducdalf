/// <reference path="../pb_data/types.d.ts" />

// Standaardwaarden: instellingen, workflowstappen, extra's, tarieven 2026
// en beveiligingsinstellingen. Alles is daarna aan te passen in de app.
// Hier staan bewust GEEN persoons-, adres- of bankgegevens: die vul je in
// via het instellingenscherm.

migrate((app) => {
  function nieuw(collectie, data) {
    const record = new Record(app.findCollectionByNameOrId(collectie))
    for (const [k, v] of Object.entries(data)) record.set(k, v)
    app.save(record)
    return record
  }

  // --- Instellingen -----------------------------------------------------
  nieuw("instellingen", {
    accommodatie_naam: "Duc’dalf (Nr. 264 Parc le Duc)",
    schoonmaak_cent: 6400,
    parkkosten_per_nacht_cent: 1000,
    parkkosten_apart_op_factuur: true,
    min_nachten: 7,
    max_personen: 6,
    aanbetaling_pct: 50,
    aanbetaling_termijn_maanden: 1,
    rest_weken_voor_aankomst: 4,
    herinnering_rest_dagen: 7,
    aankomst_vooruit_dagen: 14,
    tb_aangifte_dag: 15,
    tb_portaal_url: "https://grandpicsaintloup.taxesejour.fr",
    aanmeldformulier_url: "https://vakantiehuis-ducdalf.nl/aanmelden/",
    bewaartermijn_jaren: 7,
  })

  // --- Workflow ----------------------------------------------------------
  const stappen = [
    ["aanvraag", "Aanvraag", "", "Er is een aanvraag binnengekomen.", ""],
    ["in_afstemming", "In afstemming", "Afstemming gestart", "We stemmen beschikbaarheid en prijs af met de huurder.", ""],
    ["bevestigd", "Bevestigd", "Huurder heeft toegezegd", "De huurder heeft de boeking bevestigd.", ""],
    ["aanmeldformulier_verstuurd", "Aanmeldformulier verstuurd", "Aanmeldformulier versturen", "De link naar het aanmeldformulier is naar de huurder gestuurd.", ""],
    ["aanmeldformulier_ontvangen", "Aanmeldformulier ontvangen", "Aanmeldformulier ontvangen", "De huurder heeft het aanmeldformulier ingevuld.", ""],
    ["brochure_verstuurd", "Brochure verstuurd", "Brochure versturen", "De informatiebrochure is verstuurd.", ""],
    ["tb_berekend", "Toeristenbelasting berekend", "Toeristenbelasting berekenen", "Het bedrag uit de simulatie in het portaal is vastgelegd.", ""],
    ["factuur_verstuurd", "Factuur verstuurd", "Factuur versturen", "De factuur is verstuurd.", ""],
    ["aanbetaling_ontvangen", "Aanbetaling ontvangen", "Aanbetaling ontvangen", "De aanbetaling is binnen.", "geen_aanbetaling"],
    ["volledig_betaald", "Volledig betaald", "Volledig betaald", "Het volledige bedrag is binnen.", ""],
    ["verblijf", "Verblijf", "Verblijf gestart", "De huurder verblijft in het huis.", ""],
    ["tb_aangegeven", "Toeristenbelasting aangegeven", "Aangifte registreren", "De aangifte toeristenbelasting is ingediend in het portaal.", ""],
    ["afgerond", "Afgerond", "Afronden", "Alles is afgehandeld.", ""],
  ]
  stappen.forEach(([sleutel, label, actie_label, omschrijving, overslaan_als], i) => {
    nieuw("workflow_stappen", {
      sleutel,
      label,
      actie_label,
      omschrijving,
      overslaan_als,
      volgorde: (i + 1) * 10,
      actief: true,
    })
  })

  // --- Extra's (zie website) ---------------------------------------------
  const extras = [
    ["Linnenpakket 1 persoon", "Eén eenpersoons onderlaken, één eenpersoons dekbedovertrek en één kussensloop.", 1600],
    ["Linnenpakket 2 personen", "Twee eenpersoons onderlakens, één tweepersoons dekbedovertrek en twee kussenslopen.", 2500],
    ["Handdoekenpakket", "Twee handdoeken (1× 50×90 en 1× 70×125).", 600],
  ]
  extras.forEach(([naam, omschrijving, prijs_cent], i) => {
    nieuw("extras", { naam, omschrijving, prijs_cent, eenheid: "per_stuk", actief: true, volgorde: i + 1 })
  })

  // --- Seizoenen 2026 (openbare weekprijzen van de website, incl. parkkosten)
  // Een nacht valt in het seizoen waarin hij begint; bij een grensdatum wint
  // het seizoen dat het laatst begint.
  const seizoenen = [
    ["Laagseizoen", "2026-01-01", "2026-04-24", 66500],
    ["Middenseizoen", "2026-04-24", "2026-07-10", 89600],
    ["Hoogseizoen", "2026-07-10", "2026-09-04", 109900],
    ["Middenseizoen", "2026-09-04", "2026-10-16", 89600],
    ["Laagseizoen", "2026-10-16", "2026-12-31", 66500],
  ]
  for (const [naam, van, tot, weekprijs] of seizoenen) {
    nieuw("seizoenen", {
      jaar: 2026,
      naam,
      van,
      tot,
      prijs_per_nacht_cent: Math.round(weekprijs / 7),
      min_nachten: 7,
    })
  }

  // --- Toeristenbelasting 2026 (Grand Pic Saint-Loup, niet-geclassificeerd)
  nieuw("tb_tarieven", {
    geldig_vanaf: "2026-01-01",
    omschrijving: "Grand Pic Saint-Loup 2026, niet-geclassificeerde meublé",
    percentage_bp: 500,
    plafond_cent: 400,
    opslagen: [
      { naam: "Departement Hérault", bp: 1000 },
      { naam: "Regio (Ligne Nouvelle Montpellier-Perpignan)", bp: 3400 },
    ],
    volwassen_vanaf_leeftijd: 18,
  })

  // --- Beveiliging --------------------------------------------------------
  const settings = app.settings()
  settings.meta.appName = "Duc'dalf verhuurbeheer"
  settings.rateLimits.enabled = true
  settings.batch.enabled = false
  // Dagelijkse back-up om 02:30 UTC; de laatste 14 worden bewaard (pb_data/backups).
  settings.backups.cron = "30 2 * * *"
  settings.backups.cronMaxKeep = 14
  app.save(settings)
}, (app) => {
  for (const naam of ["tb_tarieven", "seizoenen", "extras", "workflow_stappen", "instellingen"]) {
    const c = app.findCollectionByNameOrId(naam)
    for (const r of app.findAllRecords(c)) app.delete(r)
  }
})
