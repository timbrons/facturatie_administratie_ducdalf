// Betaalbevestigingen van de toeristenbelasting automatisch vastleggen.
//
// Na een betaling in het portaal van Grand Pic Saint-Loup komt er een mail
// van PayFiP (noreply-payfip@sips-services.com) met als onderwerp
// "Payment confirmation - Order reference : <code>". Deze
// module zoekt die mails in Gmail (vaste koppeling, gmail.readonly), haalt het
// bedrag eruit en legt per mail één uitgave (soort toeristenbelasting) vast.
// Elke mail wordt maar één keer verwerkt (veld `bron` = "gmail:<id>"). Is het
// bedrag niet eenduidig te vinden, dan krijgt de uitgave `controleren`, zodat
// hij op het overzicht verschijnt om na te kijken.
//
// Wordt aangeroepen door een cron (elk half uur) en door de knop "Nu ophalen".

const STANDAARD_ONDERWERP = "Payment confirmation - Order reference"
// PayFiP (de betaaldienst van de Franse overheid, via Worldline/SIPS)
const STANDAARD_AFZENDER = "noreply-payfip@sips-services.com"

// ---------------------------------------------------------------- tekst

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** base64url (Gmail) → tekst (UTF-8). */
function vanBase64Url(data) {
  const s = String(data || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "")
  const bytes = []
  let buf = 0
  let bits = 0
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buf >> bits) & 0xff)
    }
  }
  // UTF-8 decoderen
  let uit = ""
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x80) uit += String.fromCharCode(b)
    else if (b >= 0xc0 && b < 0xe0) uit += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f))
    else if (b >= 0xe0 && b < 0xf0) uit += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f))
    else if (b >= 0xf0) {
      const c = ((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
      uit += String.fromCodePoint(c)
    }
  }
  return uit
}

/** HTML → platte tekst. */
function htmlNaarTekst(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
}

/** Alle tekst uit een Gmail-bericht (payload), platte tekst en HTML. */
function tekstUit(deel) {
  if (!deel) return ""
  let uit = ""
  if (deel.body && deel.body.data && !deel.filename) {
    const t = vanBase64Url(deel.body.data)
    uit += (deel.mimeType === "text/html" ? htmlNaarTekst(t) : t) + "\n"
  }
  for (const d of deel.parts || []) uit += tekstUit(d)
  return uit
}

// ---------------------------------------------------------------- bedrag

/** "1.234,56" / "1,234.56" / "204.60" / "204,6" → centen. */
function naarCent(s) {
  const schoon = String(s).replace(/[\s ]/g, "")
  const m = /^(.*?)([.,](\d{1,2}))?$/.exec(schoon)
  const heel = (m[1] || "0").replace(/[.,]/g, "")
  const dec = m[3] ? (m[3] + "0").slice(0, 2) : "00"
  return Number(heel) * 100 + Number(dec)
}

// Duizendtallen met punt of komma, of met een spatie maar dan alleen met
// decimalen erachter ("1 024,50"). Een getal mag niet direct na een cijfer
// beginnen, zodat bijv. een jaartal ervoor niet meetelt.
const GETAL = "(\\d{1,3}(?:[ \\u00a0]\\d{3})+[.,]\\d{1,2}|\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)"
const VOOR = new RegExp("(?:€|EUR)\\s*" + GETAL, "gi")
const NA = new RegExp("(?:^|[^\\d.,])" + GETAL + "\\s*(?:€|(?:EUR|euros?)\\b)", "gi")
const SLEUTELWOORD = /amount|montant|total|totaal|bedrag|paid|payé|paye|somme|price|prix/i

/**
 * Het betaalde bedrag in een betaalbevestiging. `zeker` is false als er geen
 * of meerdere verschillende bedragen in staan.
 */
function bedragUit(tekst) {
  const regels = String(tekst || "").split(/\n/)
  const alle = []
  const bijWoord = []
  let vorige = ""
  for (const regel of regels) {
    // Het sleutelwoord kan ook op de regel ervoor staan (bijv. een tabelcel ervoor).
    const metWoord = SLEUTELWOORD.test(regel) || SLEUTELWOORD.test(vorige)
    if (regel.trim()) vorige = regel
    for (const re of [VOOR, NA]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(regel))) {
        const c = naarCent(m[1])
        if (c > 0) {
          alle.push(c)
          if (metWoord) bijWoord.push(c)
        }
      }
    }
  }
  const uniek = (l) => l.filter((x, i) => l.indexOf(x) === i)
  const kandidaten = bijWoord.length ? uniek(bijWoord) : uniek(alle)
  if (kandidaten.length === 0) return { cent: 0, zeker: false }
  if (kandidaten.length === 1) return { cent: kandidaten[0], zeker: true }
  // Meerdere bedragen (bijv. per verblijf en een totaal): het grootste is meestal het totaal.
  return { cent: Math.max.apply(null, kandidaten), zeker: false }
}

/** "Payment confirmation - Order reference : GTA6AEF490942391" → "GTA6AEF490942391" */
function orderUit(onderwerp) {
  const m = /reference\s*:?\s*([A-Z0-9-]{4,})/i.exec(String(onderwerp || ""))
  return m ? m[1] : ""
}

/** Tijdstip (ms) → datum JJJJ-MM-DD in Franse/Nederlandse tijd (benadering: UTC+1, zomer UTC+2). */
function datumVan(ms) {
  const d = new Date(Number(ms))
  const maand = d.getUTCMonth() + 1
  const zomer = maand > 3 && maand < 11
  return new Date(Number(ms) + (zomer ? 2 : 1) * 3600 * 1000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------- Gmail

function haal(token, url) {
  const res = $http.send({ url: url, method: "GET", headers: { Authorization: "Bearer " + token }, timeout: 20 })
  if (res.statusCode !== 200) throw new Error("Gmail " + res.statusCode)
  return res.json
}

/**
 * Zoekt nieuwe betaalbevestigingen en legt ze vast. Geeft terug hoeveel er
 * nieuw zijn, of waarom het niet kon.
 */
function ophalen(app) {
  const google = require(`${__hooks}/google.js`)
  const t = google.token()
  if (t.status !== 200 || String(t.body.scope || "").indexOf("gmail.readonly") === -1) {
    return { nieuw: 0, melding: "Gmail kan niet worden gelezen (koppel Google opnieuw)." }
  }
  const token = t.body.access_token
  let onderwerp = STANDAARD_ONDERWERP
  let afzender = STANDAARD_AFZENDER
  try {
    const inst = app.findFirstRecordByFilter("instellingen", "id != ''")
    onderwerp = inst.getString("tb_betaalmail_onderwerp") || STANDAARD_ONDERWERP
    afzender = inst.getString("tb_betaalmail_afzender") || STANDAARD_AFZENDER
  } catch (_) {}
  const api = String($os.getenv("DUCDALF_GMAIL_API") || "https://gmail.googleapis.com/gmail/v1/users/me")
  const q = "from:" + afzender.replace(/[\s"()]/g, "") + ' subject:"' + onderwerp.replace(/"/g, "") + '" newer_than:120d'
  const lijst = haal(token, api + "/messages?maxResults=25&q=" + encodeURIComponent(q))
  const uitgaven = app.findCollectionByNameOrId("uitgaven")
  let nieuw = 0
  for (const m of lijst.messages || []) {
    const bron = "gmail:" + m.id
    try {
      app.findFirstRecordByFilter("uitgaven", "bron = {:b}", { b: bron })
      continue // al verwerkt
    } catch (_) {}
    const bericht = haal(token, api + "/messages/" + encodeURIComponent(m.id) + "?format=full")
    const kop = (naam) => {
      for (const h of (bericht.payload && bericht.payload.headers) || []) if (String(h.name).toLowerCase() === naam) return h.value
      return ""
    }
    const ond = kop("subject")
    if (ond.toLowerCase().indexOf(onderwerp.toLowerCase()) === -1) continue
    const bedrag = bedragUit(tekstUit(bericht.payload) + "\n" + (bericht.snippet || ""))
    const order = orderUit(ond)
    const datum = datumVan(bericht.internalDate)
    const r = new Record(uitgaven)
    r.set("soort", "toeristenbelasting")
    r.set("datum", datum)
    r.set("bedrag_cent", bedrag.cent)
    r.set("omschrijving", "Toeristenbelasting Grand Pic Saint-Loup" + (order ? " – order " + order : ""))
    r.set("bron", bron)
    r.set("controleren", !bedrag.zeker)
    r.set(
      "notities",
      "Automatisch vastgelegd uit de betaalbevestiging van " + datum + "." +
        (bedrag.zeker ? "" : " Het bedrag kon niet met zekerheid uit de mail worden gehaald; controleer het.") +
        "\nMail in Gmail: https://mail.google.com/mail/u/0/#all/" + m.id,
    )
    app.save(r)
    nieuw++
  }
  return { nieuw: nieuw, melding: "" }
}

module.exports = { ophalen, bedragUit, orderUit, tekstUit, vanBase64Url, datumVan, naarCent, STANDAARD_ONDERWERP }
