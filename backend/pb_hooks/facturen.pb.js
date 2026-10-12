/// <reference path="../pb_data/types.d.ts" />

// Facturen: doorlopende nummering per jaar en vergrendeling.
//
//  - Een nieuwe factuur is een concept: geen nummer, niet vergrendeld.
//  - Definitief maken gaat via POST /api/ducdalf/facturen/{id}/nummeren; dat
//    kent in één transactie het volgende nummer uit `nummerreeksen` toe.
//  - Na nummeren liggen de inhoud en het nummer vast; alleen de PDF en de
//    verzendgegevens mogen nog worden toegevoegd.
//  - Een vergrendelde (verstuurde) factuur kan niet meer worden gewijzigd;
//    corrigeren gaat met een creditfactuur.
//  - Geïmporteerde facturen houden hun eigen nummer; de reeks schuift mee.

onRecordCreateRequest((e) => {
  const geimporteerd = e.record.getBool("geimporteerd")
  if (geimporteerd) {
    const m = /^(\d{4})-(\d{3,})$/.exec(e.record.getString("nummer"))
    if (!m) throw new BadRequestError("Een geïmporteerde factuur heeft een nummer nodig in de vorm JJJJ-NNN.")
    e.record.set("vergrendeld", true)
  } else {
    e.record.set("nummer", "")
    e.record.set("vergrendeld", false)
    e.record.set("verstuurd_op", "")
  }
  e.next()

  if (geimporteerd) {
    const m = /^(\d{4})-(\d{3,})$/.exec(e.record.getString("nummer"))
    const jaar = parseInt(m[1], 10)
    const volgnummer = parseInt(m[2], 10)
    let reeks
    try {
      reeks = e.app.findFirstRecordByFilter("nummerreeksen", "jaar = {:jaar}", { jaar })
    } catch (_) {
      reeks = new Record(e.app.findCollectionByNameOrId("nummerreeksen"))
      reeks.set("jaar", jaar)
      reeks.set("laatste", 0)
    }
    if (reeks.getInt("laatste") < volgnummer) {
      reeks.set("laatste", volgnummer)
      e.app.save(reeks)
    }
  }
}, "facturen")

onRecordUpdateRequest((e) => {
  const oud = e.record.original()
  if (oud.getBool("vergrendeld")) {
    // Een verstuurde factuur ligt vast. Alleen de verwijzing naar de kopie in
    // Google Drive mag nog worden vastgelegd.
    const alles = ["boeking", "nummer", "soort", "factuurdatum", "regels", "gegevens", "totaal_cent", "aanbetaling_cent",
      "aanbetaling_vervaldatum", "rest_vervaldatum", "verwijst_naar", "geimporteerd", "pdf", "verstuurd_op", "vergrendeld"]
    for (const veld of alles) {
      if (e.record.getString(veld) !== oud.getString(veld)) {
        throw new BadRequestError("Deze factuur is verstuurd en kan niet meer worden gewijzigd. Maak een creditfactuur.")
      }
    }
    e.next()
    return
  }
  const vast = ["boeking", "soort", "factuurdatum", "regels", "gegevens", "totaal_cent", "aanbetaling_cent",
    "aanbetaling_vervaldatum", "rest_vervaldatum", "verwijst_naar", "geimporteerd"]
  // Het nummer wordt alleen door de nummer-route gezet.
  e.record.set("nummer", oud.getString("nummer"))
  if (oud.getString("nummer")) {
    for (const veld of vast) {
      if (e.record.getString(veld) !== oud.getString(veld)) {
        throw new BadRequestError("De inhoud van een genummerde factuur ligt vast (veld: " + veld + ").")
      }
    }
  } else if (e.record.getBool("vergrendeld")) {
    throw new BadRequestError("Maak de factuur eerst definitief (nummeren) voordat je hem vergrendelt.")
  }
  e.next()
}, "facturen")

routerAdd("POST", "/api/ducdalf/facturen/{id}/nummeren", (e) => {
  const id = e.request.pathValue("id")
  let factuur
  e.app.runInTransaction((tx) => {
    factuur = tx.findRecordById("facturen", id)
    if (factuur.getString("nummer")) return
    const datum = factuur.getString("factuurdatum")
    const jaar = parseInt(datum.slice(0, 4), 10)
    if (!jaar) throw new BadRequestError("De factuur heeft geen geldige factuurdatum.")
    let reeks
    try {
      reeks = tx.findFirstRecordByFilter("nummerreeksen", "jaar = {:jaar}", { jaar })
    } catch (_) {
      reeks = new Record(tx.findCollectionByNameOrId("nummerreeksen"))
      reeks.set("jaar", jaar)
      reeks.set("laatste", 0)
    }
    const volgnummer = reeks.getInt("laatste") + 1
    reeks.set("laatste", volgnummer)
    tx.save(reeks)
    factuur.set("nummer", jaar + "-" + String(volgnummer).padStart(3, "0"))
    // Rechtstreeks opslaan (niet via de API), dus buiten de update-hook om.
    tx.save(factuur)
  })
  return e.json(200, factuur)
}, $apis.requireAuth("users"))
