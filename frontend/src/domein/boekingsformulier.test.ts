import { describe, expect, it } from "vitest"
import { controleer, LEGE_AANVRAAG, minNachten, minNachtenVanaf, nachtBezet, periodeVrij, type Regels } from "./boekingsformulier"
import { bouwActielijst } from "./actielijst"

const regels: Regels = {
  min_nachten: 3,
  max_personen: 6,
  seizoenen: [
    { van: "2027-01-01", tot: "2027-06-30", min_nachten: 0 },
    { van: "2027-07-01", tot: "2027-08-31", min_nachten: 7 },
  ],
}
const bezet = [{ aankomst: "2027-05-10", vertrek: "2027-05-17" }]

describe("boekingsformulier", () => {
  it("de vertrekdag van een verblijf is weer vrij als aankomstdag", () => {
    expect(nachtBezet("2027-05-10", bezet)).toBe(true)
    expect(nachtBezet("2027-05-16", bezet)).toBe(true)
    expect(nachtBezet("2027-05-17", bezet)).toBe(false)
    expect(periodeVrij("2027-05-17", "2027-05-24", bezet)).toBe(true)
    expect(periodeVrij("2027-05-03", "2027-05-10", bezet)).toBe(true)
    expect(periodeVrij("2027-05-05", "2027-05-11", bezet)).toBe(false)
  })

  it("het minimum aantal nachten is het hoogste van de algemene regel en de seizoenen", () => {
    expect(minNachten("2027-06-01", "2027-06-05", regels)).toBe(3)
    expect(minNachten("2027-06-28", "2027-07-03", regels)).toBe(7)
    expect(minNachtenVanaf("2027-07-10", regels)).toBe(7)
  })

  it("controleert periode, gezelschap en gegevens", () => {
    const goed = { ...LEGE_AANVRAAG, aankomst: "2027-05-17", vertrek: "2027-05-24", voornaam: "Gerda", achternaam: "Gast", email: "gerda@voorbeeld.test" }
    expect(controleer(goed, regels, bezet, "2027-01-01")).toEqual({})
    expect(controleer({ ...goed, aankomst: "2027-05-12" }, regels, bezet, "2027-01-01")).toHaveProperty("aankomst")
    expect(controleer({ ...goed, aankomst: "2027-07-01", vertrek: "2027-07-04" }, regels, bezet, "2027-01-01").vertrek).toMatch(/minimaal 7/)
    expect(controleer({ ...goed, volwassenen: "4", kinderen: "3" }, regels, bezet, "2027-01-01").volwassenen).toMatch(/maximaal 6/)
    expect(controleer({ ...goed, email: "geen" }, regels, bezet, "2027-01-01")).toHaveProperty("email")
  })

  it("een aanvraag via de website valt op bij de acties", () => {
    const acties = bouwActielijst(
      [{ id: "b1", naam: "Gerda Gast", aankomst: "2027-05-17", vertrek: "2027-05-24", status: "aanvraag", bron: "website" }],
      [{ sleutel: "aanvraag", label: "Aanvraag", actie_label: "", volgorde: 10, actief: true }, { sleutel: "in_afstemming", label: "In afstemming", actie_label: "Afstemming gestart", volgorde: 20, actief: true }],
      { herinnering_rest_dagen: 7, aankomst_vooruit_dagen: 14, tb_aangifte_dag: 15 },
      "2027-01-01",
    )
    expect(acties).toHaveLength(1)
    expect(acties[0]).toMatchObject({ titel: "Nieuwe boekingsaanvraag – Gerda Gast", urgentie: "oranje" })
  })
})
