import { describe, expect, it } from "vitest"
import { leesVelden, leeftijdOp, maakAanmelding, telPersonen, zoekBoeking } from "./aanmelding"
import { factuurBestandsnaam, factuurMap, veiligeNaam } from "./bestandsnamen"
import { eigenVerblijven } from "./agenda"

// Fictieve inzending zoals FormSubmit ("_template=table") die mailt.
const HTML = `
<table>
  <tr><th>Name</th><th>Value</th></tr>
  <tr><td><strong>boekingscode</strong></td><td>AbCdEf123</td></tr>
  <tr><td><strong>aankomstdatum</strong></td><td>2026-10-17</td></tr>
  <tr><td><strong>vertrekdatum</strong></td><td>2026-10-26</td></tr>
  <tr><td><strong>aantal_personen</strong></td><td>4</td></tr>
  <tr><td><strong>aanhef</strong></td><td>Mevr.</td></tr>
  <tr><td><strong>voornaam</strong></td><td>Anna</td></tr>
  <tr><td><strong>achternaam</strong></td><td>de Testvrouw</td></tr>
  <tr><td><strong>adres</strong></td><td>Voorbeeldlaan 1</td></tr>
  <tr><td><strong>postcode</strong></td><td>1234 ab</td></tr>
  <tr><td><strong>plaats</strong></td><td>Utrecht</td></tr>
  <tr><td><strong>telefoon_vast</strong></td><td>-</td></tr>
  <tr><td><strong>telefoon_mobiel</strong></td><td>06 00 00 00 00</td></tr>
  <tr><td><strong>email</strong></td><td>Anna@Example.com</td></tr>
  <tr><td><strong>kenteken_auto</strong></td><td>ts-001-a</td></tr>
  <tr><td><strong>geboortedatum</strong></td><td>1980-01-01</td></tr>
  <tr><td><strong>geboorteplaats</strong></td><td>Utrecht</td></tr>
  <tr><td><strong>extra_persoon_1_naam</strong></td><td>Bram de Testvrouw</td></tr>
  <tr><td><strong>extra_persoon_1_geboortedatum</strong></td><td>1979-05-05</td></tr>
  <tr><td><strong>extra_persoon_2_naam</strong></td><td>Kim</td></tr>
  <tr><td><strong>extra_persoon_2_geboortedatum</strong></td><td>2008-10-18</td></tr>
  <tr><td><strong>extra_persoon_3_naam</strong></td><td>Sam</td></tr>
  <tr><td><strong>extra_persoon_3_geboortedatum</strong></td><td></td></tr>
  <tr><td><strong>noodcontact_naam</strong></td><td>Opa &amp; Oma</td></tr>
  <tr><td><strong>opmerkingen</strong></td><td>We komen &#39;s avonds aan.</td></tr>
</table>`

describe("aanmeldformulier", () => {
  const v = leesVelden({ html: HTML })
  const a = maakAanmelding(v)
  it("leest de velden uit de FormSubmit-tabel", () => {
    expect(v.aankomstdatum).toBe("2026-10-17")
    expect(v.name).toBeUndefined()
    expect(a).toMatchObject({
      boekingscode: "AbCdEf123", aankomst: "2026-10-17", vertrek: "2026-10-26", aantalPersonen: 4,
      voornaam: "Anna", achternaam: "de Testvrouw", postcode: "1234 AB", email: "anna@example.com",
      kenteken: "TS-001-A", telefoonVast: "", opmerkingen: "We komen 's avonds aan.",
    })
    expect(a.noodcontact.naam).toBe("Opa & Oma")
    expect(a.extraPersonen).toHaveLength(3)
  })
  it("leest ook platte tekst", () => {
    const t = leesVelden({ tekst: "voornaam: Piet\naankomstdatum: 17-10-2026\nkenteken auto: ab-12-cd" })
    expect(maakAanmelding(t)).toMatchObject({ voornaam: "Piet", aankomst: "2026-10-17", kenteken: "AB-12-CD" })
  })
  it("telt volwassenen en minderjarigen op de aankomstdatum", () => {
    // Kim wordt op 18-10-2026 achttien: bij aankomst op 17-10 nog minderjarig.
    expect(telPersonen(a, "2026-10-17")).toEqual({ volwassenen: 3, kinderen: 1, onbekend: 1 })
    expect(telPersonen(a, "2026-10-18")).toEqual({ volwassenen: 4, kinderen: 0, onbekend: 1 })
  })
  it("rekent leeftijden goed rond verjaardagen", () => {
    expect(leeftijdOp("2010-10-18", "2028-10-17")).toBe(17)
    expect(leeftijdOp("2010-10-18", "2028-10-18")).toBe(18)
    expect(leeftijdOp("2008-02-29", "2026-02-28")).toBe(17)
  })
  it("koppelt bij voorkeur op boekingscode, anders op e-mail en datums", () => {
    const boekingen = [
      { id: "x", code: "Ander", aankomst: "2026-10-17", vertrek: "2026-10-26", email: "", status: "bevestigd" },
      { id: "y", code: "AbCdEf123", aankomst: "2026-10-17", vertrek: "2026-10-26", email: "anna@example.com", status: "bevestigd" },
      { id: "z", code: "Nog1", aankomst: "2026-08-01", vertrek: "2026-08-08", email: "anna@example.com", status: "aanvraag" },
      { id: "w", code: "Weg", aankomst: "2026-10-17", vertrek: "2026-10-26", email: "anna@example.com", status: "geannuleerd" },
    ]
    const k = zoekBoeking(a, boekingen)
    expect(k.map((x) => [x.boekingId, x.score])).toEqual([["y", 100], ["x", 60], ["z", 40]])
    const zonderCode = zoekBoeking({ ...a, boekingscode: "" }, boekingen)
    expect(zonderCode[0]).toMatchObject({ boekingId: "y", score: 80 })
  })
})

describe("bestandsnamen voor Drive", () => {
  it("maakt nette namen en mappen", () => {
    expect(factuurBestandsnaam("2026-006", "de Testvrouw")).toBe("2026-006 de Testvrouw.pdf")
    expect(factuurBestandsnaam("2026-007", "Jansen", true)).toBe("2026-007 Jansen (credit).pdf")
    expect(veiligeNaam('a/b:c*?"<>|d')).toBe("abcd")
    expect(factuurMap("", "2026-006")).toEqual(["Duc'dalf verhuurbeheer", "Facturen", "2026"])
  })
})

import { bewaargrens, teAnonimiseren } from "./avg"

describe("AVG", () => {
  it("bepaalt de bewaargrens", () => {
    expect(bewaargrens("2026-10-12", 7)).toBe("2019-10-12")
  })
  it("selecteert alleen huurders waarvan alle verblijven buiten de termijn liggen", () => {
    const huurders = [
      { id: "oud", geanonimiseerd_op: "" },
      { id: "terugkerend", geanonimiseerd_op: "" },
      { id: "al", geanonimiseerd_op: "2025-01-01 00:00:00.000Z" },
      { id: "nooit", geanonimiseerd_op: "" },
    ]
    const boekingen = [
      { huurder: "oud", vertrek: "2018-07-12", status: "afgerond" },
      { huurder: "terugkerend", vertrek: "2018-07-12", status: "afgerond" },
      { huurder: "terugkerend", vertrek: "2026-08-08", status: "afgerond" },
      { huurder: "al", vertrek: "2017-01-01", status: "afgerond" },
    ]
    expect(teAnonimiseren(huurders, boekingen, "2026-10-12", 7)).toEqual(["oud"])
  })
})


describe("eigen verblijven uit Google Agenda", () => {
  const items = [
    { id: "a", summary: "Familie in Duc'dalf", start: { date: "2026-05-01" }, end: { date: "2026-05-08" } },
    { id: "b", summary: "Tandarts", start: { dateTime: "2026-05-03T10:00:00+02:00" }, end: { dateTime: "2026-05-03T11:00:00+02:00" } },
    { id: "c", summary: "Huurder Jansen", start: { date: "2026-07-04" }, end: { date: "2026-07-11" } },
    { id: "d", summary: "Eigen gebruik", start: { date: "2026-09-01" }, end: { date: "2026-09-05" }, status: "cancelled" },
    { id: "e", summary: "Zelf", start: { dateTime: "2026-10-10T15:00:00+02:00" }, end: { dateTime: "2026-10-12T10:00:00+02:00" } },
  ]
  const boekingen = [{ aankomst: "2026-07-04", vertrek: "2026-07-11" }]
  it("neemt afspraken van minstens één nacht, zonder dubbele boekingen of geannuleerde", () => {
    expect(eigenVerblijven(items, "", boekingen).map((v) => v.id)).toEqual(["a", "e"])
    expect(eigenVerblijven(items, "", boekingen)[1]).toMatchObject({ aankomst: "2026-10-10", vertrek: "2026-10-12" })
  })
  it("filtert op woorden in de titel", () => {
    expect(eigenVerblijven(items, "familie, zelf", boekingen).map((v) => v.id)).toEqual(["a", "e"])
    expect(eigenVerblijven(items, "Familie", boekingen).map((v) => v.id)).toEqual(["a"])
  })
})
