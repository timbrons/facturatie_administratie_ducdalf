import { useQuery } from "@tanstack/react-query"
import { googleFetch, haalServerToken, heeftRecht, SCOPES, verstuurViaGmail } from "./gmail"
import type { Huurder, MailLog } from "./types"
import {
  adresUit, adressenUit, bijlagenUit, gmailDatum, onbeantwoordeMails, reactiesUit,
  type GmailBericht, type GmailBijlage, type MailMoment, type OnbeantwoordeMail, type Reactie,
} from "../domein/mailgesprek"
import { bouwMime, naarBase64Url, nieuwMessageId, type MailBijlage } from "../domein/mime"

// Mails van en aan huurders, rechtstreeks uit Gmail (via de vaste koppeling,
// gmail.readonly). Twee bronnen:
//  - het Gmail-gesprek van elke mail die vanuit de app is verstuurd
//    (vangt ook een antwoord vanaf een ander adres);
//  - een zoekopdracht op het e-mailadres van de huurder (vangt losse mails,
//    ook van vóór de eerste mail uit de app).
// Er wordt niets opgeslagen; Gmail blijft de bron.

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"

export interface Gesprek {
  reacties: Reactie[]
  /** false: de koppeling heeft (nog) geen leesrecht voor Gmail */
  beschikbaar: boolean
}

async function magLezen(): Promise<boolean> {
  if (!heeftRecht(SCOPES.lezen)) await haalServerToken()
  return heeftRecht(SCOPES.lezen)
}

/** Zoekt berichten in Gmail (zoals in de zoekbalk van Gmail). Geeft de ID's, nieuwste eerst. */
async function zoekIds(q: string, max: number): Promise<string[]> {
  const res = await googleFetch(`${GMAIL}/messages?${new URLSearchParams({ q, maxResults: String(max) })}`)
  if (!res.ok) throw new Error(`Zoeken in Gmail mislukt (${res.status}).`)
  const data = (await res.json()) as { messages?: { id: string }[] }
  return (data.messages ?? []).map((m) => m.id)
}

async function haalBericht(id: string, format: "full" | "metadata"): Promise<GmailBericht | null> {
  const extra = format === "metadata" ? "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject" : ""
  const res = await googleFetch(`${GMAIL}/messages/${encodeURIComponent(id)}?format=${format}${extra}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Een mail kon niet uit Gmail worden gelezen (${res.status}).`)
  return (await res.json()) as GmailBericht
}

export interface MailOpties {
  /** E-mailadres van de huurder: ook losse mails van en aan dit adres tonen */
  email?: string
  /** Alleen mails vanaf / tot deze datum (IsoDatum), bijv. rond een boeking */
  van?: string
  tot?: string
}

/** Mails rond een boeking of huurder die niet via de app zijn verstuurd. */
export function useMailgesprek(sleutel: string, mails: MailLog[], opties: MailOpties = {}) {
  const threads = [...new Set(mails.map((m) => m.gmail_thread_id).filter(Boolean))].sort()
  const email = (opties.email ?? "").trim().toLowerCase()
  return useQuery<Gesprek>({
    queryKey: ["mailgesprek", sleutel, threads.join(","), email, opties.van ?? "", opties.tot ?? ""],
    enabled: threads.length > 0 || !!email,
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!(await magLezen())) return { reacties: [], beschikbaar: false }
      const eigen = new Set(mails.map((m) => m.gmail_message_id).filter(Boolean))
      const berichten = new Map<string, GmailBericht>()
      for (const id of threads) {
        const res = await googleFetch(`${GMAIL}/threads/${encodeURIComponent(id)}?format=full`)
        if (res.status === 404) continue
        if (!res.ok) throw new Error(`Het Gmail-gesprek kon niet worden gelezen (${res.status}).`)
        const data = (await res.json()) as { messages?: GmailBericht[] }
        for (const m of data.messages ?? []) berichten.set(m.id, m)
      }
      if (email.includes("@")) {
        let q = `(from:${email} OR to:${email})`
        if (opties.van) q += ` after:${gmailDatum(opties.van)}`
        if (opties.tot) q += ` before:${gmailDatum(opties.tot)}`
        for (const id of await zoekIds(q, 30)) {
          if (berichten.has(id) || eigen.has(id)) continue
          const m = await haalBericht(id, "full")
          if (m) berichten.set(m.id, m)
        }
      }
      return { reacties: reactiesUit([...berichten.values()], eigen), beschikbaar: true }
    },
  })
}

export interface NieuweMail extends OnbeantwoordeMail {
  huurder: Pick<Huurder, "id" | "voornaam" | "achternaam" | "email">
}

/**
 * Mails van huurders (laatste 60 dagen) waarop nog niet is gereageerd: na de
 * laatste ontvangen mail is er geen mail aan dat adres verstuurd (via de app
 * of Gmail) en is de melding niet als afgehandeld gemarkeerd.
 */
export function useNieuweMails(huurders: Huurder[], maillog: MailLog[], aan: boolean) {
  const adressen = [...new Set(huurders.map((h) => h.email.trim().toLowerCase()).filter((e) => e.includes("@")))].sort()
  return useQuery<NieuweMail[] | null>({
    queryKey: ["nieuwe-mails", adressen.join(","), maillog.length, huurders.map((h) => h.mail_gezien_tot ?? "").join(",")],
    enabled: aan && adressen.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!(await magLezen())) return null
      const ontvangen: MailMoment[] = []
      const verstuurd: MailMoment[] = []
      // In blokken, zodat de zoekopdracht niet te lang wordt.
      for (let i = 0; i < adressen.length; i += 20) {
        const blok = adressen.slice(i, i + 20)
        const lijst = blok.join(" OR ")
        const inIds = await zoekIds(`from:(${lijst}) newer_than:60d -in:sent`, 50)
        const uitIds = await zoekIds(`to:(${lijst}) in:sent newer_than:60d`, 50)
        for (const [ids, doel] of [[inIds, ontvangen], [uitIds, verstuurd]] as const) {
          for (const id of ids) {
            const m = await haalBericht(id, "metadata")
            if (!m) continue
            const kop = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ""
            const tijd = new Date(Number(m.internalDate)).toISOString()
            const adressenHier = doel === ontvangen ? [adresUit(kop("From"))] : adressenUit(kop("To"))
            for (const adres of adressenHier) if (blok.includes(adres)) doel.push({ adres, tijd, onderwerp: kop("Subject"), id: m.id })
          }
        }
      }
      // Mails die via de app zijn verstuurd tellen ook als antwoord.
      for (const l of maillog) {
        const d = new Date(l.created.replace(" ", "T"))
        if (Number.isNaN(d.getTime())) continue
        for (const adres of adressenUit(l.aan)) verstuurd.push({ adres, tijd: d.toISOString() })
      }
      const gezien: Record<string, string> = {}
      for (const h of huurders) if (h.mail_gezien_tot) gezien[h.email.trim().toLowerCase()] = h.mail_gezien_tot
      return onbeantwoordeMails(ontvangen, verstuurd, gezien).flatMap((o) => {
        const huurder = huurders.find((h) => h.email.trim().toLowerCase() === o.adres)
        return huurder ? [{ ...o, huurder }] : []
      })
    },
  })
}

/** De bijlagen van een mail in Gmail (bijv. een mail die vanuit de app is verstuurd). */
export async function gmailBijlagen(gmailId: string): Promise<GmailBijlage[]> {
  if (!(await magLezen())) throw new Error("De Google-koppeling mag Gmail nog niet lezen. Klik bij Instellingen op Opnieuw koppelen.")
  const m = await haalBericht(gmailId, "full")
  return m ? bijlagenUit(m.payload) : []
}

/** Haalt de inhoud van een bijlage op, klaar om mee te sturen. */
export async function laadGmailBijlage(gmailId: string, b: GmailBijlage): Promise<MailBijlage> {
  let data = b.data
  if (!data && b.attachmentId) {
    const res = await googleFetch(`${GMAIL}/messages/${encodeURIComponent(gmailId)}/attachments/${encodeURIComponent(b.attachmentId)}`)
    if (!res.ok) throw new Error(`Bijlage "${b.bestandsnaam}" kon niet uit Gmail worden gehaald (${res.status}).`)
    data = ((await res.json()) as { data?: string }).data
  }
  if (!data) throw new Error(`Bijlage "${b.bestandsnaam}" is leeg.`)
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return { bestandsnaam: b.bestandsnaam, mimeType: b.mimeType, base64: b64 + "=".repeat((4 - (b64.length % 4)) % 4) }
}

export interface Antwoord {
  van: string
  aan: string
  cc?: string
  onderwerp: string
  tekst: string
  bijlagen: MailBijlage[]
  /** Bij beantwoorden: in hetzelfde Gmail-gesprek */
  threadId?: string
  antwoordOp?: string
  referenties?: string[]
}

/** Verstuurt een antwoord of doorgestuurde mail via Gmail (alleen na een klik op Versturen). */
export async function verstuurAntwoord(a: Antwoord) {
  const mime = bouwMime({
    van: a.van,
    aan: a.aan,
    cc: a.cc || undefined,
    onderwerp: a.onderwerp,
    tekst: a.tekst,
    bijlagen: a.bijlagen,
    messageId: nieuwMessageId("vakantiehuis-ducdalf.nl"),
    antwoordOp: a.antwoordOp || undefined,
    referenties: a.antwoordOp ? [...(a.referenties ?? []), a.antwoordOp].slice(-10) : undefined,
  })
  return verstuurViaGmail(naarBase64Url(mime), a.threadId || undefined)
}
