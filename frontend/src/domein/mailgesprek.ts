// Reacties op mails uit de app, gelezen uit het Gmail-gesprek (thread) van de
// verstuurde mail. Alleen het verwerken van de Gmail-gegevens; het ophalen
// staat in lib/mailgesprek.ts.

export interface GmailDeel {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailDeel[]
  headers?: { name: string; value: string }[]
}

export interface GmailBericht {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  snippet?: string
  payload?: GmailDeel
}

export interface Reactie {
  id: string
  threadId: string
  van: string
  aan: string
  onderwerp: string
  /** ontvangen: van de huurder; verstuurd: zelf beantwoord in Gmail (niet via de app) */
  richting: "ontvangen" | "verstuurd"
  /** ISO-tijdstip */
  ontvangen: string
  /** Tekst zonder het geciteerde eerdere bericht */
  tekst: string
  /** Volledige tekst, inclusief citaat */
  volledig: string
}

/** base64url (Gmail) → tekst (UTF-8). */
export function vanBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder("utf-8").decode(bytes)
}

function kop(deel: GmailDeel | undefined, naam: string): string {
  return deel?.headers?.find((h) => h.name.toLowerCase() === naam.toLowerCase())?.value ?? ""
}

function zoek(deel: GmailDeel | undefined, type: string): string | null {
  if (!deel) return null
  if (deel.mimeType === type && deel.body?.data) return vanBase64Url(deel.body.data)
  for (const d of deel.parts ?? []) {
    const t = zoek(d, type)
    if (t !== null) return t
  }
  return null
}

/** HTML → platte tekst (alleen als er geen tekstversie is). */
export function htmlNaarTekst(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Regels waarmee mailprogramma's het geciteerde eerdere bericht inleiden.
const CITAAT = [
  /^\s*(Op|On|Am|Le|El)\s.+(schreef|wrote|schrieb|a écrit|escribió)\s*.*:\s*$/i,
  /^\s*-{2,}\s*(Oorspronkelijk bericht|Original Message|Ursprüngliche Nachricht)\s*-{2,}/i,
  /^\s*(Van|From|Von|De)\s*:\s.+/i,
  /^\s*_{10,}\s*$/,
]

/** Haalt het geciteerde eerdere bericht onder een reactie weg. */
export function zonderCitaat(tekst: string): string {
  const regels = tekst.replace(/\r\n/g, "\n").split("\n")
  let eind = regels.length
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]
    // Een inleiding over twee regels ("Op ... heeft" / "... het volgende geschreven:") telt ook.
    const tweeRegels = i + 1 < regels.length ? `${r} ${regels[i + 1]}` : r
    if (CITAAT.some((p) => p.test(r)) || /^\s*Op\s.+schreef.*:\s*$/i.test(tweeRegels) || /^\s*>/.test(r)) {
      eind = i
      break
    }
  }
  const kort = regels.slice(0, eind).join("\n").trim()
  return kort || tekst.trim()
}

/**
 * De berichten in een Gmail-gesprek die níet via de app zijn verstuurd: de
 * reacties van de huurder, en antwoorden die rechtstreeks in Gmail zijn
 * geschreven. Concepten tellen niet mee.
 */
export function reactiesUit(berichten: GmailBericht[], eigenIds: Set<string>): Reactie[] {
  const uit: Reactie[] = []
  for (const m of berichten) {
    const labels = m.labelIds ?? []
    if (eigenIds.has(m.id) || labels.includes("DRAFT")) continue
    const tekst = zoek(m.payload, "text/plain") ?? htmlNaarTekst(zoek(m.payload, "text/html") ?? m.snippet ?? "")
    const tijd = Number(m.internalDate)
    uit.push({
      id: m.id,
      threadId: m.threadId,
      van: kop(m.payload, "From"),
      aan: kop(m.payload, "To"),
      richting: labels.includes("SENT") ? "verstuurd" : "ontvangen",
      onderwerp: kop(m.payload, "Subject"),
      ontvangen: Number.isFinite(tijd) && tijd > 0 ? new Date(tijd).toISOString() : "",
      tekst: zonderCitaat(tekst),
      volledig: tekst.trim(),
    })
  }
  return uit
}
