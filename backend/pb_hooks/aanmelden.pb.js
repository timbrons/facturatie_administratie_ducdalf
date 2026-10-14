/// <reference path="../pb_data/types.d.ts" />

// Openbare routes voor het eigen aanmeldformulier (zie aanmelden.js).
// Beperkt door de rate limits uit migratie 1761000000_aanmeldingen.js.

// Gegevens om het formulier vooraf in te vullen via de persoonlijke link
// (?boeking=<code>). Alleen datums en aantal personen, geen persoonsgegevens.
routerAdd("GET", "/api/ducdalf/aanmelden/{code}", (e) => {
  const aanmelden = require(`${__hooks}/aanmelden.js`)
  const b = aanmelden.boekingBijCode(e.app, e.request.pathValue("code"))
  if (!b || b.getString("status") === "geannuleerd") {
    return e.json(404, { message: "Deze link is niet (meer) geldig. U kunt het formulier gewoon invullen." })
  }
  const bestaand = b.getString("aanmelding")
  return e.json(200, {
    aankomst: b.getString("aankomst"),
    vertrek: b.getString("vertrek"),
    personen: b.getInt("volwassenen") + b.getInt("kinderen"),
    al_ontvangen: !!bestaand && bestaand !== "null",
  })
})

routerAdd("POST", "/api/ducdalf/aanmelden", (e) => {
  const aanmelden = require(`${__hooks}/aanmelden.js`)
  const invoer = e.requestInfo().body || {}

  // Spamwering: een verborgen veld dat mensen leeg laten, en een minimale
  // invultijd. Robots krijgen een gewoon "gelukt" terug, er wordt niets bewaard.
  if (String(invoer.website || "") !== "" || !(Number(invoer.invultijd) >= 4000)) {
    return e.json(200, { ok: true })
  }

  const c = aanmelden.controleer(invoer)
  if (c.fouten) return e.json(400, { message: "Niet alle gegevens zijn goed ingevuld.", fouten: c.fouten })
  const v = c.velden
  const a = aanmelden.alsAanmelding(v)

  let gekoppeld = false
  let reden = ""
  e.app.runInTransaction((tx) => {
    const k = aanmelden.koppel(tx, v, a)
    const r = new Record(tx.findCollectionByNameOrId("aanmeldingen"))
    r.set("velden", v)
    r.set("naam", (v.voornaam + " " + v.achternaam).trim())
    r.set("email", v.email)
    r.set("aankomst", v.aankomstdatum)
    r.set("vertrek", v.vertrekdatum)
    r.set("boekingscode", v.boekingscode || "")
    r.set("status", k.boeking && !k.handmatig ? "gekoppeld" : "nieuw")
    r.set("toelichting", k.reden || "")
    if (k.boeking) r.set("boeking", k.boeking.id)
    tx.save(r)
    if (k.boeking && !k.handmatig) {
      aanmelden.neemOver(tx, k.boeking, a, r.id, new Date().toISOString())
      gekoppeld = true
    }
    reden = k.reden || ""
  })

  // De melding mag het opslaan nooit laten mislukken.
  try {
    const fout = aanmelden.stuurMelding(e.app, v, gekoppeld, reden, e.request.header.get("Origin"))
    if (fout) e.app.logger().warn("Melding nieuwe aanmelding niet verstuurd", "reden", fout)
  } catch (err) {
    e.app.logger().warn("Melding nieuwe aanmelding niet verstuurd", "fout", String(err))
  }

  return e.json(200, { ok: true })
})
