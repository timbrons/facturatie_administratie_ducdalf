// Huurboekingen in Google Agenda (het afzenderaccount, via de vaste koppeling).
//
// Elke boeking die niet geannuleerd is, staat als afspraak voor de hele dag
// in de agenda van Instellingen → Google Agenda: van de aankomstdag tot en
// met de vertrekdag, net als de eigen verblijven. Geannuleerde en verwijderde
// boekingen verdwijnen uit de agenda. De afspraak heeft een vaste id per
// boeking en het kenmerk ducdalf=boeking, zodat de app hem niet als eigen
// verblijf ziet.
//
// Bijwerken gebeurt direct na een wijziging (hooks in agenda_sync.pb.js) en
// voor de zekerheid elke 10 minuten voor alle boekingen; zo komen ook oude
// boekingen en wijzigingen tijdens een storing bij Google in de agenda.
// In de collectie agenda_sync staat per boeking wat er in de agenda staat,
// zodat alleen wijzigingen naar Google gaan.

const DAG = 24 * 60 * 60 * 1000

function plusDagen(d, n) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * DAG).toISOString().slice(0, 10)
}

/** Vaste afspraak-id per boeking (Google staat alleen 0-9 en a-v toe). */
function eventId(boekingId) {
  let hex = ""
  for (let i = 0; i < boekingId.length; i++) hex += ("0" + boekingId.charCodeAt(i).toString(16)).slice(-2)
  return "dkb" + hex
}

function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + "-" + s.length
}

/** Instellingen en sleutel, of null als synchroniseren nu niet kan of uit staat. */
function verbinding(app) {
  let inst
  try {
    inst = app.findFirstRecordByFilter("instellingen", "id != ''")
  } catch (_) {
    return null
  }
  if (!inst.getBool("agenda_boekingen")) return null
  const google = require(`${__hooks}/google.js`)
  const t = google.token()
  if (t.status !== 200 || String(t.body.scope || "").indexOf("calendar.events") === -1) return null
  return { token: t.body.access_token, agenda: inst.getString("agenda_id") || "primary" }
}

function basis(agenda) {
  // DUCDALF_CALENDAR_API alleen voor tests met een nep-Google.
  const api = String($os.getenv("DUCDALF_CALENDAR_API") || "https://www.googleapis.com/calendar/v3")
  return api + "/calendars/" + encodeURIComponent(agenda) + "/events"
}

function verzoek(v, methode, url, body) {
  const opties = { url: url, method: methode, headers: { Authorization: "Bearer " + v.token }, timeout: 15 }
  if (body) {
    opties.body = JSON.stringify(body)
    opties.headers["content-type"] = "application/json"
  }
  return $http.send(opties)
}

function statusLabel(app, sleutel) {
  try {
    return app.findFirstRecordByFilter("workflow_stappen", "sleutel = {:s}", { s: sleutel }).getString("label") || sleutel
  } catch (_) {
    return sleutel
  }
}

function naamVan(app, b) {
  try {
    const h = app.findRecordById("huurders", b.getString("huurder"))
    return (h.getString("voornaam") + " " + h.getString("achternaam")).trim() || "Huurder"
  } catch (_) {
    return "Huurder"
  }
}

/** De afspraak zoals hij in de agenda hoort te staan. */
function afspraak(app, b) {
  const status = b.getString("status")
  const vooraf = b.getBool("optie") ? " (optie)" : status === "aanvraag" || status === "in_afstemming" ? " (aanvraag)" : ""
  const volw = b.getInt("volwassenen")
  const kind = b.getInt("kinderen")
  const melding = require(`${__hooks}/melding.js`)
  const adres = melding.appAdres("")
  const regels = [
    volw + " volwassene(n)" + (kind ? " en " + kind + " kind(eren)" : ""),
    "Status: " + statusLabel(app, status),
  ]
  if (adres) regels.push("", "Boeking in de app: " + adres + "/#/boekingen/" + b.id)
  return {
    summary: "Verhuur – " + naamVan(app, b) + vooraf,
    description: regels.join("\n"),
    start: { date: b.getString("aankomst") },
    // Hele dagen: tot en met de vertrekdag (Google telt het einde niet mee).
    end: { date: plusDagen(b.getString("vertrek"), 1) },
    transparency: "opaque",
    status: "confirmed",
    extendedProperties: { private: { ducdalf: "boeking", boeking: b.id } },
  }
}

function rij(app, boekingId) {
  try {
    return app.findFirstRecordByFilter("agenda_sync", "boeking_id = {:b}", { b: boekingId })
  } catch (_) {
    return null
  }
}

function verwijderAfspraak(v, agenda, id) {
  const res = verzoek({ token: v.token }, "DELETE", basis(agenda) + "/" + id)
  return res.statusCode < 300 || res.statusCode === 404 || res.statusCode === 410
}

function zetAfspraak(v, id, body) {
  const metId = Object.assign({ id: id }, body)
  let res = verzoek(v, "PUT", basis(v.agenda) + "/" + id, metId)
  if (res.statusCode === 404) res = verzoek(v, "POST", basis(v.agenda), metId)
  return res.statusCode >= 200 && res.statusCode < 300 ? "" : "Google gaf status " + res.statusCode
}

/**
 * Brengt de agenda in lijn met één boeking (of ruimt op als de boeking weg
 * is). Geeft "gezet", "verwijderd", "ongewijzigd" of een foutmelding terug.
 */
function synchroniseer(app, v, boekingId) {
  let b = null
  try {
    b = app.findRecordById("boekingen", boekingId)
  } catch (_) {}
  const r = rij(app, boekingId)
  const id = eventId(boekingId)

  if (!b || b.getString("status") === "geannuleerd") {
    if (!r) return "ongewijzigd"
    if (!verwijderAfspraak(v, r.getString("agenda_id") || v.agenda, r.getString("event_id") || id)) return "verwijderen mislukt"
    app.delete(r)
    return "verwijderd"
  }

  const body = afspraak(app, b)
  const kenmerk = hash(JSON.stringify(body))
  if (r && r.getString("kenmerk") === kenmerk && r.getString("agenda_id") === v.agenda && !r.getString("fout")) return "ongewijzigd"

  // Andere agenda gekozen: eerst uit de oude agenda halen.
  if (r && r.getString("agenda_id") && r.getString("agenda_id") !== v.agenda) {
    verwijderAfspraak(v, r.getString("agenda_id"), r.getString("event_id") || id)
  }
  const fout = zetAfspraak(v, id, body)
  const nieuw = r || new Record(app.findCollectionByNameOrId("agenda_sync"))
  nieuw.set("boeking_id", boekingId)
  nieuw.set("agenda_id", v.agenda)
  nieuw.set("event_id", id)
  nieuw.set("kenmerk", fout ? "" : kenmerk)
  nieuw.set("fout", fout)
  app.save(nieuw)
  return fout || "gezet"
}

/** Eén boeking, direct na een wijziging. Een fout houdt het opslaan nooit tegen. */
function naWijziging(app, boekingId) {
  try {
    const v = verbinding(app)
    if (!v) return
    const uitkomst = synchroniseer(app, v, boekingId)
    if (uitkomst !== "gezet" && uitkomst !== "verwijderd" && uitkomst !== "ongewijzigd") {
      app.logger().warn("Boeking niet in Google Agenda gezet", "boeking", boekingId, "reden", uitkomst)
    }
  } catch (err) {
    app.logger().warn("Boeking niet in Google Agenda gezet", "boeking", boekingId, "fout", String(err))
  }
}

/** Alle boekingen (en opruimen van verdwenen boekingen). */
function alles(app) {
  const v = verbinding(app)
  if (!v) return { actief: false, gezet: 0, verwijderd: 0, ongewijzigd: 0, fouten: 0 }
  const telling = { actief: true, gezet: 0, verwijderd: 0, ongewijzigd: 0, fouten: 0 }
  const ids = {}
  for (const b of app.findRecordsByFilter("boekingen", "id != ''", "aankomst", 0, 0)) ids[b.id] = true
  for (const r of app.findRecordsByFilter("agenda_sync", "id != ''", "", 0, 0)) ids[r.getString("boeking_id")] = true
  for (const id of Object.keys(ids)) {
    let uitkomst
    try {
      uitkomst = synchroniseer(app, v, id)
    } catch (err) {
      uitkomst = String(err)
    }
    if (telling[uitkomst] !== undefined && uitkomst !== "actief") telling[uitkomst]++
    else telling.fouten++
  }
  return telling
}

module.exports = { naWijziging, alles, eventId, afspraak }
