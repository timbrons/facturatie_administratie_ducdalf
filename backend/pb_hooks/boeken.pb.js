/// <reference path="../pb_data/types.d.ts" />

// Openbare routes voor het boekingsformulier (zie boeken.js).
// Beperkt door de rate limits uit migratie 1761100000_boeken.js.

// Bezette periodes (alleen datums) en de regels voor het formulier.
routerAdd("GET", "/api/ducdalf/boeken/beschikbaarheid", (e) => {
  const boeken = require(`${__hooks}/boeken.js`)
  return e.json(200, { bezet: boeken.bezet(e.app), regels: boeken.regels(e.app) })
})

routerAdd("POST", "/api/ducdalf/boeken", (e) => {
  const boeken = require(`${__hooks}/boeken.js`)
  const invoer = e.requestInfo().body || {}

  // Spamwering zoals bij het aanmeldformulier: robots krijgen een gewoon
  // "gelukt" terug, er wordt niets bewaard.
  if (String(invoer.website || "") !== "" || !(Number(invoer.invultijd) >= 4000)) {
    return e.json(200, { ok: true })
  }

  const c = boeken.controleer(invoer, boeken.regels(e.app), boeken.bezet(e.app))
  if (c.fouten) return e.json(400, { message: "Niet alle gegevens zijn goed ingevuld.", fouten: c.fouten })

  let boeking = null
  e.app.runInTransaction((tx) => {
    boeking = boeken.maakBoeking(tx, c.velden)
  })

  // De melding mag de aanvraag nooit laten mislukken.
  try {
    const fout = boeken.stuurMelding(e.app, c.velden, boeking.id, e.request.header.get("Origin"))
    if (fout) e.app.logger().warn("Melding boekingsaanvraag niet verstuurd", "reden", fout)
  } catch (err) {
    e.app.logger().warn("Melding boekingsaanvraag niet verstuurd", "fout", String(err))
  }
  return e.json(200, { ok: true })
})
