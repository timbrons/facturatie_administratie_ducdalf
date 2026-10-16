import { describe, expect, it } from "vitest"
import { betaalstatus, betaaltekst, bouwFactuurregels, openstaand, totaalVan, type StatusFactuur } from "./factuur"
import { berekenTermijnen } from "./betaling"
import { csvBedrag, leesCsv, schrijfCsv } from "./csv"
import { importPlan, importRegels, leesAdministratie, leesDatum } from "./importeren"
import { financieelOverzicht, parkkostenOverzicht, tbOverzicht } from "./financieel"

const TESTCASE = {
  aankomst: "2026-10-17", vertrek: "2026-10-26", volwassenen: 2, nachten: 9,
  huur_cent: 90000, parkkosten_cent: 9000, schoonmaak_cent: 6400, extras: null, tb_portaal_cent: 2700,
}

describe("factuurregels (testcase 2026-004)", () => {
  const regels = bouwFactuurregels(TESTCASE)
  it("heeft de posten van de voorbeeldfactuur", () => {
    expect(regels.map((r) => [r.omschrijving, r.nachten ?? null, r.personen ?? null, r.bedrag_cent])).toEqual([
      ["Huur", 9, null, 90000],
      ["Eindschoonmaak", null, null, 6400],
      ["Parkkosten", null, null, 9000],
      ["Toeristenbelasting", 9, 2, 2700],
    ])
    expect(totaalVan(regels)).toBe(108100)
  })
  it("heeft de juiste betaaltekst", () => {
    const t = berekenTermijnen({ totaalCent: 108100, betaalwijze: "aanbetaling", aanbetalingPct: 50, factuurdatum: "2026-05-27", aankomst: "2026-10-17", aanbetalingTermijnMaanden: 1, restWekenVoorAankomst: 4 })
    expect(betaaltekst(t, 50, 4)).toBe(
      "Graag 50% van het factuurbedrag (€ 540,50) vóór 27-6-2026 voldoen en het resterende bedrag (€ 540,50) uiterlijk 19-9-2026 (4 weken voor aankomst).",
    )
  })
  it("neemt extra's mee", () => {
    const r = bouwFactuurregels({ ...TESTCASE, extras: [{ naam: "Linnenpakket 2 personen", aantal: 2, prijs_cent: 2500, eenheid: "per_stuk" }] })
    expect(r.find((x) => x.soort === "extra")).toMatchObject({ omschrijving: "Linnenpakket 2 personen (2×)", bedrag_cent: 5000 })
  })
})

describe("betaalstatus", () => {
  const f: StatusFactuur = { id: "f1", nummer: "2026-004", totaal_cent: 108100, aanbetaling_cent: 54050, aanbetaling_vervaldatum: "2026-06-27", rest_vervaldatum: "2026-09-19" }
  it("open, deels betaald, betaald en vervallen", () => {
    expect(betaalstatus(f, [f], 0, "2026-06-01")).toBe("open")
    expect(betaalstatus(f, [f], 0, "2026-07-01")).toBe("vervallen")
    expect(betaalstatus(f, [f], 54050, "2026-07-01")).toBe("deels betaald")
    expect(betaalstatus(f, [f], 54050, "2026-09-20")).toBe("vervallen")
    expect(betaalstatus(f, [f], 108100, "2026-09-20")).toBe("betaald")
  })
  it("concept en geannuleerd", () => {
    expect(betaalstatus({ ...f, nummer: "" }, [f], 0, "2026-06-01")).toBe("concept")
    const g: StatusFactuur = { ...f, geannuleerd_op: "2026-06-15" }
    expect(betaalstatus(g, [g], 0, "2026-07-01")).toBe("geannuleerd")
    // Niets meer open, ook niet als er al een aanbetaling was.
    expect(openstaand([g], 54050)).toBe(0)
    // Nieuwe factuur na annulering: alleen die telt.
    const n: StatusFactuur = { ...f, id: "f2", nummer: "2026-009", totaal_cent: 90000 }
    expect(openstaand([g, n], 54050)).toBe(35950)
    expect(betaalstatus(n, [g, n], 54050, "2026-06-01")).toBe("deels betaald")
  })
})

describe("csv", () => {
  it("leest puntkomma's en aanhalingstekens", () => {
    expect(leesCsv('a;b\n"x; y";"z ""q"""\n')).toEqual([["a", "b"], ["x; y", 'z "q"']])
  })
  it("leest komma's", () => {
    expect(leesCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]])
  })
  it("schrijft voor Nederlandse Excel", () => {
    expect(schrijfCsv([["a", "b;c"], [1, csvBedrag(108100)]])).toBe('﻿a;"b;c"\r\n1;1081,00\r\n')
    expect(csvBedrag(-2700)).toBe("-27,00")
  })
})

// Fictieve regels in de opbouw van de bestaande Google Sheet.
const SHEET = `Volgnummer,Datum en tijd aanvraag,Factuurnr,Naam,E-mail,Aankomstdatum,Vertrekdatum,Nachten,Personen,Volwassenen,Prijs per nacht,Linnenpakket 1 persoon,Linnenpakket 2 personen,Kosten linnenpakketten,Parkkosten,Schoonmaakkosten,Toeristenbelasting,Totaalprijs,Opmerkingen,Betaalstatus
1,nvt,2025-001,Jan Testpersoon,,05-07-2025,12-07-2025,7,4,2,140,0,0,0,0,0,14,994,nvt,Betaald
2,1-5-2026,2026 - 002,Piet Proef,piet@example.com,13-9-2026,23-9-2026,10,2,2,100,0,1,25,100,64,30,"1.219,00",,Te betalen
3,1-5-2026,2026-003,Kees Fictief,kees@example.com,2026-10-17,2026-10-26,9,2,2,100,0,0,0,90,64,27,1081,1e betaling verwacht 27/6,Aanbetaling voltooid
,,,,,,,,,,,,,,,,,,,`

describe("import bestaande administratie", () => {
  const rijen = leesAdministratie(leesCsv(SHEET), "2026-10-12")
  it("leest alle regels met bedragen in centen", () => {
    expect(rijen).toHaveLength(3)
    expect(rijen[0]).toMatchObject({ factuurnummer: "2025-001", aankomst: "2025-07-05", nachten: 7, volwassenen: 2, kinderen: 2, huurCent: 98000, tbCent: 1400, totaalCent: 99400, betaalstatus: "betaald" })
    expect(rijen[1]).toMatchObject({ factuurnummer: "2026-002", linnen2: 1, linnenCent: 2500, totaalCent: 121900, betaalstatus: "open" })
    expect(rijen[1].waarschuwingen.join(" ")).toMatch(/gelezen als 2026-002/)
    expect(rijen[2]).toMatchObject({ aankomst: "2026-10-17", huurCent: 90000, totaalCent: 108100, betaalstatus: "aanbetaling", voornaam: "Kees", achternaam: "Fictief" })
    expect(rijen.every((r) => r.fouten.length === 0)).toBe(true)
  })
  it("controleert het totaal", () => {
    const fout = leesAdministratie(leesCsv(SHEET.replace("1081,1e", "1080,1e")), "2026-10-12")
    expect(fout[2].waarschuwingen.join(" ")).toMatch(/wijkt af/)
  })
  it("maakt factuurregels die optellen tot het totaal", () => {
    for (const r of rijen) expect(totaalVan(importRegels(r))).toBe(r.totaalCent)
  })
  it("kiest een passende status", () => {
    const opties = { verledenAfronden: true, aanbetalingPct: 50, termijnMaanden: 1, restWeken: 4 }
    expect(importPlan(rijen[0], "2026-10-12", opties)).toMatchObject({ status: "afgerond", betaalwijze: "ineens" })
    expect(importPlan(rijen[0], "2026-10-12", { ...opties, verledenAfronden: false }).status).toBe("verblijf")
    expect(importPlan(rijen[1], "2026-10-12", opties).status).toBe("verblijf")
    const p = importPlan(rijen[2], "2026-10-12", opties)
    expect(p).toMatchObject({ status: "aanbetaling_ontvangen", aanbetalingCent: 54050, restVervaldatum: "2026-09-19", factuurdatum: "2026-05-01" })
    expect(p.betalingen).toEqual([{ soort: "aanbetaling", bedragCent: 54050, datum: "2026-05-01" }])
  })
  it("leest datums in verschillende notaties", () => {
    expect(leesDatum("5-7-2025")).toBe("2025-07-05")
    expect(leesDatum("17/10/2026")).toBe("2026-10-17")
    expect(leesDatum("2026-10-17 00:00:00")).toBe("2026-10-17")
    expect(leesDatum("31-2-2026")).toBeNull()
    expect(leesDatum("nvt")).toBeNull()
  })
})

describe("financieel overzicht", () => {
  const boekingen = [
    { id: "b1", naam: "A", aankomst: "2026-10-17", vertrek: "2026-10-26", status: "afgerond", tb_aangegeven_cent: 2800, tb_aangegeven_op: "2026-11-10", tb_aangifte: "" },
    { id: "b2", naam: "B", aankomst: "2026-08-01", vertrek: "2026-08-08", status: "geannuleerd", tb_aangegeven_cent: 0, tb_aangegeven_op: "", tb_aangifte: "" },
  ]
  const regels = bouwFactuurregels(TESTCASE)
  const facturen = [
    { id: "f1", boeking: "b1", nummer: "2026-004", factuurdatum: "2026-05-27", totaal_cent: 108100, regels },
    { id: "f2", boeking: "b2", nummer: "2026-005", factuurdatum: "2026-05-27", totaal_cent: 50000, regels: [{ soort: "huur" as const, omschrijving: "Huur", bedrag_cent: 50000 }] },
    { id: "f3", boeking: "b2", nummer: "2026-006", factuurdatum: "2026-06-01", totaal_cent: -50000, regels: [{ soort: "huur" as const, omschrijving: "Huur", bedrag_cent: -50000 }] },
    { id: "f4", boeking: "b1", nummer: "", factuurdatum: "2026-06-01", totaal_cent: 999, regels: [] },
  ]
  const betalingen = [{ boeking: "b1", datum: "2026-06-01", bedrag_cent: 54050 }]
  it("splitst uit per post en negeert concepten", () => {
    const o = financieelOverzicht(2026, boekingen, facturen, betalingen)
    expect(o.totaal.gefactureerd).toBe(108100)
    expect(o.totaal.ontvangen).toBe(54050)
    expect(o.totaal.openstaand).toBe(54050)
    expect(o.totaal.verdeling).toMatchObject({ huur: 90000, schoonmaak: 6400, parkkosten: 9000, toeristenbelasting: 2700 })
  })
  it("toont toeristenbelasting geïnd, aangegeven en verschil", () => {
    const t = tbOverzicht(2026, boekingen, facturen)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ geind: 2700, aangegeven: 2800, verschil: 100 })
  })
})

describe("parkkostenOverzicht", () => {
  const basis = { naam: "Fam. Test", status: "verblijf", tb_aangegeven_cent: 0, tb_aangegeven_op: "", tb_aangifte: "", parkkosten_betaald_cent: 0, parkkosten_betaald_op: "", schoonmaak_cent: 0 }
  it("toont gefactureerd, betaald en het verschil per verblijf in het jaar", () => {
    const rijen = parkkostenOverzicht(2026, [
      { ...basis, id: "a", aankomst: "2026-09-13", vertrek: "2026-09-23", parkkosten_cent: 10000, schoonmaak_cent: 6400, parkkosten_betaald_cent: 16000, parkkosten_betaald_op: "2026-10-16" },
      { ...basis, id: "b", aankomst: "2026-07-01", vertrek: "2026-07-08", parkkosten_cent: 7000 },
      { ...basis, id: "c", aankomst: "2026-08-01", vertrek: "2026-08-08", parkkosten_cent: 0 },
      { ...basis, id: "d", aankomst: "2025-08-01", vertrek: "2025-08-08", parkkosten_cent: 7000 },
      { ...basis, id: "e", aankomst: "2026-05-01", vertrek: "2026-05-08", parkkosten_cent: 7000, status: "geannuleerd" },
    ])
    expect(rijen.map((r) => [r.boeking.id, r.betaald, r.verschil])).toEqual([["b", null, null], ["a", 16000, 400]])
  })
})
