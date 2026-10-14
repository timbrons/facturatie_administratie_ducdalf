import { describe, expect, it } from "vitest"
import { alsVerzending, controleer, LEEG_FORMULIER, pasMeereizendenAan, type Formulier } from "./aanmeldformulier"
import { maakAanmelding } from "./aanmelding"

const ingevuld: Formulier = {
  ...LEEG_FORMULIER,
  aankomstdatum: "2026-12-03", vertrekdatum: "2026-12-07", aantal_personen: "2", aanhef: "Mevr.",
  voornaam: "Testa", achternaam: "Voorbeeld", adres: "Teststraat 1", postcode: "1234 AB", plaats: "Teststad",
  telefoon_mobiel: "0600000000", email: "testa@voorbeeld.test", geboortedatum: "1980-01-01", geboorteplaats: "Testdorp",
  noodcontact_naam: "Nood Contact", noodcontact_telefoon_mobiel: "0611111111", noodcontact_email: "nood@voorbeeld.test",
  extra_personen: [{ naam: "Kind Voorbeeld", geboortedatum: "2015-05-05", geboorteplaats: "" }],
}

describe("aanmeldformulier", () => {
  it("een volledig ingevuld formulier is in orde", () => {
    expect(controleer(ingevuld, "2026-10-14")).toEqual({})
  })

  it("meldt verplichte velden, datums en e-mailadressen", () => {
    const f = controleer({ ...ingevuld, voornaam: " ", vertrekdatum: "2026-12-01", email: "geen-mail", extra_personen: [{ naam: "", geboortedatum: "", geboorteplaats: "" }] }, "2026-10-14")
    expect(Object.keys(f).sort()).toEqual(["email", "extra_persoon_1_geboortedatum", "extra_persoon_1_naam", "vertrekdatum", "voornaam"])
  })

  it("past het aantal meereizenden aan het aantal personen aan en bewaart wat al is ingevuld", () => {
    const twee = pasMeereizendenAan([], "3")
    expect(twee).toHaveLength(2)
    const metNaam = [{ naam: "A", geboortedatum: "", geboorteplaats: "" }, ...twee.slice(1)]
    expect(pasMeereizendenAan(metNaam, "2")).toEqual([{ naam: "A", geboortedatum: "", geboorteplaats: "" }])
    expect(pasMeereizendenAan(metNaam, "1")).toEqual([])
    expect(pasMeereizendenAan(metNaam, "")).toEqual([])
  })

  it("de verzonden velden worden door de app op dezelfde manier gelezen", () => {
    const v = alsVerzending(ingevuld, "CODE1234", 9000, "") as Record<string, unknown>
    expect(v.boekingscode).toBe("CODE1234")
    // Zoals de server ze opslaat: meereizenden als extra_persoon_N_*.
    const velden: Record<string, string> = {}
    for (const [k, w] of Object.entries(v)) if (typeof w === "string") velden[k] = w
    ;(v.extra_personen as { naam: string; geboortedatum: string }[]).forEach((p, i) => {
      velden[`extra_persoon_${i + 1}_naam`] = p.naam
      velden[`extra_persoon_${i + 1}_geboortedatum`] = p.geboortedatum
    })
    const a = maakAanmelding(velden)
    expect(a.aankomst).toBe("2026-12-03")
    expect(a.extraPersonen).toEqual([{ naam: "Kind Voorbeeld", geboortedatum: "2015-05-05", geboorteplaats: "" }])
    expect(a.boekingscode).toBe("CODE1234")
  })
})
