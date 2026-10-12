import { describe, expect, it } from "vitest"
import { aanmeldLink, combineer, vulIn } from "./sjablonen"
import { bouwActielijst } from "./actielijst"
import type { WorkflowStap } from "./workflow"
import { adres, bouwMime, kopWaarde, naarBase64Url, nieuwMessageId, tekstNaarHtml } from "./mime"

describe("sjablonen", () => {
  it("vult variabelen in en meldt ontbrekende", () => {
    const r = vulIn("Beste {voornaam}, factuur {factuurnummer} vervalt {vervaldatum_rest}.", { voornaam: "Anna", factuurnummer: "2026-004" })
    expect(r.tekst).toBe("Beste Anna, factuur 2026-004 vervalt {vervaldatum_rest}.")
    expect(r.ontbrekend).toEqual(["vervaldatum_rest"])
  })
  it("combineert sjablonen met één aanhef en één afsluiting", () => {
    const a = "Beste Anna,\n\nVul het formulier in.\n\nMet vriendelijke groet,\nFam"
    const b = "Beste Anna,\n\nIn de bijlage de brochure.\n\nMet vriendelijke groet,\nFam"
    expect(combineer([a, b])).toBe("Beste Anna,\n\nVul het formulier in.\n\nIn de bijlage de brochure.\n\nMet vriendelijke groet,\nFam")
    expect(combineer([a])).toBe(a)
  })
  it("maakt een https-link met boekingscode", () => {
    expect(aanmeldLink("http://vakantiehuis-ducdalf.nl/aanmelden/", "AbC123")).toBe("https://vakantiehuis-ducdalf.nl/aanmelden/?boeking=AbC123")
    expect(aanmeldLink("", "x")).toBe("")
  })
})

function decodeerDelen(mime: string): string[] {
  // Haal alle base64-blokken na een lege regel op en decodeer ze.
  return mime
    .split(/\r\n--[^\r\n]+\r\n/)
    .map((d) => d.split("\r\n\r\n")[1] ?? "")
    .filter((b) => /^[A-Za-z0-9+/=\r\n]+$/.test(b.trim()) && b.trim().length > 0)
    .map((b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\r\n/g, "").replace(/--$/, "")), (c) => c.charCodeAt(0))))
}

describe("MIME", () => {
  it("codeert kopregels met accenten", () => {
    expect(kopWaarde("Factuur 2026-004")).toBe("Factuur 2026-004")
    expect(kopWaarde("Duc’dalf – café")).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(adres("Familie Brons", "a@b.nl")).toBe('"Familie Brons" <a@b.nl>')
  })
  it("bouwt een mail met tekst, html en bijlage", () => {
    const mime = bouwMime(
      {
        van: adres("Familie Voorbeeld", "verhuur@example.com"),
        aan: "anna@example.com",
        onderwerp: "Factuur 2026-004 – verblijf",
        tekst: "Beste Anna,\n\nZie https://example.com/x.\n\nGroet",
        bijlagen: [{ bestandsnaam: "Factuur_2026-004.pdf", mimeType: "application/pdf", base64: btoa("%PDF-1.4 test") }],
        messageId: "<a@vakantiehuis-ducdalf.nl>",
        antwoordOp: "<eerder@vakantiehuis-ducdalf.nl>",
        referenties: ["<eerder@vakantiehuis-ducdalf.nl>"],
      },
      "GRENS",
    )
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="GRENS"')
    expect(mime).toContain("In-Reply-To: <eerder@vakantiehuis-ducdalf.nl>")
    expect(mime).toContain('filename="Factuur_2026-004.pdf"')
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/)
    const delen = decodeerDelen(mime)
    expect(delen.some((d) => d.includes("Beste Anna,"))).toBe(true)
    expect(delen.some((d) => d.includes('<a href="https://example.com/x.">'))).toBe(true)
    expect(delen.some((d) => d.startsWith("%PDF-1.4"))).toBe(true)
    expect(mime.split("\r\n").every((r) => r.length <= 998)).toBe(true)
  })
  it("maakt base64url zonder opvulling", () => {
    const u = naarBase64Url("ü?>")
    expect(u).not.toMatch(/[+/=]/)
  })
  it("maakt unieke Message-ID's", () => {
    expect(nieuwMessageId("x.nl")).not.toBe(nieuwMessageId("x.nl"))
    expect(nieuwMessageId("x.nl")).toMatch(/^<[^@]+@x\.nl>$/)
  })
  it("ontsnapt html", () => {
    expect(tekstNaarHtml("<b>")).toContain("&lt;b&gt;")
  })
})

const STAPPEN: WorkflowStap[] = ["aanvraag", "bevestigd", "factuur_verstuurd", "aanbetaling_ontvangen", "volledig_betaald", "verblijf", "tb_aangegeven", "afgerond"].map(
  (sleutel, i) => ({ sleutel, label: sleutel, actie_label: sleutel, volgorde: i, overslaan_als: "", actief: true }),
)

describe("herinneringen in de actielijst", () => {
  const inst = { herinnering_rest_dagen: 7, aankomst_vooruit_dagen: 14, tb_aangifte_dag: 15 }
  const b = { id: "b1", naam: "Anna", status: "aanbetaling_ontvangen", betaalwijze: "aanbetaling", aankomst: "2026-10-17", vertrek: "2026-10-26", rest_vervaldatum: "2026-09-19" }
  it("koppelt een herinneringssjabloon aan een vervallen restbetaling", () => {
    const a = bouwActielijst([b], STAPPEN, inst, "2026-09-25").find((x) => x.soort === "restbetaling")
    expect(a).toMatchObject({ urgentie: "rood", mail: "herinnering_rest" })
    expect(a?.toelichting).not.toMatch(/Herinnering verstuurd/)
  })
  it("toont wanneer de laatste herinnering is verstuurd", () => {
    const a = bouwActielijst([b], STAPPEN, inst, "2026-09-25", [{ boekingId: "b1", sjablonen: ["herinnering_rest"], datum: "2026-09-21" }]).find((x) => x.soort === "restbetaling")
    expect(a?.toelichting).toMatch(/Herinnering verstuurd op 21 september 2026/)
  })
  it("stelt kort voor aankomst de praktische info voor, maar niet als die al is verstuurd", () => {
    const vol = { ...b, status: "volledig_betaald" }
    expect(bouwActielijst([vol], STAPPEN, inst, "2026-10-12").some((x) => x.mail === "fijne_reis")).toBe(true)
    expect(bouwActielijst([vol], STAPPEN, inst, "2026-10-12", [{ boekingId: "b1", sjablonen: ["fijne_reis"], datum: "2026-10-11" }]).some((x) => x.mail === "fijne_reis")).toBe(false)
  })
})
