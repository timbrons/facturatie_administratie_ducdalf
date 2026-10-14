// Het eigen aanmeldformulier (openbaar, zonder inloggen).
//
// Controle → opslaan in `aanmeldingen` → automatisch koppelen aan de boeking
// als de boekingscode klopt en er niets te twijfelen valt → melding per e-mail
// aan de eigenaren zelf (nooit aan de huurder).
//
// De velden heten hetzelfde als op het oude formulier (FormSubmit), zodat de
// app ze op dezelfde manier leest (frontend/src/domein/aanmelding.ts).

const MAX_EXTRA = 5
const MAX_PERSONEN = 6

const VELDEN = {
  aankomstdatum: { verplicht: true, datum: true },
  vertrekdatum: { verplicht: true, datum: true },
  aantal_personen: { verplicht: true, max: 2 },
  aanhef: { verplicht: true, max: 10, keuze: ["Dhr.", "Mevr."] },
  voornaam: { verplicht: true, max: 100 },
  achternaam: { verplicht: true, max: 100 },
  adres: { verplicht: true, max: 200 },
  postcode: { verplicht: true, max: 20 },
  plaats: { verplicht: true, max: 100 },
  telefoon_vast: { max: 40 },
  telefoon_mobiel: { verplicht: true, max: 40 },
  email: { verplicht: true, max: 200, email: true },
  kenteken_auto: { max: 20 },
  nummer_paspoort: { max: 40 },
  geboortedatum: { verplicht: true, datum: true },
  geboorteplaats: { verplicht: true, max: 100 },
  noodcontact_naam: { verplicht: true, max: 200 },
  noodcontact_telefoon_vast: { max: 40 },
  noodcontact_telefoon_mobiel: { verplicht: true, max: 40 },
  noodcontact_email: { verplicht: true, max: 200, email: true },
  opmerkingen: { max: 3000 },
  boekingscode: { max: 40 },
}

const LABELS = {
  aankomstdatum: "Aankomstdatum", vertrekdatum: "Vertrekdatum", aantal_personen: "Aantal personen", aanhef: "Aanhef",
  voornaam: "Voornaam", achternaam: "Achternaam", adres: "Adres", postcode: "Postcode", plaats: "Plaats",
  telefoon_mobiel: "Mobiel nummer", email: "E-mailadres", geboortedatum: "Geboortedatum", geboorteplaats: "Geboorteplaats",
  noodcontact_naam: "Naam noodcontact", noodcontact_telefoon_mobiel: "Mobiel nummer noodcontact", noodcontact_email: "E-mailadres noodcontact",
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

/**
 * Controleert en normaliseert de invoer. Geeft { velden } of { fouten } terug;
 * fouten is een object veldnaam → melding.
 */
function controleer(invoer) {
  const v = {}
  const fouten = {}
  for (const naam of Object.keys(VELDEN)) {
    const regel = VELDEN[naam]
    let w = tekst(invoer[naam])
    if (naam !== "opmerkingen") w = w.replace(/\s+/g, " ")
    if (!w) {
      if (regel.verplicht) fouten[naam] = (LABELS[naam] || naam) + " is verplicht."
      continue
    }
    if (regel.max && w.length > regel.max) { fouten[naam] = "Te lang (maximaal " + regel.max + " tekens)."; continue }
    if (regel.datum && !isDatum(w)) { fouten[naam] = "Geen geldige datum."; continue }
    if (regel.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w)) { fouten[naam] = "Geen geldig e-mailadres."; continue }
    if (regel.keuze && regel.keuze.indexOf(w) === -1) { fouten[naam] = "Maak een keuze."; continue }
    v[naam] = w
  }

  const aantal = parseInt(v.aantal_personen, 10)
  if (v.aantal_personen && (!(aantal >= 1) || aantal > MAX_PERSONEN || String(aantal) !== v.aantal_personen)) {
    fouten.aantal_personen = "Kies 1 tot en met " + MAX_PERSONEN + " personen."
  }
  if (v.aankomstdatum && v.vertrekdatum && v.vertrekdatum <= v.aankomstdatum) {
    fouten.vertrekdatum = "De vertrekdatum moet na de aankomstdatum liggen."
  }
  const vandaag = new Date().toISOString().slice(0, 10)
  if (v.geboortedatum && v.geboortedatum > vandaag) fouten.geboortedatum = "Geboortedatum ligt in de toekomst."

  // Meereizenden (de invuller telt zelf als persoon 1).
  const extra = Array.isArray(invoer.extra_personen) ? invoer.extra_personen.slice(0, MAX_EXTRA) : []
  let n = 0
  for (let i = 0; i < extra.length; i++) {
    const p = extra[i] || {}
    const naam = tekst(p.naam).replace(/\s+/g, " ")
    const gd = tekst(p.geboortedatum)
    const gp = tekst(p.geboorteplaats).replace(/\s+/g, " ")
    if (!naam && !gd && !gp) continue
    n++
    const pre = "extra_persoon_" + n + "_"
    if (!naam) fouten[pre + "naam"] = "Vul de naam in."
    else if (naam.length > 200) fouten[pre + "naam"] = "Te lang."
    if (!gd) fouten[pre + "geboortedatum"] = "Vul de geboortedatum in."
    else if (!isDatum(gd) || gd > vandaag) fouten[pre + "geboortedatum"] = "Geen geldige geboortedatum."
    if (gp.length > 100) fouten[pre + "geboorteplaats"] = "Te lang."
    v[pre + "naam"] = naam
    v[pre + "geboortedatum"] = gd
    v[pre + "geboorteplaats"] = gp
  }
  if (aantal >= 1 && aantal <= MAX_PERSONEN && n !== aantal - 1) {
    fouten.extra_personen = aantal === 2
      ? "Vul de gegevens in van de persoon die met je meereist."
      : "Vul de gegevens in van alle " + (aantal - 1) + " personen die met je meereizen."
  }

  if (v.postcode) v.postcode = v.postcode.toUpperCase()
  if (v.kenteken_auto) v.kenteken_auto = v.kenteken_auto.toUpperCase()
  if (v.email) v.email = v.email.toLowerCase()
  if (v.noodcontact_email) v.noodcontact_email = v.noodcontact_email.toLowerCase()

  return Object.keys(fouten).length ? { fouten: fouten } : { velden: v }
}

/** Zelfde vorm als maakAanmelding() in de app (boekingen.aanmelding). */
function alsAanmelding(v) {
  const extra = []
  for (let i = 1; i <= MAX_EXTRA; i++) {
    const naam = v["extra_persoon_" + i + "_naam"] || ""
    if (!naam) continue
    extra.push({ naam: naam, geboortedatum: v["extra_persoon_" + i + "_geboortedatum"] || null, geboorteplaats: v["extra_persoon_" + i + "_geboorteplaats"] || "" })
  }
  return {
    boekingscode: v.boekingscode || "",
    aankomst: v.aankomstdatum || null,
    vertrek: v.vertrekdatum || null,
    aantalPersonen: parseInt(v.aantal_personen, 10) || null,
    aanhef: v.aanhef || "",
    voornaam: v.voornaam || "",
    achternaam: v.achternaam || "",
    adres: v.adres || "",
    postcode: v.postcode || "",
    plaats: v.plaats || "",
    telefoonVast: v.telefoon_vast || "",
    telefoonMobiel: v.telefoon_mobiel || "",
    email: v.email || "",
    kenteken: v.kenteken_auto || "",
    paspoort: v.nummer_paspoort || "",
    geboortedatum: v.geboortedatum || null,
    geboorteplaats: v.geboorteplaats || "",
    extraPersonen: extra,
    noodcontact: {
      naam: v.noodcontact_naam || "",
      telefoonVast: v.noodcontact_telefoon_vast || "",
      telefoonMobiel: v.noodcontact_telefoon_mobiel || "",
      email: v.noodcontact_email || "",
    },
    opmerkingen: v.opmerkingen || "",
  }
}

function leeftijdOp(geboortedatum, op) {
  const g = geboortedatum.split("-").map(Number)
  const d = op.split("-").map(Number)
  return d[0] - g[0] - (d[1] < g[1] || (d[1] === g[1] && d[2] < g[2]) ? 1 : 0)
}

function volwassenVanaf(app, aankomst) {
  try {
    const r = app.findRecordsByFilter("tb_tarieven", "geldig_vanaf <= {:d}", "-geldig_vanaf", 1, 0, { d: aankomst })[0]
    const n = r ? r.getInt("volwassen_vanaf_leeftijd") : 0
    if (n > 0) return n
  } catch (_) {}
  return 18
}

/** Zelfde telling als telPersonen() in de app. */
function telPersonen(a, aankomst, grens) {
  let volwassenen = 1
  let kinderen = 0
  let onbekend = 0
  for (const p of a.extraPersonen) {
    if (!p.geboortedatum) { volwassenen++; onbekend++ }
    else if (leeftijdOp(p.geboortedatum, aankomst) >= grens) volwassenen++
    else kinderen++
  }
  return { volwassenen: volwassenen, kinderen: kinderen, onbekend: onbekend }
}

function boekingBijCode(app, code) {
  if (!code || !/^[A-Za-z0-9]{8,40}$/.test(code)) return null
  try {
    return app.findFirstRecordByFilter("boekingen", "code = {:c}", { c: code })
  } catch (_) {
    return null
  }
}

/** Is de boeking al bij (of voorbij) de stap? Zelfde regel als isBijOfVoorbij() in de app. */
function isBijOfVoorbij(app, status, sleutel) {
  if (status === "geannuleerd") return false
  const stappen = app.findRecordsByFilter("workflow_stappen", "actief = true", "volgorde", 0, 0)
  const lijst = stappen.map((s) => s.getString("sleutel"))
  const huidig = lijst.indexOf(status)
  const doel = lijst.indexOf(sleutel)
  return huidig >= 0 && doel >= 0 && huidig >= doel
}

/**
 * Probeert de inzending aan de boeking te koppelen. Geeft { boeking } bij succes,
 * of { reden } waarom het handmatig moet.
 */
function koppel(app, v, aanmelding) {
  const b = boekingBijCode(app, v.boekingscode)
  if (!b) return { reden: v.boekingscode ? "Onbekende boekingscode." : "" }
  if (b.getString("status") === "geannuleerd") return { reden: "De boeking is geannuleerd.", boeking: b, handmatig: true }
  const bestaand = b.getString("aanmelding")
  if (bestaand && bestaand !== "null") {
    return { reden: "Bij deze boeking is al een aanmeldformulier ontvangen.", boeking: b, handmatig: true }
  }
  if (b.getString("aankomst") !== v.aankomstdatum || b.getString("vertrek") !== v.vertrekdatum) {
    return { reden: "De datums wijken af van de boeking.", boeking: b, handmatig: true }
  }
  const telling = telPersonen(aanmelding, b.getString("aankomst"), volwassenVanaf(app, b.getString("aankomst")))
  if (telling.volwassenen !== b.getInt("volwassenen") || telling.kinderen !== b.getInt("kinderen") || telling.onbekend > 0) {
    return { reden: "Het aantal volwassenen/minderjarigen wijkt af van de boeking.", boeking: b, handmatig: true }
  }
  return { boeking: b }
}

/** Neemt de gegevens over in huurder en boeking (zoals "Overnemen" in de app). */
function neemOver(tx, b, a, aanmeldingId, ontvangen) {
  const huurderId = b.getString("huurder")
  if (huurderId) {
    const h = tx.findRecordById("huurders", huurderId)
    const velden = {
      aanhef: a.aanhef, voornaam: a.voornaam, achternaam: a.achternaam, adres: a.adres, postcode: a.postcode,
      plaats: a.plaats, telefoon_mobiel: a.telefoonMobiel, telefoon_vast: a.telefoonVast, email: a.email, kenteken: a.kenteken,
    }
    for (const k of Object.keys(velden)) if (velden[k]) h.set(k, velden[k])
    tx.save(h)
  }
  const kopie = JSON.parse(JSON.stringify(a))
  kopie.aanmelding_id = aanmeldingId
  kopie.ontvangen = ontvangen
  b.set("aanmelding", kopie)
  b.set("aanmelding_op", new DateTime())
  if (a.kenteken) b.set("kenteken", a.kenteken)
  const oud = b.getString("status")
  const nieuw = isBijOfVoorbij(tx, oud, "aanmeldformulier_ontvangen") ? oud : "aanmeldformulier_ontvangen"
  if (nieuw !== oud) {
    b.set("status", nieuw)
    b.set("status_sinds", new DateTime())
  }
  tx.save(b)
  if (nieuw !== oud) {
    const w = new Record(tx.findCollectionByNameOrId("statuswijzigingen"))
    w.set("boeking", b.id)
    w.set("van", oud)
    w.set("naar", nieuw)
    w.set("door", "aanmeldformulier")
    tx.save(w)
  }
}

// --- Melding per e-mail aan de eigenaren ------------------------------------

function utf8(s) {
  const uit = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00)
    }
    if (c < 0x80) uit.push(c)
    else if (c < 0x800) uit.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) uit.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else uit.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return uit
}

function base64(s) {
  const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const b = utf8(s)
  let uit = ""
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0)
    uit += t[(n >> 18) & 63] + t[(n >> 12) & 63] + (i + 1 < b.length ? t[(n >> 6) & 63] : "=") + (i + 2 < b.length ? t[n & 63] : "=")
  }
  return uit
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
function kort(d) {
  const p = (d || "").split("-")
  return p.length === 3 ? parseInt(p[2], 10) + " " + MAANDEN[parseInt(p[1], 10) - 1] + " " + p[0] : d
}

/** Adres van de app voor de link in de melding: alleen een bekende origin. */
function appAdres(origin) {
  const toegestaan = String($os.getenv("PB_ORIGINS") || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean)
  const o = String(origin || "").replace(/\/+$/, "")
  if (o && toegestaan.indexOf(o) !== -1) return o
  return toegestaan.filter((s) => s.indexOf("github.io") === -1)[0] || toegestaan[0] || ""
}

function stuurMelding(app, v, gekoppeld, reden, origin) {
  let afzender = ""
  try {
    afzender = app.findFirstRecordByFilter("instellingen", "id != ''").getString("afzender_email").trim()
  } catch (_) {}
  if (!afzender) return "geen afzender ingesteld"
  const google = require(`${__hooks}/google.js`)
  const t = google.token()
  if (t.status !== 200 || String(t.body.scope || "").indexOf("gmail.send") === -1) return "Google niet gekoppeld"

  const naam = (v.voornaam + " " + v.achternaam).trim()
  const onderwerp = "Nieuwe aanmelding: " + naam + " (" + kort(v.aankomstdatum) + " – " + kort(v.vertrekdatum) + ")"
  const adres = appAdres(origin)
  const regels = [
    "Er is een aanmeldformulier ingevuld.",
    "",
    "Naam: " + naam,
    "Verblijf: " + kort(v.aankomstdatum) + " – " + kort(v.vertrekdatum) + " (" + v.aantal_personen + " personen)",
    "",
    gekoppeld
      ? "De aanmelding is automatisch gekoppeld aan de boeking en de status is bijgewerkt."
      : "De aanmelding staat klaar om te controleren en over te nemen." + (reden ? " (" + reden + ")" : ""),
  ]
  if (adres) regels.push("", "Bekijken: " + adres + "/#/aanmeldingen")
  regels.push("", "— Duc'dalf verhuurbeheer")

  const mime = [
    "From: " + afzender,
    "To: " + afzender,
    "Subject: =?UTF-8?B?" + base64(onderwerp) + "?=",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(regels.join("\r\n")).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n")
  const raw = base64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const res = $http.send({
    url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    method: "POST",
    body: JSON.stringify({ raw: raw }),
    headers: { Authorization: "Bearer " + t.body.access_token, "content-type": "application/json" },
    timeout: 20,
  })
  return res.statusCode >= 200 && res.statusCode < 300 ? "" : "Gmail gaf status " + res.statusCode
}

module.exports = { controleer, alsAanmelding, koppel, neemOver, boekingBijCode, stuurMelding, base64 }
