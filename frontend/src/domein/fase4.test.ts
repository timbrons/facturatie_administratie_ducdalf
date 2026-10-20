import { describe, expect, it } from "vitest"
import { leeftijdOp, maakAanmelding, telPersonen, zoekBoeking } from "./aanmelding"
import { factuurBestandsnaam, factuurMap, veiligeNaam } from "./bestandsnamen"
import { agendaAfspraak, eigenVerblijven, verblijfGroepen } from "./agenda"

// Fictieve inzending zoals het aanmeldformulier hem opslaat (aanmeldingen.velden).
const VELDEN: Record<string, string> = {
  boekingscode: "AbCdEf123", aankomstdatum: "2026-10-17", vertrekdatum: "2026-10-26", aantal_personen: "4",
  aanhef: "Mevr.", voornaam: "Anna", achternaam: "de Testvrouw", adres: "Voorbeeldlaan 1", postcode: "1234 ab",
  plaats: "Utrecht", telefoon_vast: "-", telefoon_mobiel: "06 00 00 00 00", email: "Anna@Example.com",
  kenteken_auto: "ts-001-a", geboortedatum: "1980-01-01", geboorteplaats: "Utrecht",
  extra_persoon_1_naam: "Bram de Testvrouw", extra_persoon_1_geboortedatum: "1979-05-05",
  extra_persoon_2_naam: "Kim", extra_persoon_2_geboortedatum: "2008-10-18",
  extra_persoon_3_naam: "Sam", extra_persoon_3_geboortedatum: "",
  noodcontact_naam: "Opa & Oma", opmerkingen: "We komen 's avonds aan.",
}

describe("aanmeldformulier", () => {
  const a = maakAanmelding(VELDEN)
  it("zet de velden om naar een aanmelding", () => {
    expect(a).toMatchObject({
      boekingscode: "AbCdEf123", aankomst: "2026-10-17", vertrek: "2026-10-26", aantalPersonen: 4,
      voornaam: "Anna", achternaam: "de Testvrouw", postcode: "1234 AB", email: "anna@example.com",
      kenteken: "TS-001-A", telefoonVast: "", opmerkingen: "We komen 's avonds aan.",
    })
    expect(a.noodcontact.naam).toBe("Opa & Oma")
    expect(a.extraPersonen).toHaveLength(3)
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
  // Hele dagen: in Google 1 t/m 7 mei geblokkeerd = einde 8 mei (exclusief); vertrek 7 mei.
  const items = [
    { id: "a", summary: "Familie in Duc'dalf", start: { date: "2026-05-01" }, end: { date: "2026-05-08" } },
    { id: "b", summary: "Tandarts", start: { dateTime: "2026-05-03T10:00:00+02:00" }, end: { dateTime: "2026-05-03T11:00:00+02:00" } },
    { id: "c", summary: "Huurder Jansen", start: { date: "2026-07-04" }, end: { date: "2026-07-12" } },
    { id: "d", summary: "Eigen gebruik", start: { date: "2026-09-01" }, end: { date: "2026-09-05" }, status: "cancelled" },
    { id: "e", summary: "Zelf", start: { dateTime: "2026-10-10T15:00:00+02:00" }, end: { dateTime: "2026-10-12T10:00:00+02:00" } },
    { id: "f", summary: "Eén dag", start: { date: "2026-06-01" }, end: { date: "2026-06-02" } },
    { id: "g", summary: "Vakantie", start: { date: "2026-08-01" }, end: { date: "2026-08-04" }, extendedProperties: { private: { ducdalf: "eigen-verblijf" } } },
  ]
  const boekingen = [{ aankomst: "2026-07-04", vertrek: "2026-07-11" }]
  it("neemt afspraken van minstens één nacht, zonder huurders of geannuleerde", () => {
    const v = eigenVerblijven(items, "", boekingen)
    expect(v.map((x) => x.id)).toEqual(["a", "g", "e"])
    expect(v[0]).toMatchObject({ aankomst: "2026-05-01", vertrek: "2026-05-07" })
    expect(v[2]).toMatchObject({ aankomst: "2026-10-10", vertrek: "2026-10-12" })
  })
  it("ziet huurboekingen die de app zelf in de agenda zet niet als eigen verblijf", () => {
    const metBoeking = [...items, { id: "b", summary: "Verhuur – Fam. Test", start: { date: "2026-11-01" }, end: { date: "2026-11-09" }, extendedProperties: { private: { ducdalf: "boeking" } } }]
    expect(eigenVerblijven(metBoeking, "", []).map((x) => x.id)).not.toContain("b")
  })
  it("filtert op woorden in de titel; afspraken uit de app tellen altijd", () => {
    expect(eigenVerblijven(items, "familie, zelf", boekingen).map((x) => x.id)).toEqual(["a", "g", "e"])
    expect(eigenVerblijven(items, "Familie", boekingen).map((x) => x.id)).toEqual(["a", "g"])
  })
  it("schrijft een afspraak die terugleest als dezelfde periode", () => {
    const a = agendaAfspraak({ titel: "Eigen verblijf", aankomst: "2026-08-01", vertrek: "2026-08-08" })
    expect(a.start.date).toBe("2026-08-01")
    expect(a.end.date).toBe("2026-08-09")
    expect(eigenVerblijven([{ id: "x", ...a }], "", [])[0]).toMatchObject({ aankomst: "2026-08-01", vertrek: "2026-08-08", vanApp: true })
  })
  it("zet het gezin in de titel en de kleur, en leest titel en gezin apart terug", () => {
    const groepen = verblijfGroepen("Gezin A\n\n  Gezin B  \n")
    expect(groepen).toEqual(["Gezin A", "Gezin B"])
    const a = agendaAfspraak({ titel: "Eigen verblijf", aankomst: "2026-08-01", vertrek: "2026-08-08", groep: "Gezin B" }, groepen)
    expect(a.summary).toBe("Eigen verblijf – Gezin B")
    expect(a.colorId).toBe("6")
    expect(eigenVerblijven([{ id: "x", ...a }], "", [])[0]).toMatchObject({ titel: "Eigen verblijf", groep: "Gezin B" })
    const zonder = agendaAfspraak({ titel: "Klusweek", aankomst: "2026-08-01", vertrek: "2026-08-08" }, groepen)
    expect(zonder.summary).toBe("Klusweek")
    expect(zonder.colorId).toBeNull()
    expect(eigenVerblijven([{ id: "y", ...zonder }], "", [])[0]).toMatchObject({ titel: "Klusweek", groep: "" })
  })
  it("een verblijf in een gehuurd huis houdt ons huis vrij en bewaart de huurkosten", () => {
    const a = agendaAfspraak({ titel: "Eigen verblijf", aankomst: "2026-07-11", vertrek: "2026-07-18", groep: "Gezin B", anderHuis: true, huurkosten_cent: 95_000, betaaldDoor: "Gezin A" })
    expect(a.summary).toBe("Eigen verblijf – Gezin B (gehuurd huis)")
    expect(a.transparency).toBe("transparent")
    expect(eigenVerblijven([{ id: "z", ...a }], "", [])[0]).toMatchObject({ titel: "Eigen verblijf", groep: "Gezin B", anderHuis: true, huurkosten_cent: 95_000, betaaldDoor: "Gezin A" })
    const gewoon = agendaAfspraak({ titel: "Eigen verblijf", aankomst: "2026-07-11", vertrek: "2026-07-18", groep: "Gezin B" })
    expect(gewoon.transparency).toBe("opaque")
    expect(gewoon.extendedProperties.private.ander_huis).toBe("")
    expect(eigenVerblijven([{ id: "w", ...gewoon }], "", [])[0]).toMatchObject({ anderHuis: false, huurkosten_cent: 0 })
  })
})
