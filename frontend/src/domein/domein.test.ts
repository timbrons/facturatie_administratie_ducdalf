import { describe, expect, it } from "vitest"
import { dagenTussen, formatKort, formatLang, nachten, plusMaanden, isIsoDatum } from "./datum"
import { formatEuro, parseEuro, rondAf } from "./geld"
import { berekenHuur, berekenPrijsopbouw, seizoenVoorNacht, type Seizoen } from "./prijs"
import { berekenToeristenbelasting, tariefOpDatum, type TbTarief } from "./toeristenbelasting"
import { aanbetalingZinvol, berekenTermijnen } from "./betaling"
import { formatFactuurnummer, normaliseerFactuurnummer, parseFactuurnummer, volgendFactuurnummer } from "./factuurnummer"
import { overgangFout, stappenbalk, stappenVoor, volgendeStap, type WorkflowStap } from "./workflow"
import { alleOverlappen, overlapt } from "./overlap"
import { bouwActielijst, tbAangifteDeadline, tbPeriode } from "./actielijst"

// Seizoenen 2026 zoals op de website (weekprijzen incl. parkkosten / 7)
const SEIZOENEN_2026: Seizoen[] = [
  { naam: "Laagseizoen", van: "2026-01-01", tot: "2026-04-24", prijs_per_nacht_cent: 9500, min_nachten: 7 },
  { naam: "Middenseizoen", van: "2026-04-24", tot: "2026-07-10", prijs_per_nacht_cent: 12800, min_nachten: 7 },
  { naam: "Hoogseizoen", van: "2026-07-10", tot: "2026-09-04", prijs_per_nacht_cent: 15700, min_nachten: 7 },
  { naam: "Middenseizoen", van: "2026-09-04", tot: "2026-10-16", prijs_per_nacht_cent: 12800, min_nachten: 7 },
  { naam: "Laagseizoen", van: "2026-10-16", tot: "2026-12-31", prijs_per_nacht_cent: 9500, min_nachten: 7 },
]

const INSTELLINGEN = { schoonmaak_cent: 6400, parkkosten_per_nacht_cent: 1000, parkkosten_apart_op_factuur: true }

const TARIEF_2026: TbTarief = {
  geldig_vanaf: "2026-01-01",
  percentage_bp: 500,
  plafond_cent: 400,
  opslagen: [
    { naam: "Hérault", bp: 1000 },
    { naam: "Regio", bp: 3400 },
  ],
}

describe("datums", () => {
  it("formatteert in Nederlands formaat", () => {
    expect(formatLang("2026-10-17")).toBe("17 oktober 2026")
    expect(formatKort("2026-06-27")).toBe("27-6-2026")
  })
  it("telt nachten", () => {
    expect(dagenTussen("2026-10-17", "2026-10-26")).toBe(9)
    expect(nachten("2026-10-17", "2026-10-20")).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"])
  })
  it("telt maanden op en klemt op het einde van de maand", () => {
    expect(plusMaanden("2026-05-27", 1)).toBe("2026-06-27")
    expect(plusMaanden("2026-01-31", 1)).toBe("2026-02-28")
    expect(plusMaanden("2026-12-15", 1)).toBe("2027-01-15")
  })
  it("controleert geldige datums", () => {
    expect(isIsoDatum("2026-02-30")).toBe(false)
    expect(isIsoDatum("2026-02-28")).toBe(true)
  })
  it("werkt over de zomertijdwissel heen", () => {
    expect(dagenTussen("2026-03-28", "2026-03-30")).toBe(2)
    expect(dagenTussen("2026-10-24", "2026-10-26")).toBe(2)
  })
})

describe("geld", () => {
  it("formatteert in euro's met Nederlandse notatie", () => {
    expect(formatEuro(108100)).toBe("€ 1.081,00")
    expect(formatEuro(54050)).toBe("€ 540,50")
    expect(formatEuro(6400)).toBe("€ 64,00")
    expect(formatEuro(123456789)).toBe("€ 1.234.567,89")
    expect(formatEuro(0)).toBe("€ 0,00")
  })
  it("leest bedragen in", () => {
    expect(parseEuro("1.081,00")).toBe(108100)
    expect(parseEuro("€ 64,5")).toBe(6450)
    expect(parseEuro("27.00")).toBe(2700)
    expect(parseEuro("1081")).toBe(108100)
    expect(parseEuro("1.081")).toBe(108100)
    expect(parseEuro("abc")).toBeNull()
    expect(parseEuro("")).toBeNull()
  })
  it("rondt half naar boven af", () => {
    expect(rondAf(55, 2)).toBe(28)
    expect(rondAf(54, 2)).toBe(27)
  })
})

describe("prijsberekening", () => {
  it("gebruikt per nacht het juiste seizoen, ook over een seizoensovergang", () => {
    // 6 t/m 13 juli: 4 nachten midden (6,7,8,9), 3 nachten hoog (10,11,12)
    const h = berekenHuur("2026-07-06", "2026-07-13", SEIZOENEN_2026)
    expect(h.nachten).toBe(7)
    expect(h.perNacht.filter((n) => n.seizoen === "Middenseizoen")).toHaveLength(4)
    expect(h.perNacht.filter((n) => n.seizoen === "Hoogseizoen")).toHaveLength(3)
    expect(h.totaalCent).toBe(4 * 12800 + 3 * 15700)
    expect(h.ontbrekend).toEqual([])
  })
  it("laat een grensdatum bij het nieuwe seizoen horen", () => {
    expect(seizoenVoorNacht("2026-04-24", SEIZOENEN_2026)?.naam).toBe("Middenseizoen")
    expect(seizoenVoorNacht("2026-04-23", SEIZOENEN_2026)?.naam).toBe("Laagseizoen")
    expect(seizoenVoorNacht("2026-10-16", SEIZOENEN_2026)?.naam).toBe("Laagseizoen")
  })
  it("een week laagseizoen kost de weekprijs van de website", () => {
    const p = berekenPrijsopbouw({ aankomst: "2026-11-07", vertrek: "2026-11-14", seizoenen: SEIZOENEN_2026, instellingen: INSTELLINGEN })
    // € 665 per week incl. parkkosten → huur € 595 + parkkosten € 70
    expect(p.huurCent + p.parkkostenCent).toBe(66500)
    expect(p.parkkostenCent).toBe(7000)
    expect(p.huurCent).toBe(59500)
    expect(p.schoonmaakCent).toBe(6400)
  })
  it("meldt nachten zonder seizoen", () => {
    const h = berekenHuur("2026-12-30", "2027-01-02", SEIZOENEN_2026)
    expect(h.ontbrekend).toEqual(["2027-01-01"])
  })
  it("berekent extra's per stuk en per nacht", () => {
    const p = berekenPrijsopbouw({
      aankomst: "2026-11-07", vertrek: "2026-11-14", seizoenen: SEIZOENEN_2026, instellingen: INSTELLINGEN,
      extras: [
        { naam: "Linnenpakket 2 personen", aantal: 2, prijs_cent: 2500, eenheid: "per_stuk" },
        { naam: "Iets per nacht", aantal: 1, prijs_cent: 100, eenheid: "per_nacht" },
        { naam: "Niet gekozen", aantal: 0, prijs_cent: 600, eenheid: "per_stuk" },
      ],
    })
    expect(p.extras.map((e) => e.bedragCent)).toEqual([5000, 700])
    expect(p.totaalCent).toBe(59500 + 7000 + 6400 + 5000 + 700)
  })
})

describe("testcase factuur 2026-004", () => {
  const p = berekenPrijsopbouw({
    aankomst: "2026-10-17",
    vertrek: "2026-10-26",
    seizoenen: SEIZOENEN_2026,
    instellingen: INSTELLINGEN,
    huurHandmatigCent: 90000, // afwijkende afspraak
    toeristenbelastingCent: 2700, // bedrag uit de simulatie in het portaal
  })
  it("klopt per post en in totaal", () => {
    expect(p.nachten).toBe(9)
    expect(p.huurCent).toBe(90000)
    expect(p.huurHandmatig).toBe(true)
    expect(p.schoonmaakCent).toBe(6400)
    expect(p.parkkostenCent).toBe(9000)
    expect(p.toeristenbelastingCent).toBe(2700)
    expect(p.totaalCent).toBe(108100)
    expect(formatEuro(p.totaalCent)).toBe("€ 1.081,00")
  })
  it("heeft de juiste aanbetaling, restbetaling en vervaldatums", () => {
    const t = berekenTermijnen({
      totaalCent: p.totaalCent,
      betaalwijze: "aanbetaling",
      aanbetalingPct: 50,
      factuurdatum: "2026-05-27",
      aankomst: "2026-10-17",
      aanbetalingTermijnMaanden: 1,
      restWekenVoorAankomst: 4,
    })
    expect(t.aanbetalingCent).toBe(54050)
    expect(t.restCent).toBe(54050)
    expect(t.aanbetalingVervaldatum).toBe("2026-06-27")
    expect(t.restVervaldatum).toBe("2026-09-19")
    expect(formatLang(t.restVervaldatum)).toBe("19 september 2026")
  })
})

describe("betaaltermijnen", () => {
  it("geeft de cent-afronding aan de restbetaling", () => {
    const t = berekenTermijnen({
      totaalCent: 100001, betaalwijze: "aanbetaling", aanbetalingPct: 50, factuurdatum: "2026-05-01",
      aankomst: "2026-10-01", aanbetalingTermijnMaanden: 1, restWekenVoorAankomst: 4,
    })
    expect(t.aanbetalingCent + t.restCent).toBe(100001)
  })
  it("betaling ineens vervalt na de termijn, maar uiterlijk 4 weken voor aankomst", () => {
    const t = berekenTermijnen({
      totaalCent: 50000, betaalwijze: "ineens", aanbetalingPct: 50, factuurdatum: "2026-08-01",
      aankomst: "2026-08-30", aanbetalingTermijnMaanden: 1, restWekenVoorAankomst: 4,
    })
    expect(t.aanbetalingCent).toBe(0)
    expect(t.restCent).toBe(50000)
    expect(t.restVervaldatum).toBe("2026-08-02")
  })
  it("ziet wanneer een aanbetaling geen zin heeft", () => {
    expect(aanbetalingZinvol("2026-05-27", "2026-10-17", 1, 4)).toBe(true)
    expect(aanbetalingZinvol("2026-09-01", "2026-10-01", 1, 4)).toBe(false)
  })
})

describe("toeristenbelasting (rekenblad Grand Pic Saint-Loup 2026)", () => {
  it("klopt met het voorbeeld uit het rekenblad (Astrid, 28 nachten, € 100 per nacht)", () => {
    const r = berekenToeristenbelasting({ verblijfskostenCent: 280000, nachten: 28, volwassenen: 2, kinderen: 0 }, TARIEF_2026)
    expect(r.basistariefCent).toBe(250)
    expect(r.opslagen.map((o) => o.cent)).toEqual([25, 85])
    expect(r.tariefPerPersoonPerNachtCent).toBe(360)
    expect(r.totaalCent).toBe(20160)
  })
  it("rondt elke opslag apart af", () => {
    // € 110 per nacht, 2 personen: basis 2,75; +0,275 → 0,28; +0,935 → 0,94 → 3,97
    const r = berekenToeristenbelasting({ verblijfskostenCent: 99000, nachten: 9, volwassenen: 2, kinderen: 0 }, TARIEF_2026)
    expect(r.tariefPerPersoonPerNachtCent).toBe(397)
    expect(r.totaalCent).toBe(397 * 2 * 9)
  })
  it("kinderen tellen mee als bewoner maar zijn vrijgesteld", () => {
    // € 128 per nacht, 2 volw + 2 kinderen → € 32 p.p.p.n. → basis 1,60
    const r = berekenToeristenbelasting({ verblijfskostenCent: 12800 * 7, nachten: 7, volwassenen: 2, kinderen: 2 }, TARIEF_2026)
    expect(r.basistariefCent).toBe(160)
    expect(r.tariefPerPersoonPerNachtCent).toBe(160 + 16 + 54)
    expect(r.totaalCent).toBe(230 * 2 * 7)
  })
  it("topt het basistarief af op het plafond, vóór de opslagen", () => {
    const r = berekenToeristenbelasting({ verblijfskostenCent: 50000 * 7, nachten: 7, volwassenen: 1, kinderen: 0 }, TARIEF_2026)
    expect(r.afgetopt).toBe(true)
    expect(r.basistariefCent).toBe(400)
    expect(r.tariefPerPersoonPerNachtCent).toBe(400 + 40 + 136)
  })
  it("kiest het tarief dat op de datum geldt", () => {
    const later = { ...TARIEF_2026, geldig_vanaf: "2027-01-01", percentage_bp: 600 }
    expect(tariefOpDatum([TARIEF_2026, later], "2026-12-31")?.percentage_bp).toBe(500)
    expect(tariefOpDatum([TARIEF_2026, later], "2027-03-01")?.percentage_bp).toBe(600)
    expect(tariefOpDatum([later], "2026-06-01")).toBeNull()
  })
})

describe("factuurnummering", () => {
  it("nummert doorlopend per jaar", () => {
    expect(formatFactuurnummer(2026, 4)).toBe("2026-004")
    expect(volgendFactuurnummer(2026, 5)).toBe("2026-006")
    expect(volgendFactuurnummer(2027, 0)).toBe("2027-001")
    expect(formatFactuurnummer(2026, 1234)).toBe("2026-1234")
  })
  it("leest oude notaties", () => {
    expect(parseFactuurnummer("2026 - 002")).toEqual({ jaar: 2026, volgnummer: 2 })
    expect(normaliseerFactuurnummer("2026 - 002")).toBe("2026-002")
    expect(parseFactuurnummer("factuur")).toBeNull()
  })
})

const STAPPEN: WorkflowStap[] = [
  "aanvraag", "in_afstemming", "bevestigd", "aanmeldformulier_verstuurd", "aanmeldformulier_ontvangen",
  "brochure_verstuurd", "tb_berekend", "factuur_verstuurd", "aanbetaling_ontvangen", "volledig_betaald",
  "verblijf", "tb_aangegeven", "afgerond",
].map((sleutel, i) => ({
  sleutel,
  label: sleutel,
  actie_label: `Doe ${sleutel}`,
  volgorde: (i + 1) * 10,
  overslaan_als: sleutel === "aanbetaling_ontvangen" ? "geen_aanbetaling" : "",
  actief: true,
}))

describe("workflow", () => {
  it("slaat de aanbetaling over bij betaling ineens", () => {
    const b = { status: "factuur_verstuurd", betaalwijze: "ineens" }
    expect(stappenVoor(STAPPEN, b).map((s) => s.sleutel)).not.toContain("aanbetaling_ontvangen")
    expect(volgendeStap(STAPPEN, b)?.sleutel).toBe("volledig_betaald")
  })
  it("neemt de aanbetaling mee als die is afgesproken", () => {
    expect(volgendeStap(STAPPEN, { status: "factuur_verstuurd", betaalwijze: "aanbetaling" })?.sleutel).toBe("aanbetaling_ontvangen")
  })
  it("geeft geen volgende stap bij geannuleerd of afgerond", () => {
    expect(volgendeStap(STAPPEN, { status: "geannuleerd" })).toBeNull()
    expect(volgendeStap(STAPPEN, { status: "afgerond" })).toBeNull()
  })
  it("staat afronden pas toe na registratie van de aangifte", () => {
    expect(overgangFout(STAPPEN, { status: "tb_aangegeven" }, "afgerond")).toMatch(/aangifte/)
    expect(overgangFout(STAPPEN, { status: "tb_aangegeven", tb_aangegeven_op: "2026-11-10" }, "afgerond")).toBeNull()
  })
  it("annuleren kan vanaf elke stap", () => {
    expect(overgangFout(STAPPEN, { status: "bevestigd" }, "geannuleerd")).toBeNull()
    expect(overgangFout(STAPPEN, { status: "verblijf" }, "geannuleerd")).toBeNull()
  })
  it("respecteert een aangepaste volgorde uit de configuratie", () => {
    const anders = STAPPEN.map((s) => (s.sleutel === "brochure_verstuurd" ? { ...s, volgorde: 25 } : s))
    expect(volgendeStap(anders, { status: "in_afstemming" })?.sleutel).toBe("brochure_verstuurd")
  })
  it("toont de stappenbalk met gedaan/huidig/overgeslagen", () => {
    const balk = stappenbalk(STAPPEN, { status: "factuur_verstuurd", betaalwijze: "ineens" })
    expect(balk.find((s) => s.stap.sleutel === "aanvraag")?.toestand).toBe("gedaan")
    expect(balk.find((s) => s.stap.sleutel === "factuur_verstuurd")?.toestand).toBe("huidig")
    expect(balk.find((s) => s.stap.sleutel === "aanbetaling_ontvangen")?.toestand).toBe("overgeslagen")
    expect(balk.find((s) => s.stap.sleutel === "afgerond")?.toestand).toBe("open")
  })
})

describe("overlap", () => {
  it("wisselen op dezelfde dag is geen overlap", () => {
    expect(overlapt({ aankomst: "2026-08-01", vertrek: "2026-08-08" }, { aankomst: "2026-08-08", vertrek: "2026-08-15" })).toBe(false)
    expect(overlapt({ aankomst: "2026-08-01", vertrek: "2026-08-09" }, { aankomst: "2026-08-08", vertrek: "2026-08-15" })).toBe(true)
  })
  it("vindt alle overlappende paren", () => {
    const paren = alleOverlappen([
      { id: "a", aankomst: "2026-08-02", vertrek: "2026-08-08" },
      { id: "b", aankomst: "2026-08-08", vertrek: "2026-08-15" },
      { id: "c", aankomst: "2026-08-07", vertrek: "2026-08-10" },
    ])
    expect(paren.map(([x, y]) => x.id + y.id).sort()).toEqual(["ac", "cb"])
  })
})

describe("toeristenbelasting: aangifteperiode en deadline", () => {
  it("geeft de maand van de laatste nacht", () => {
    expect(tbPeriode("2026-10-26")).toBe("2026-10")
    expect(tbPeriode("2026-11-01")).toBe("2026-10")
  })
  it("deadline is de ingestelde dag van de maand erna", () => {
    expect(tbAangifteDeadline("2026-10-26", 15)).toBe("2026-11-15")
    expect(tbAangifteDeadline("2026-12-20", 15)).toBe("2027-01-15")
  })
})

describe("actielijst", () => {
  const inst = { herinnering_rest_dagen: 7, aankomst_vooruit_dagen: 14, tb_aangifte_dag: 15 }
  const basis = { naam: "Fam. Testman", betaalwijze: "aanbetaling" }

  it("meldt een vervallen aanbetaling in het rood", () => {
    const acties = bouwActielijst(
      [{ ...basis, id: "1", status: "factuur_verstuurd", aankomst: "2026-10-17", vertrek: "2026-10-26", aanbetaling_vervaldatum: "2026-06-27", rest_vervaldatum: "2026-09-19" }],
      STAPPEN, inst, "2026-07-01",
    )
    expect(acties[0]).toMatchObject({ soort: "aanbetaling", urgentie: "rood" })
  })
  it("meldt een restbetaling die binnen 7 dagen vervalt", () => {
    const acties = bouwActielijst(
      [{ ...basis, id: "1", status: "aanbetaling_ontvangen", aankomst: "2026-10-17", vertrek: "2026-10-26", rest_vervaldatum: "2026-09-19" }],
      STAPPEN, inst, "2026-09-14",
    )
    expect(acties.find((a) => a.soort === "restbetaling")?.urgentie).toBe("oranje")
  })
  it("meldt aankomsten in de komende 14 dagen", () => {
    const acties = bouwActielijst(
      [{ ...basis, id: "1", status: "volledig_betaald", aankomst: "2026-10-17", vertrek: "2026-10-26" }],
      STAPPEN, inst, "2026-10-12",
    )
    expect(acties.some((a) => a.soort === "aankomst")).toBe(true)
  })
  it("zet een te late aangifte toeristenbelasting op rood", () => {
    const acties = bouwActielijst(
      [{ ...basis, id: "1", status: "verblijf", aankomst: "2026-10-17", vertrek: "2026-10-26" }],
      STAPPEN, inst, "2026-11-20",
    )
    expect(acties.find((a) => a.soort === "tb_aangifte")?.urgentie).toBe("rood")
  })
  it("meldt overlappende boekingen", () => {
    const acties = bouwActielijst(
      [
        { ...basis, id: "1", status: "bevestigd", aankomst: "2026-11-01", vertrek: "2026-11-08" },
        { ...basis, id: "2", naam: "Fam. Ander", status: "aanvraag", aankomst: "2026-11-05", vertrek: "2026-11-12" },
      ],
      STAPPEN, inst, "2026-10-12",
    )
    expect(acties.some((a) => a.soort === "overlap")).toBe(true)
  })
  it("negeert geannuleerde en afgeronde boekingen", () => {
    const acties = bouwActielijst(
      [{ ...basis, id: "1", status: "geannuleerd", aankomst: "2026-10-17", vertrek: "2026-10-26" }],
      STAPPEN, inst, "2026-10-12",
    )
    expect(acties).toEqual([])
  })
})
