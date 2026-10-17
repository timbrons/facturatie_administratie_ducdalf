import { describe, expect, it } from "vitest"
import { adresUit, adressenUit, gmailDatum, onbeantwoordeMails, reactiesUit, vanBase64Url, zonderCitaat, type GmailBericht } from "./mailgesprek"

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

describe("mailgesprek", () => {
  it("decodeert base64url met UTF-8", () => {
    expect(vanBase64Url(b64("Prima, tot ziens! Groetjes — Jan ü"))).toBe("Prima, tot ziens! Groetjes — Jan ü")
  })
  it("haalt het geciteerde eerdere bericht weg", () => {
    const tekst = "Ja, akkoord met de prijs.\n\nGroet, Jan\n\nOp do 15 okt 2026 om 10:12 schreef Verhuur <verhuur@voorbeeld.test>:\n> Beste Jan,\n> Klopt de prijs?"
    expect(zonderCitaat(tekst)).toBe("Ja, akkoord met de prijs.\n\nGroet, Jan")
    expect(zonderCitaat("Akkoord.\n\nOn Thu, Oct 15, 2026 at 10:12 AM Verhuur <v@voorbeeld.test> wrote:\n> Hoi")).toBe("Akkoord.")
    expect(zonderCitaat("Akkoord.\n-----Original Message-----\nFrom: x")).toBe("Akkoord.")
    expect(zonderCitaat("> alleen citaat")).toBe("> alleen citaat")
  })
  it("neemt alleen berichten die niet via de app zijn verstuurd", () => {
    const berichten: GmailBericht[] = [
      { id: "a", threadId: "t", labelIds: ["SENT"], internalDate: "1760000000000", payload: { mimeType: "text/plain", body: { data: b64("Beste Jan") }, headers: [{ name: "From", value: "Verhuur <v@voorbeeld.test>" }] } },
      {
        id: "b", threadId: "t", labelIds: ["INBOX", "UNREAD"], internalDate: "1760100000000",
        payload: {
          mimeType: "multipart/alternative",
          headers: [{ name: "From", value: "Jan Test <jan@voorbeeld.test>" }, { name: "Subject", value: "Re: Uw aanvraag" }],
          parts: [{ mimeType: "text/html", body: { data: b64("<p>Ja!</p>") } }, { mimeType: "text/plain", body: { data: b64("Ja, akkoord.\n\nOp wo 14 okt schreef Verhuur:\n> Beste Jan") } }],
        },
      },
      { id: "c", threadId: "t", labelIds: ["SENT"], internalDate: "1760200000000", payload: { mimeType: "text/html", body: { data: b64("<div>Fijn, tot dan<br>Groet</div>") }, headers: [] } },
      { id: "d", threadId: "t", labelIds: ["DRAFT"], payload: { mimeType: "text/plain", body: { data: b64("concept") } } },
    ]
    const r = reactiesUit(berichten, new Set(["a"]))
    expect(r.map((x) => [x.id, x.richting])).toEqual([["b", "ontvangen"], ["c", "verstuurd"]])
    expect(r[0]).toMatchObject({ van: "Jan Test <jan@voorbeeld.test>", onderwerp: "Re: Uw aanvraag", tekst: "Ja, akkoord.", ontvangen: new Date(1760100000000).toISOString() })
    expect(r[1].tekst).toBe("Fijn, tot dan\nGroet")
  })
})

describe("onbeantwoorde mails", () => {
  it("leest adressen uit mailkoppen", () => {
    expect(adresUit("Jan Test <Jan@Voorbeeld.test>")).toBe("jan@voorbeeld.test")
    expect(adresUit("piet@voorbeeld.test")).toBe("piet@voorbeeld.test")
    expect(adressenUit("A <a@x.test>, b@y.test")).toEqual(["a@x.test", "b@y.test"])
    expect(gmailDatum("2026-10-17T10:00:00Z")).toBe("2026/10/17")
  })
  it("meldt alleen mails die na ons laatste antwoord of 'afgehandeld' binnenkwamen", () => {
    const ontvangen = [
      { adres: "a@x.test", tijd: "2026-10-01T10:00:00Z", onderwerp: "Vraag 1", id: "1" },
      { adres: "a@x.test", tijd: "2026-10-05T10:00:00Z", onderwerp: "Vraag 2", id: "2" },
      { adres: "a@x.test", tijd: "2026-10-06T10:00:00Z", onderwerp: "Vraag 3", id: "3" },
      { adres: "b@x.test", tijd: "2026-10-02T10:00:00Z", onderwerp: "Hoi", id: "4" },
      { adres: "c@x.test", tijd: "2026-10-03T10:00:00Z", onderwerp: "Bedankt", id: "5" },
    ]
    const verstuurd = [{ adres: "a@x.test", tijd: "2026-10-02T10:00:00Z" }, { adres: "b@x.test", tijd: "2026-10-03T10:00:00Z" }]
    const r = onbeantwoordeMails(ontvangen, verstuurd, { "c@x.test": "2026-10-03T10:00:00Z" })
    expect(r).toEqual([{ adres: "a@x.test", tijd: "2026-10-06T10:00:00Z", onderwerp: "Vraag 3", id: "3", aantal: 2 }])
  })
})
