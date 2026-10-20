// Het openbare boekingsformulier (zonder inloggen).
//
// Beschikbaarheid: bezette periodes uit de boekingen én de eigen verblijven in
// Google Agenda (alleen datums, nooit namen). Een aanvraag wordt meteen een
// boeking met status "aanvraag" (bron "website"), met de prijs volgens de
// seizoenen, zoals bij een nieuwe boeking in de app. De rekenregels zijn
// dezelfde als in de app (frontend/src/domein/prijs.ts, toeristenbelasting.ts,
// agenda.ts); de tests in de app controleren die.

const DAG = 24 * 60 * 60 * 1000
const CACHE_SLEUTEL = "ducdalf_agenda_bezet"
const CACHE_DUUR = 5 * 60 * 1000

function vandaag() {
  return new Date().toISOString().slice(0, 10)
}

function plusDagen(d, n) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * DAG).toISOString().slice(0, 10)
}

function dagenTussen(van, tot) {
  return Math.round((Date.parse(tot + "T00:00:00Z") - Date.parse(van + "T00:00:00Z")) / DAG)
}

function isDatum(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + "T00:00:00Z")
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function tekst(v) {
  if (v === null || v === undefined) return ""
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
}

function instellingen(app) {
  return app.findFirstRecordByFilter("instellingen", "id != ''")
}

function overlapt(a, b) {
  return a.aankomst < b.vertrek && b.aankomst < a.vertrek
}

// --- Beschikbaarheid ---------------------------------------------------------

/** Periode van een agenda-afspraak; hele dagen lopen t/m de vertrekdag (zoals in de app). */
function periode(it) {
  if (it.start && it.start.date && it.end && it.end.date) return { aankomst: it.start.date, vertrek: plusDagen(it.end.date, -1) }
  const a = it.start && it.start.dateTime ? String(it.start.dateTime).slice(0, 10) : ""
  const v = it.end && it.end.dateTime ? String(it.end.dateTime).slice(0, 10) : ""
  return a && v ? { aankomst: a, vertrek: v } : null
}

/** Eigen verblijven uit Google Agenda (alleen periodes), kort bewaard in het geheugen. */
function eigenVerblijven(app, boekingen) {
  const inst = instellingen(app)
  if (!inst.getBool("agenda_tonen")) return []
  const cache = app.store().get(CACHE_SLEUTEL)
  if (cache && cache.tot > Date.now()) return cache.periodes

  const google = require(`${__hooks}/google.js`)
  const t = google.token()
  const scope = String((t.body && t.body.scope) || "")
  if (t.status !== 200 || scope.indexOf("calendar") === -1) return []
  const id = inst.getString("agenda_id") || "primary"
  const woorden = inst.getString("agenda_filter").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
  const params = [
    "singleEvents=true",
    "maxResults=2500",
    "timeMin=" + encodeURIComponent(plusDagen(vandaag(), -1) + "T00:00:00Z"),
    "timeMax=" + encodeURIComponent(plusDagen(vandaag(), 800) + "T00:00:00Z"),
  ].join("&")
  const res = $http.send({
    url: "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events?" + params,
    method: "GET",
    headers: { Authorization: "Bearer " + t.body.access_token },
    timeout: 15,
  })
  if (res.statusCode !== 200 || !res.json) {
    app.logger().warn("Google Agenda niet gelezen voor beschikbaarheid", "status", res.statusCode)
    return []
  }
  const uit = []
  for (const it of res.json.items || []) {
    if (it.status === "cancelled") continue
    const p = periode(it)
    if (!p || p.vertrek <= p.aankomst) continue
    const titel = String(it.summary || "").toLowerCase()
    const kenmerk = it.extendedProperties && it.extendedProperties.private ? it.extendedProperties.private.ducdalf : ""
    // Huurboekingen die de app zelf in de agenda zet, staan al in de boekingen.
    if (kenmerk === "boeking") continue
    const vanApp = kenmerk === "eigen-verblijf"
    // Een gezin in een gehuurd (ander) huis op het park houdt ons huis niet bezet.
    if (vanApp && it.extendedProperties.private.ander_huis === "ja") continue
    if (!vanApp && woorden.length && !woorden.some((w) => titel.indexOf(w) !== -1)) continue
    if (!vanApp && boekingen.some((b) => b.aankomst === p.aankomst && b.vertrek === p.vertrek)) continue
    uit.push(p)
  }
  app.store().set(CACHE_SLEUTEL, { tot: Date.now() + CACHE_DUUR, periodes: uit })
  return uit
}

/** Alle bezette periodes vanaf vandaag: boekingen (ook opties) en eigen verblijven. */
function bezet(app) {
  const boekingen = app
    .findRecordsByFilter("boekingen", "status != 'geannuleerd' && vertrek > {:v}", "aankomst", 0, 0, { v: vandaag() })
    .map((b) => ({ aankomst: b.getString("aankomst"), vertrek: b.getString("vertrek") }))
  let eigen = []
  try {
    eigen = eigenVerblijven(app, boekingen)
  } catch (err) {
    app.logger().warn("Google Agenda niet gelezen voor beschikbaarheid", "fout", String(err))
  }
  return boekingen.concat(eigen.filter((p) => p.vertrek > vandaag())).sort((a, b) => (a.aankomst < b.aankomst ? -1 : 1))
}

/** Regels voor het formulier: minimum aantal nachten (ook per seizoen) en maximum aantal personen. */
function regels(app) {
  const inst = instellingen(app)
  const seizoenen = app
    .findRecordsByFilter("seizoenen", "tot >= {:v}", "van", 0, 0, { v: vandaag() })
    .map((s) => ({ van: s.getString("van"), tot: s.getString("tot"), min_nachten: s.getInt("min_nachten") }))
  return { min_nachten: inst.getInt("min_nachten"), max_personen: inst.getInt("max_personen") || 6, seizoenen: seizoenen }
}

/** Het seizoen van een nacht: zoals seizoenVoorNacht() in de app. */
function seizoenVoorNacht(datum, seizoenen) {
  let beste = null
  for (const s of seizoenen) if (s.van <= datum && datum <= s.tot && (!beste || s.van > beste.van)) beste = s
  return beste
}

function minNachten(aankomst, vertrek, r) {
  let min = r.min_nachten || 0
  for (let d = aankomst; d < vertrek; d = plusDagen(d, 1)) {
    const s = seizoenVoorNacht(d, r.seizoenen)
    if (s && s.min_nachten > min) min = s.min_nachten
  }
  return min
}

// --- Controle ---------------------------------------------------------------

function controleer(invoer, r, bezette) {
  const v = {}
  const fouten = {}
  const veld = (naam, label, max, verplicht) => {
    const w = tekst(invoer[naam]).replace(/\s+/g, " ")
    if (!w && verplicht) fouten[naam] = label + " is verplicht."
    else if (w.length > max) fouten[naam] = "Te lang (maximaal " + max + " tekens)."
    v[naam] = w
  }
  veld("voornaam", "Voornaam", 100, true)
  veld("achternaam", "Achternaam", 100, true)
  veld("email", "E-mailadres", 200, true)
  veld("telefoon", "Telefoonnummer", 40, false)
  v.opmerkingen = tekst(invoer.opmerkingen)
  if (v.opmerkingen.length > 3000) fouten.opmerkingen = "Te lang (maximaal 3000 tekens)."
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) fouten.email = "Geen geldig e-mailadres."
  v.email = v.email.toLowerCase()

  v.aankomst = tekst(invoer.aankomst)
  v.vertrek = tekst(invoer.vertrek)
  if (!isDatum(v.aankomst)) fouten.aankomst = "Kies een aankomstdatum."
  else if (v.aankomst < vandaag()) fouten.aankomst = "De aankomstdatum ligt in het verleden."
  if (!isDatum(v.vertrek)) fouten.vertrek = "Kies een vertrekdatum."
  else if (!fouten.aankomst && v.vertrek <= v.aankomst) fouten.vertrek = "De vertrekdatum moet na de aankomstdatum liggen."
  if (!fouten.aankomst && !fouten.vertrek) {
    const min = minNachten(v.aankomst, v.vertrek, r)
    if (dagenTussen(v.aankomst, v.vertrek) < min) fouten.vertrek = "In deze periode verhuren we minimaal " + min + " nachten."
    else if (dagenTussen(v.aankomst, v.vertrek) > 120) fouten.vertrek = "Neem voor een verblijf van meer dan 120 nachten contact met ons op."
    else if (bezette.some((p) => overlapt(v, p))) fouten.aankomst = "Het huis is in (een deel van) deze periode helaas al bezet."
  }

  v.volwassenen = parseInt(invoer.volwassenen, 10)
  v.kinderen = parseInt(invoer.kinderen || 0, 10)
  if (!(v.volwassenen >= 1)) fouten.volwassenen = "Er reist minimaal één volwassene mee."
  if (!(v.kinderen >= 0)) fouten.kinderen = "Geen geldig aantal."
  if (!fouten.volwassenen && !fouten.kinderen && v.volwassenen + v.kinderen > r.max_personen) {
    fouten.volwassenen = "Het huis is geschikt voor maximaal " + r.max_personen + " personen."
  }
  return Object.keys(fouten).length ? { fouten: fouten } : { velden: v }
}

// --- Prijs (zoals berekenPrijsopbouw en tbRichtbedrag in de app) -----------

function rondAf(teller, noemer) {
  const negatief = teller < 0
  const t = Math.abs(teller)
  const r = Math.floor((2 * t + noemer) / (2 * noemer))
  return negatief ? -r : r
}

function prijs(app, aankomst, vertrek, volwassenen, kinderen) {
  const inst = instellingen(app)
  const seizoenen = app
    .findRecordsByFilter("seizoenen", "van <= {:v} && tot >= {:a}", "van", 0, 0, { a: aankomst, v: vertrek })
    .map((s) => ({ van: s.getString("van"), tot: s.getString("tot"), cent: s.getInt("prijs_per_nacht_cent") }))
  const n = dagenTussen(aankomst, vertrek)
  let totaal = 0
  let ontbrekend = 0
  for (let d = aankomst; d < vertrek; d = plusDagen(d, 1)) {
    const s = seizoenVoorNacht(d, seizoenen)
    if (s) totaal += s.cent
    else ontbrekend++
  }
  const park = inst.getBool("parkkosten_apart_op_factuur") ? inst.getInt("parkkosten_per_nacht_cent") * n : 0
  const huur = Math.max(0, totaal - park)

  // Richtbedrag toeristenbelasting met het tarief dat op de aankomstdatum geldt.
  let tb = 0
  const tarief = app.findRecordsByFilter("tb_tarieven", "geldig_vanaf <= {:a}", "-geldig_vanaf", 1, 0, { a: aankomst })[0]
  const personen = volwassenen + kinderen
  if (tarief && n > 0 && personen > 0) {
    let opslagen = []
    try {
      opslagen = JSON.parse(tarief.getString("opslagen") || "[]") || []
    } catch (_) {}
    let teller = (huur + park) * tarief.getInt("percentage_bp")
    let noemer = n * personen * 10000
    if (teller > tarief.getInt("plafond_cent") * noemer) {
      teller = tarief.getInt("plafond_cent")
      noemer = 1
    }
    let perNacht = rondAf(teller, noemer)
    for (const o of opslagen) perNacht += rondAf(teller * (o.bp || 0), noemer * 10000)
    tb = perNacht * volwassenen * n
  }
  return { huur: huur, park: park, schoonmaak: inst.getInt("schoonmaak_cent"), tb: tb, ontbrekend: ontbrekend }
}

// --- Aanmaken ---------------------------------------------------------------

const CODE_TEKENS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Maakt huurder (of vindt hem op e-mailadres) en boeking aan. Geeft de boeking terug. */
function maakBoeking(tx, v) {
  const inst = instellingen(tx)
  let huurder = null
  try {
    huurder = tx.findFirstRecordByFilter("huurders", "email = {:e} && geanonimiseerd_op = ''", { e: v.email })
  } catch (_) {}
  if (huurder) {
    // Bestaande huurder: alleen lege velden aanvullen, niets overschrijven.
    if (!huurder.getString("telefoon_mobiel") && v.telefoon) huurder.set("telefoon_mobiel", v.telefoon)
    tx.save(huurder)
  } else {
    huurder = new Record(tx.findCollectionByNameOrId("huurders"))
    huurder.set("voornaam", v.voornaam)
    huurder.set("achternaam", v.achternaam)
    huurder.set("email", v.email)
    huurder.set("telefoon_mobiel", v.telefoon)
    huurder.set("taal", "nl")
    tx.save(huurder)
  }

  const p = prijs(tx, v.aankomst, v.vertrek, v.volwassenen, v.kinderen)
  const b = new Record(tx.findCollectionByNameOrId("boekingen"))
  b.set("code", $security.randomStringWithAlphabet(16, CODE_TEKENS))
  b.set("huurder", huurder.id)
  b.set("aankomst", v.aankomst)
  b.set("vertrek", v.vertrek)
  b.set("volwassenen", v.volwassenen)
  b.set("kinderen", v.kinderen)
  b.set("bron", "website")
  b.set("taal", "nl")
  b.set("optie", false)
  b.set("status", "aanvraag")
  b.set("status_sinds", new DateTime())
  b.set("betaalwijze", "aanbetaling")
  b.set("aanbetaling_pct", inst.getInt("aanbetaling_pct"))
  b.set("huur_cent", p.huur)
  b.set("huur_berekend_cent", p.huur)
  b.set("huur_handmatig", false)
  b.set("parkkosten_cent", p.park)
  b.set("schoonmaak_cent", p.schoonmaak)
  b.set("extras", [])
  b.set("tb_berekend_cent", p.tb)
  b.set("rest_vervaldatum", plusDagen(v.aankomst, -7 * inst.getInt("rest_weken_voor_aankomst")))
  const notities = ["Aanvraag via het boekingsformulier op de website."]
  if (p.ontbrekend) notities.push("Let op: voor " + p.ontbrekend + " nacht(en) is geen seizoensprijs ingesteld; controleer de huur.")
  if (v.opmerkingen) notities.push("", "Opmerking van de gast:", v.opmerkingen)
  b.set("notities", notities.join("\n"))
  tx.save(b)

  const w = new Record(tx.findCollectionByNameOrId("statuswijzigingen"))
  w.set("boeking", b.id)
  w.set("van", "")
  w.set("naar", "aanvraag")
  w.set("door", "boekingsformulier")
  tx.save(w)
  return b
}

function stuurMelding(app, v, boekingId, origin) {
  const melding = require(`${__hooks}/melding.js`)
  const naam = (v.voornaam + " " + v.achternaam).trim()
  const periode = melding.kort(v.aankomst) + " – " + melding.kort(v.vertrek)
  const regels = [
    "Er is een boekingsaanvraag binnengekomen via de website.",
    "",
    "Naam: " + naam,
    "E-mail: " + v.email + (v.telefoon ? " · " + v.telefoon : ""),
    "Verblijf: " + periode + " (" + dagenTussen(v.aankomst, v.vertrek) + " nachten)",
    "Personen: " + v.volwassenen + " volwassene(n)" + (v.kinderen ? " en " + v.kinderen + " kind(eren)" : ""),
  ]
  if (v.opmerkingen) regels.push("", "Opmerking:", v.opmerkingen)
  regels.push("", "De boeking staat in de app met status Aanvraag. De gast heeft nog geen bericht van ons gehad.")
  return melding.stuur(app, "Nieuwe boekingsaanvraag: " + naam + " (" + periode + ")", regels, "/#/boekingen/" + boekingId, origin)
}

module.exports = { bezet, regels, controleer, maakBoeking, stuurMelding, prijs }
