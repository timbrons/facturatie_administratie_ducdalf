// Korte meldingen per e-mail aan de eigenaren zelf (nieuwe aanmelding, nieuwe
// boekingsaanvraag). Verstuurd via de vaste Google-koppeling, van en naar het
// afzenderadres; nooit naar een huurder.

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

/** 2026-12-03 → "3 dec 2026" */
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

/**
 * Stuurt een melding naar het afzenderadres. Geeft "" bij succes, anders de
 * reden waarom het niet lukte (de aanroeper logt die alleen).
 */
function stuur(app, onderwerp, regels, pad, origin) {
  let afzender = ""
  try {
    afzender = app.findFirstRecordByFilter("instellingen", "id != ''").getString("afzender_email").trim()
  } catch (_) {}
  if (!afzender) return "geen afzender ingesteld"
  const google = require(`${__hooks}/google.js`)
  const t = google.token()
  if (t.status !== 200 || String(t.body.scope || "").indexOf("gmail.send") === -1) return "Google niet gekoppeld"

  const adres = appAdres(origin)
  const tekst = regels.slice()
  if (adres && pad) tekst.push("", "Bekijken: " + adres + pad)
  tekst.push("", "— Duc'dalf verhuurbeheer")

  const mime = [
    "From: " + afzender,
    "To: " + afzender,
    "Subject: =?UTF-8?B?" + base64(onderwerp) + "?=",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(tekst.join("\r\n")).replace(/.{76}/g, "$&\r\n"),
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

module.exports = { stuur, kort, base64, appAdres }
