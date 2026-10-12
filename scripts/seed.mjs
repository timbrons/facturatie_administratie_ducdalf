// Vult een LOKALE PocketBase met fictieve testdata. Nooit tegen de NAS draaien.
//
//   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD='...' node scripts/seed.mjs
//
// Zet ook inloggen met wachtwoord aan voor de testgebruiker (alleen lokaal!).

const URL_ = process.env.PB_URL || "http://127.0.0.1:8090"
const ADMIN = process.env.PB_ADMIN_EMAIL || "admin@example.com"
const WACHTWOORD = process.env.PB_ADMIN_PASSWORD || "EenLangWachtwoord123!"
const TESTGEBRUIKER = { email: "test@ducdalf.test", wachtwoord: "testtest123" }

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) {
  console.error(`Weigering: de seed draait alleen tegen localhost, niet tegen ${URL_}.`)
  process.exit(1)
}

let token = ""
async function api(pad, { method = "GET", body } = {}) {
  const res = await fetch(`${URL_}${pad}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${pad}: ${res.status} ${JSON.stringify(data)}`)
  return data
}

function plus(datum, dagen) {
  const d = new Date(`${datum}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dagen)
  return d.toISOString().slice(0, 10)
}

const vandaag = new Date().toISOString().slice(0, 10)

const auth = await api("/api/collections/_superusers/auth-with-password", { method: "POST", body: { identity: ADMIN, password: WACHTWOORD } })
token = auth.token

// Alleen lokaal: wachtwoord-login aan voor de testgebruiker.
const users = await api("/api/collections/users")
users.passwordAuth.enabled = true
await api("/api/collections/users", { method: "PATCH", body: { passwordAuth: users.passwordAuth } })
const bestaand = await api(`/api/collections/users/records?filter=${encodeURIComponent(`email="${TESTGEBRUIKER.email}"`)}`)
if (bestaand.items.length === 0) {
  await api("/api/collections/users/records", {
    method: "POST",
    body: { email: TESTGEBRUIKER.email, password: TESTGEBRUIKER.wachtwoord, passwordConfirm: TESTGEBRUIKER.wachtwoord, verified: true, name: "Testgebruiker" },
  })
}

// Instellingen met fictieve afzender en bank
const inst = (await api("/api/collections/instellingen/records")).items[0]
await api(`/api/collections/instellingen/records/${inst.id}`, {
  method: "PATCH",
  body: {
    afzender_naam: "Familie Voorbeeld",
    afzender_adres: "Voorbeeldstraat 1\n1234 AB Voorbeeldstad",
    afzender_telefoon: "06 00 00 00 00",
    afzender_email: "verhuur@example.com",
    bank_tnv: "J. Voorbeeld",
    bank_iban: "NL00 TEST 0000 0000 00",
  },
})

// Nummerreeks
const reeks = await api(`/api/collections/nummerreeksen/records?filter=${encodeURIComponent("jaar=2026")}`)
if (reeks.items.length === 0) await api("/api/collections/nummerreeksen/records", { method: "POST", body: { jaar: 2026, laatste: 3 } })

// Fictieve huurders en boekingen
const huurders = [
  { voornaam: "Anna", achternaam: "de Testvrouw", email: "anna@example.com", plaats: "Utrecht", kenteken: "TS-001-A" },
  { voornaam: "Bram", achternaam: "Proefmans", email: "bram@example.com", plaats: "Zwolle" },
  { voornaam: "Carla", achternaam: "Fictief", email: "carla@example.com", plaats: "Gent", land: "België", kenteken: "1-ABC-234" },
  { voornaam: "Daan", achternaam: "Voorbeeld", email: "daan@example.com", plaats: "Delft" },
]
const ids = []
for (const h of huurders) {
  const r = await api("/api/collections/huurders/records", { method: "POST", body: { land: "Nederland", taal: "nl", ...h } })
  ids.push(r.id)
}

const boekingen = [
  // Testcase factuur: 9 nachten, afwijkende huur € 900, toeristenbelasting € 27 uit het portaal
  { huurder: ids[0], aankomst: "2026-10-17", vertrek: "2026-10-26", volwassenen: 2, kinderen: 0, status: "factuur_verstuurd", betaalwijze: "aanbetaling", aanbetaling_pct: 50,
    huur_cent: 90000, huur_berekend_cent: 76500, huur_handmatig: true, parkkosten_cent: 9000, schoonmaak_cent: 6400, tb_berekend_cent: 7146,
    tb_portaal_cent: 2700, tb_portaal_op: "2026-05-27 10:00:00.000Z", aanbetaling_vervaldatum: "2026-06-27", rest_vervaldatum: "2026-09-19", kenteken: "TS-001-A", bron: "website" },
  { huurder: ids[1], aankomst: plus(vandaag, 30), vertrek: plus(vandaag, 37), volwassenen: 2, kinderen: 2, status: "aanbetaling_ontvangen", betaalwijze: "aanbetaling", aanbetaling_pct: 50,
    huur_cent: 59500, huur_berekend_cent: 59500, parkkosten_cent: 7000, schoonmaak_cent: 6400, tb_berekend_cent: 3220,
    aanbetaling_vervaldatum: plus(vandaag, -30), rest_vervaldatum: plus(vandaag, 2), bron: "parc_le_duc" },
  { huurder: ids[2], aankomst: plus(vandaag, 45), vertrek: plus(vandaag, 52), volwassenen: 2, kinderen: 0, status: "in_afstemming", betaalwijze: "ineens",
    huur_cent: 59500, huur_berekend_cent: 59500, parkkosten_cent: 7000, schoonmaak_cent: 6400, tb_berekend_cent: 3000, rest_vervaldatum: plus(vandaag, 24), bron: "website",
    extras: [{ naam: "Linnenpakket 2 personen", aantal: 1, prijs_cent: 2500, eenheid: "per_stuk" }] },
  { huurder: ids[3], aankomst: plus(vandaag, -20), vertrek: plus(vandaag, -13), volwassenen: 3, kinderen: 0, status: "verblijf", betaalwijze: "ineens",
    huur_cent: 82600, huur_berekend_cent: 82600, parkkosten_cent: 7000, schoonmaak_cent: 6400, tb_berekend_cent: 4000, tb_portaal_cent: 4011, tb_portaal_op: "2026-08-01 10:00:00.000Z",
    rest_vervaldatum: plus(vandaag, -48), bron: "bekenden" },
  // Optie die bewust overlapt met de boeking hierboven (om de waarschuwing te tonen)
  { huurder: ids[1], aankomst: plus(vandaag, 50), vertrek: plus(vandaag, 54), volwassenen: 2, kinderen: 0, status: "aanvraag", optie: true, betaalwijze: "aanbetaling", aanbetaling_pct: 50,
    huur_cent: 34000, huur_berekend_cent: 34000, parkkosten_cent: 4000, schoonmaak_cent: 6400, tb_berekend_cent: 1500, rest_vervaldatum: plus(vandaag, 22) },
]
for (const b of boekingen) {
  await api("/api/collections/boekingen/records", { method: "POST", body: { taal: "nl", ...b } })
}

console.log(`Klaar. Log in op de frontend met ${TESTGEBRUIKER.email} / ${TESTGEBRUIKER.wachtwoord} (VITE_DEV_LOGIN=true).`)
