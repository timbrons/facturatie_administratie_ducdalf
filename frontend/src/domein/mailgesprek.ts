// Reacties op mails uit de app, gelezen uit het Gmail-gesprek (thread) van de
// verstuurde mail. Alleen het verwerken van de Gmail-gegevens; het ophalen
// staat in lib/mailgesprek.ts.

export interface GmailDeel {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
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

/** Een bijlage van een mail in Gmail (ophalen via attachmentId) */
export interface GmailBijlage {
  bestandsnaam: string
  mimeType: string
  attachmentId?: string
  /** Kleine bijlagen staan soms direct in het bericht (base64url) */
  data?: string
}

export interface Reactie {
  id: string
  threadId: string
  van: string
  aan: string
  cc: string
  /** Reply-To-kop (leeg als die er niet is) */
  antwoordAan: string
  /** Message-ID- en References-kop, om een antwoord in hetzelfde gesprek te zetten */
  messageId: string
  referenties: string[]
  bijlagen: GmailBijlage[]
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
  if (deel.mimeType === type && deel.body?.data && !deel.filename) return vanBase64Url(deel.body.data)
  for (const d of deel.parts ?? []) {
    const t = zoek(d, type)
    if (t !== null) return t
  }
  return null
}

/** Alle bijlagen (delen met een bestandsnaam) in een bericht. */
export function bijlagenUit(deel: GmailDeel | undefined): GmailBijlage[] {
  if (!deel) return []
  const hier: GmailBijlage[] =
    deel.filename && (deel.body?.attachmentId || deel.body?.data)
      ? [{ bestandsnaam: deel.filename, mimeType: deel.mimeType || "application/octet-stream", attachmentId: deel.body?.attachmentId, data: deel.body?.data }]
      : []
  return [...hier, ...(deel.parts ?? []).flatMap(bijlagenUit)]
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
      cc: kop(m.payload, "Cc"),
      antwoordAan: kop(m.payload, "Reply-To"),
      messageId: kop(m.payload, "Message-ID"),
      referenties: kop(m.payload, "References").split(/\s+/).filter(Boolean),
      bijlagen: bijlagenUit(m.payload),
      richting: labels.includes("SENT") ? "verstuurd" : "ontvangen",
      onderwerp: kop(m.payload, "Subject"),
      ontvangen: Number.isFinite(tijd) && tijd > 0 ? new Date(tijd).toISOString() : "",
      tekst: zonderCitaat(tekst),
      volledig: tekst.trim(),
    })
  }
  return uit
}

/** "Jan Test <Jan@Voorbeeld.test>" → "jan@voorbeeld.test" (eerste adres). */
export function adresUit(kopwaarde: string): string {
  const m = /<([^>]+)>/.exec(kopwaarde) ?? /([^\s,;<>"]+@[^\s,;<>"]+)/.exec(kopwaarde)
  return (m?.[1] ?? "").trim().toLowerCase()
}

/** Alle adressen in een To/Cc-kop, in kleine letters. */
export function adressenUit(kopwaarde: string): string[] {
  return kopwaarde.split(",").map(adresUit).filter(Boolean)
}

/** Gmail-zoekdatum: 2026-10-17 → "2026/10/17". */
export function gmailDatum(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/")
}

export interface MailMoment {
  /** E-mailadres van de huurder (kleine letters) */
  adres: string
  /** ISO-tijdstip */
  tijd: string
  onderwerp?: string
  id?: string
}

export interface OnbeantwoordeMail {
  adres: string
  tijd: string
  onderwerp: string
  id: string
  /** Aantal ontvangen mails sinds ons laatste antwoord */
  aantal: number
}

/**
 * Per huurderadres: de laatst ontvangen mail waarop nog niet is gereageerd.
 * "Gereageerd" = er is daarna een mail aan dat adres verstuurd (via de app of
 * Gmail), of de melding is als afgehandeld gemarkeerd (gezien[adres]).
 */
export function onbeantwoordeMails(
  ontvangen: MailMoment[],
  verstuurd: MailMoment[],
  gezien: Record<string, string> = {},
): OnbeantwoordeMail[] {
  const laatsteUit = new Map<string, string>()
  for (const v of verstuurd) {
    if (!laatsteUit.has(v.adres) || v.tijd > laatsteUit.get(v.adres)!) laatsteUit.set(v.adres, v.tijd)
  }
  const per = new Map<string, OnbeantwoordeMail>()
  for (const o of ontvangen) {
    const grens = [laatsteUit.get(o.adres) ?? "", gezien[o.adres] ?? ""].sort().at(-1)!
    if (o.tijd <= grens) continue
    const huidig = per.get(o.adres)
    if (!huidig) per.set(o.adres, { adres: o.adres, tijd: o.tijd, onderwerp: o.onderwerp ?? "", id: o.id ?? "", aantal: 1 })
    else {
      huidig.aantal++
      if (o.tijd > huidig.tijd) Object.assign(huidig, { tijd: o.tijd, onderwerp: o.onderwerp ?? "", id: o.id ?? "" })
    }
  }
  return [...per.values()].sort((a, b) => b.tijd.localeCompare(a.tijd))
}
