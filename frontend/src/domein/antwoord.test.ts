import { describe, expect, it } from "vitest"
import { antwoordOnderwerp, antwoordTekst, doorstuurOnderwerp, doorstuurTekst } from "./antwoord"

const o = { van: "Jan Test <jan@voorbeeld.test>", aan: "info@voorbeeld.test", onderwerp: "Vraag over parkeren", tijd: "2026-05-03T10:15:00", tekst: "Hallo,\n\nMag de auto bij het huis?\n" }

describe("antwoord", () => {
  it("zet Re:/Fwd: maar één keer voor het onderwerp", () => {
    expect(antwoordOnderwerp("Vraag")).toBe("Re: Vraag")
    expect(antwoordOnderwerp("RE: Vraag")).toBe("RE: Vraag")
    expect(antwoordOnderwerp("Antw: Vraag")).toBe("Antw: Vraag")
    expect(doorstuurOnderwerp("Vraag")).toBe("Fwd: Vraag")
    expect(doorstuurOnderwerp("FW: Vraag")).toBe("FW: Vraag")
  })

  it("citeert de oorspronkelijke mail onder een antwoord", () => {
    const t = antwoordTekst(o)
    expect(t.startsWith("\n\n\nOp 3 mei 2026, 10:15 schreef Jan Test <jan@voorbeeld.test>:\n")).toBe(true)
    expect(t).toContain("> Hallo,\n>\n> Mag de auto bij het huis?")
  })

  it("zet de gegevens van de oorspronkelijke mail boven de doorgestuurde tekst", () => {
    const t = doorstuurTekst(o)
    expect(t).toContain("---------- Doorgestuurd bericht ----------\nVan: Jan Test <jan@voorbeeld.test>\nDatum: 3 mei 2026, 10:15\nOnderwerp: Vraag over parkeren\nAan: info@voorbeeld.test\n\nHallo,")
  })
})
