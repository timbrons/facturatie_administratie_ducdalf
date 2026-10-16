/// <reference path="../pb_data/types.d.ts" />

// Facturen: doorlopende nummering per jaar en vergrendeling.
//
//  - Een nieuwe factuur is een concept: geen nummer, niet vergrendeld.
//  - Definitief maken gaat via POST /api/ducdalf/facturen/{id}/nummeren; dat
//    kent in één transactie het volgende nummer uit `nummerreeksen` toe.
//  - Na nummeren liggen de inhoud en het nummer vast; alleen de PDF en de
//    verzendgegevens mogen nog worden toegevoegd.
//  - Een vergrendelde (verstuurde) factuur kan niet meer worden gewijzigd.
//    Wel kan hij worden geannuleerd (geannuleerd_op); daarna kan zo nodig een
//    nieuwe factuur worden gemaakt. Er zijn geen creditfacturen.
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
  if (oud.getString("geannuleerd_op") && e.record.getString("geannuleerd_op") !== oud.getString("geannuleerd_op")) {
    throw new BadRequestError("Een geannuleerde factuur blijft geannuleerd. Maak zo nodig een nieuwe factuur.")
  }
  if (oud.getBool("vergrendeld")) {
    // Een verstuurde factuur ligt vast. Alleen de verwijzing naar de kopie in
    // Google Drive mag nog worden vastgelegd. Bij een geïmporteerde factuur
    // zonder PDF mag eenmalig de originele PDF worden toegevoegd.
    const origineelToevoegen = oud.getBool("geimporteerd") && oud.getString("pdf") === ""
    const alles = ["boeking", "nummer", "soort", "factuurdatum", "regels", "gegevens", "totaal_cent", "aanbetaling_cent",
      "aanbetaling_vervaldatum", "rest_vervaldatum", "verwijst_naar", "geimporteerd", "verstuurd_op", "vergrendeld", "aangepast"]
    if (!origineelToevoegen) alles.push("pdf")
    // Annuleren mag (eenmalig: van leeg naar een datum).
    if (!(oud.getString("geannuleerd_op") === "" && e.record.getString("geannuleerd_op") !== "")) alles.push("geannuleerd_op")
    for (const veld of alles) {
      if (e.record.getString(veld) !== oud.getString(veld)) {
        throw new BadRequestError("Deze factuur is verstuurd en kan niet meer worden gewijzigd. Annuleer hem en maak zo nodig een nieuwe factuur.")
      }
    }
    e.next()
    return
  }
  const vast = ["boeking", "soort", "factuurdatum", "regels", "gegevens", "totaal_cent", "aanbetaling_cent",
    "aanbetaling_vervaldatum", "rest_vervaldatum", "verwijst_naar", "geimporteerd", "aangepast"]
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

// Een factuur verwijderen (vergissing). Alleen als hij nooit is verstuurd en
// er geen betalingen aan hangen. Een genummerde factuur mag alleen weg als het
// het laatste nummer van zijn jaar is: dan schuift de reeks terug en ontstaat
// er geen gat in de doorlopende nummering. Een kopie in Google Drive
// verwijdert de app zelf vóór deze aanroep.
routerAdd("POST", "/api/ducdalf/facturen/{id}/verwijderen", (e) => {
  const id = e.request.pathValue("id")
  e.app.runInTransaction((tx) => {
    const f = tx.findRecordById("facturen", id)
    if (f.getBool("vergrendeld") || f.getString("verstuurd_op")) {
      throw new BadRequestError("Deze factuur is verstuurd en kan niet worden verwijderd. Annuleer hem en maak zo nodig een nieuwe factuur.")
    }
    if (f.getBool("geimporteerd")) throw new BadRequestError("Een overgenomen factuur uit de oude administratie kan niet worden verwijderd.")
    const betalingen = tx.findRecordsByFilter("betalingen", "factuur = {:f}", "", 1, 0, { f: id })
    if (betalingen.length > 0) throw new BadRequestError("Aan deze factuur hangen betalingen. Koppel of verwijder die eerst.")
    const verwijzers = tx.findRecordsByFilter("facturen", "verwijst_naar = {:f}", "", 1, 0, { f: id })
    if (verwijzers.length > 0) throw new BadRequestError("Er verwijst een andere factuur naar deze factuur; verwijder die eerst.")

    const m = /^(\d{4})-(\d{3,})$/.exec(f.getString("nummer"))
    if (m) {
      const jaar = parseInt(m[1], 10)
      const volgnummer = parseInt(m[2], 10)
      let reeks = null
      try {
        reeks = tx.findFirstRecordByFilter("nummerreeksen", "jaar = {:j}", { j: jaar })
      } catch (_) {}
      if (!reeks || reeks.getInt("laatste") !== volgnummer) {
        throw new BadRequestError(
          "Alleen de laatst genummerde factuur van " + jaar + " kan worden verwijderd; anders ontstaat er een gat in de doorlopende factuurnummering. " +
          "Laat deze factuur geannuleerd staan, of verwijder eerst de facturen met een hoger nummer.",
        )
      }
      tx.delete(f)
      const laatste = volgnummer - 1
      reeks.set("laatste", laatste)
      tx.save(reeks)
    } else {
      tx.delete(f)
    }
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))
