import { describe, expect, it } from "vitest"
import { standaardZomer, verdeel, wekenTekst, zomerverdeling, zomerVoor, type ZomerVerhuur } from "./zomer"

const periode = { van: "2026-07-04", tot: "2026-08-30" }
const A = "Gezin A"
const B = "Gezin B"
const week = (start: string, eind: string, opbrengst = 70_000, id = start): ZomerVerhuur =>
  ({ id, naam: `Huurder ${id}`, aankomst: start, vertrek: eind, opbrengst_cent: opbrengst, geschat: false })

describe("zomerperiode", () => {
  it("neemt de vroegste begin- en de laatste einddag over alle regio's", () => {
    expect(standaardZomer(2026)).toEqual({ van: "2026-07-04", tot: "2026-08-30" })
    expect(standaardZomer(2027)).toEqual({ van: "2027-07-10", tot: "2027-09-05" })
    expect(standaardZomer(1999)).toBeNull()
  })
  it("een eigen periode gaat voor", () => {
    expect(zomerVoor(2026, { "2026": { van: "2026-07-04", tot: "2026-09-05" } })).toEqual({ van: "2026-07-04", tot: "2026-09-05" })
    expect(zomerVoor(2026, {})).toEqual(standaardZomer(2026))
  })
  it("schrijft nachten als weken", () => {
    expect(wekenTekst(21)).toBe("3 weken")
    expect(wekenTekst(57)).toBe("8 weken en 1 nacht")
    expect(wekenTekst(9)).toBe("1 week en 2 nachten")
    expect(wekenTekst(3)).toBe("3 nachten")
  })
  it("verdeelt centen zonder afrondingsverschil", () => {
    expect(verdeel(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(verdeel(100, [0, 0])).toEqual([0, 0])
  })
})

describe("zomerverdeling", () => {
  it("geeft de opbrengst van afgeziene weken aan dat gezin, de rest 50/50", () => {
    // A gebruikt 1 week (2 afgezien), B alle 3; 3 weken verhuurd à € 700.
    const z = zomerverdeling({
      periode,
      gezinnen: [A, B],
      verblijven: [
        { groep: A, aankomst: "2026-07-04", vertrek: "2026-07-11" },
        { groep: B, aankomst: "2026-07-11", vertrek: "2026-08-01" },
      ],
      verhuur: [week("2026-08-01", "2026-08-08"), week("2026-08-08", "2026-08-15"), week("2026-08-15", "2026-08-22")],
    })
    expect(z.nachten).toBe(57)
    const [a, b] = z.gezinnen
    expect([a.gebruikt, a.afgezien, b.gebruikt, b.afgezien]).toEqual([7, 14, 21, 0])
    expect(z.verhuurdeNachten).toBe(21)
    expect(z.gedeeldeNachten).toBe(7)
    expect(a.opbrengstAfgezien_cent).toBe(140_000)
    expect(a.opbrengstGedeeld_cent).toBe(35_000)
    expect(b.opbrengst_cent).toBe(35_000)
    expect(a.opbrengst_cent + b.opbrengst_cent).toBe(z.opbrengst_cent)
  })

  it("minder verhuurd dan afgezien: naar verhouding van de afgeziene weken", () => {
    // A ziet 3 weken af, B 1 week; 2 weken verhuurd.
    const z = zomerverdeling({
      periode,
      gezinnen: [A, B],
      verblijven: [{ groep: B, aankomst: "2026-07-04", vertrek: "2026-07-18" }],
      verhuur: [week("2026-08-01", "2026-08-08"), week("2026-08-08", "2026-08-15")],
    })
    const [a, b] = z.gezinnen
    expect(z.gedeeldeNachten).toBe(0)
    expect(a.opbrengst_cent).toBe(105_000)
    expect(b.opbrengst_cent).toBe(35_000)
  })

  it("niemand ziet af: alles gedeeld; alleen de zomernachten van een boeking tellen", () => {
    const z = zomerverdeling({
      periode,
      gezinnen: [A, B],
      verblijven: [
        { groep: A, aankomst: "2026-07-04", vertrek: "2026-07-25" },
        { groep: B, aankomst: "2026-07-25", vertrek: "2026-08-15" },
        { groep: "", aankomst: "2026-08-15", vertrek: "2026-08-17" },
      ],
      // 7 nachten, waarvan 4 in de zomer (t/m de nacht vóór 30 augustus)
      verhuur: [week("2026-08-26", "2026-09-02", 70_000)],
    })
    expect(z.verhuur[0].zomerNachten).toBe(4)
    expect(z.opbrengst_cent).toBe(40_000)
    expect(z.gezinnen.map((g) => g.opbrengst_cent)).toEqual([20_000, 20_000])
    expect(z.zonderGezin).toBe(2)
  })
})

describe("zomerverdeling met een gehuurd huis (overlapweek)", () => {
  it("telt de week mee als gebruikt en verdeelt de huur gelijk", () => {
    const z = zomerverdeling({
      periode,
      gezinnen: [A, B],
      verblijven: [
        { groep: A, aankomst: "2026-07-04", vertrek: "2026-07-25" },
        { groep: B, aankomst: "2026-07-18", vertrek: "2026-08-01" },
        // overlapweek: B in een gehuurd huis, B betaalt
        { groep: B, aankomst: "2026-07-11", vertrek: "2026-07-18", anderHuis: true, huurkosten_cent: 120_001 },
      ],
      verhuur: [],
    })
    const [a, b] = z.gezinnen
    expect(b.gebruikt).toBe(21)
    expect(b.afgezien).toBe(0)
    expect(z.huurkosten_cent).toBe(120_001)
    expect(z.huurhuizen[0].betaaldDoor).toBe(B)
    expect(a.verrekening_cent).toBe(-60_001)
    expect(b.verrekening_cent).toBe(60_001)
    expect(a.verrekening_cent + b.verrekening_cent).toBe(0)
  })

  it("betaald door het andere gezin", () => {
    const z = zomerverdeling({
      periode,
      gezinnen: [A, B],
      verblijven: [{ groep: B, aankomst: "2026-07-11", vertrek: "2026-07-18", anderHuis: true, huurkosten_cent: 100_000, betaaldDoor: A }],
      verhuur: [],
    })
    expect(z.gezinnen.map((g) => g.verrekening_cent)).toEqual([50_000, -50_000])
  })
})
