import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

// De parser draait op de server (PocketBase); hier alleen de pure functies.
const require = createRequire(import.meta.url)
const m = require("../../../backend/pb_hooks/betaalmail.js") as {
  bedragUit: (t: string) => { cent: number; zeker: boolean }
  orderUit: (s: string) => string
  tekstUit: (deel: unknown) => string
  datumVan: (ms: number | string) => string
  naarCent: (s: string) => number
}
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url")

describe("betaalbevestiging toeristenbelasting", () => {
  it("haalt de orderreferentie uit het onderwerp", () => {
    expect(m.orderUit("Payment confirmation - Order reference : GTA6AEF490942391")).toBe("GTA6AEF490942391")
    expect(m.orderUit("Iets anders")).toBe("")
  })
  it("rekent bedragen in verschillende notaties om naar centen", () => {
    expect(m.naarCent("204,60")).toBe(20460)
    expect(m.naarCent("204.60")).toBe(20460)
    expect(m.naarCent("1.234,56")).toBe(123456)
    expect(m.naarCent("1,234.56")).toBe(123456)
    expect(m.naarCent("15")).toBe(1500)
  })
  it("vindt het bedrag bij een sleutelwoord", () => {
    expect(m.bedragUit("Order reference : GTA1\nDate: 07/11/2026\nAmount: 204.60 EUR\nThank you")).toEqual({ cent: 20460, zeker: true })
    expect(m.bedragUit("Total : €35,00")).toEqual({ cent: 3500, zeker: true })
    expect(m.bedragUit("Montant payé : 1 024,50 €")).toEqual({ cent: 102450, zeker: true })
    expect(m.bedragUit("Paid on 07/11/2026 204,60 €")).toEqual({ cent: 20460, zeker: true })
  })
  it("twijfelt bij meerdere bedragen en neemt dan het grootste", () => {
    expect(m.bedragUit("Montant : 100,00 €\nTotal : 120,00 €")).toEqual({ cent: 12000, zeker: false })
  })
  it("zonder bedrag: 0 en controleren", () => {
    expect(m.bedragUit("Bedankt voor uw betaling.")).toEqual({ cent: 0, zeker: false })
  })
  it("leest platte tekst en HTML uit een Gmail-bericht, ook met euroteken", () => {
    const tekst = m.tekstUit({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<table><tr><td>Amount</td><td>&euro;&nbsp;204,60</td></tr></table>") } },
      ],
    })
    expect(m.bedragUit(tekst)).toEqual({ cent: 20460, zeker: true })
    expect(m.bedragUit(m.tekstUit({ mimeType: "text/plain", body: { data: b64("Montant : 12,30 €") } }))).toEqual({ cent: 1230, zeker: true })
  })
  it("zet het tijdstip om naar de datum in Franse tijd", () => {
    expect(m.datumVan(Date.UTC(2026, 10, 7, 23, 30))).toBe("2026-11-08")
    expect(m.datumVan(Date.UTC(2026, 6, 7, 21, 0))).toBe("2026-07-07")
  })
})
