import { describe, expect, it } from "vitest"
import { jaarVanUitgave, starlinkBedrag, starlinkJaar, totaalUitgaven } from "./uitgaven"

const lijst = [
  { id: "a", soort: "starlink", datum: "2026-07-03", periode: "2026-07", bedrag_cent: 3500, status: "actief" },
  { id: "b", soort: "starlink", datum: "", periode: "2026-11", bedrag_cent: 1000, status: "gepauzeerd" },
  { id: "c", soort: "toeristenbelasting", datum: "2027-01-10", periode: "2026-12", bedrag_cent: 20460 },
  { id: "d", soort: "toeristenbelasting", datum: "2026-09-12", periode: "2026-08", bedrag_cent: 15000 },
]

describe("uitgaven", () => {
  it("rekent een uitgave tot het jaar van afschrijving, anders van de periode", () => {
    expect(jaarVanUitgave(lijst[2])).toBe(2027)
    expect(jaarVanUitgave(lijst[1])).toBe(2026)
  })
  it("zet de Starlink-betalingen per maand", () => {
    const j = starlinkJaar(2026, lijst)
    expect(j).toHaveLength(12)
    expect(j[6].uitgave?.id).toBe("a")
    expect(j[10].uitgave?.id).toBe("b")
    expect(j[0].uitgave).toBeNull()
  })
  it("kiest het standaardbedrag bij de status", () => {
    const inst = { starlink_actief_cent: 3500, starlink_pauze_cent: 1000 }
    expect(starlinkBedrag("actief", inst)).toBe(3500)
    expect(starlinkBedrag("gepauzeerd", inst)).toBe(1000)
    expect(starlinkBedrag("", inst)).toBe(0)
  })
  it("telt per soort en jaar", () => {
    expect(totaalUitgaven(2026, lijst, "starlink")).toBe(4500)
    expect(totaalUitgaven(2026, lijst, "toeristenbelasting")).toBe(15000)
    expect(totaalUitgaven(2027, lijst, "toeristenbelasting")).toBe(20460)
  })
})
