import { describe, expect, it } from "vitest"
import { renderToBuffer } from "@react-pdf/renderer"
import { readFileSync, writeFileSync } from "node:fs"
import { FactuurPdf } from "./FactuurPdf"
import { bouwFactuurregels, totaalVan } from "../domein/factuur"

// Rendert de testcase-factuur met fictieve gegevens. Zet FACTUUR_PDF=pad om
// het resultaat te bekijken.
describe("factuur-PDF", () => {
  it("rendert de testcase zonder fouten", async () => {
    const regels = bouwFactuurregels({
      aankomst: "2026-10-17", vertrek: "2026-10-26", volwassenen: 2, nachten: 9,
      huur_cent: 90000, parkkosten_cent: 9000, schoonmaak_cent: 6400, extras: null, tb_portaal_cent: 2700,
    })
    const foto = `data:image/jpeg;base64,${readFileSync("public/huisfoto.jpg").toString("base64")}`
    const buf = await renderToBuffer(
      <FactuurPdf
        nummer="2026-004"
        soort="factuur"
        factuurdatum="2026-05-27"
        regels={regels}
        totaalCent={totaalVan(regels)}
        foto={foto}
        gegevens={{
          huurder: { naam: "Jan Testpersoon", adres: "Voorbeeldlaan 1", postcodePlaats: "1234 AB Teststad" },
          afzender: { naam: "Familie Voorbeeld", adresregels: ["Voorbeeldstraat 1", "1234 AB Voorbeeldstad"], telefoon: "06 00 00 00 00", email: "verhuur@example.com" },
          accommodatie: "Duc’dalf (Nr. 264 Parc le Duc)",
          bank: { tnv: "J. Voorbeeld", iban: "NL00 TEST 0000 0000 00" },
          aankomst: "2026-10-17",
          vertrek: "2026-10-26",
          betaaltekst: "Graag 50% van het factuurbedrag (€ 540,50) voor 27-6-2026 voldoen en het resterende bedrag (€ 540,50) uiterlijk 19-9-2026 (4 weken voor aankomst).",
        }}
      />,
    )
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-")
    if (process.env.FACTUUR_PDF) writeFileSync(process.env.FACTUUR_PDF, buf)
  }, 30000)
})
