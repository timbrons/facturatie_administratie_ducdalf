import { pb } from "./pb"
import { googleFetch, heeftRecht, SCOPES } from "./gmail"
import type { AanmeldingRecord, Boeking, Huurder } from "./types"
import { leesVelden, maakAanmelding, telPersonen, type Aanmelding } from "../domein/aanmelding"
import { isBijOfVoorbij, type WorkflowStap } from "../domein/workflow"

// Inzendingen van het aanmeldformulier: uit de eigen collectie `aanmeldingen`
// (het formulier in deze app) of, voor het oude formulier, uit Gmail (alleen
// lezen). Na bevestiging overnemen in de huurder en de boeking.

export interface Inzending {
  bron: "formulier" | "gmail"
  id: string
  ontvangen: string
  onderwerp: string
  aanmelding: Aanmelding
  /** Formulier: de boeking die de server bij de boekingscode vond. */
  boekingId?: string
  /** Formulier: waarom de server niet automatisch koppelde. */
  toelichting?: string
}

/** Adres van het aanmeldformulier van deze app (bijv. https://verhuur.…/aanmelden/). */
export function formulierUrl(): string {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}aanmelden/`
}

export function uitFormulier(r: AanmeldingRecord): Inzending {
  return {
    bron: "formulier",
    id: r.id,
    ontvangen: r.created,
    onderwerp: "",
    aanmelding: maakAanmelding(r.velden ?? {}),
    boekingId: r.boeking || undefined,
    toelichting: r.toelichting || undefined,
  }
}

export async function verwijderInzending(id: string): Promise<void> {
  await pb.collection("aanmeldingen").delete(id)
}

export function lezenBeschikbaar(): boolean {
  return heeftRecht(SCOPES.lezen)
}

function decodeer(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

interface Deel { mimeType?: string; body?: { data?: string }; parts?: Deel[]; headers?: { name: string; value: string }[] }

function zoekDelen(deel: Deel, uit: { html?: string; tekst?: string }) {
  if (deel.mimeType === "text/html" && deel.body?.data && !uit.html) uit.html = decodeer(deel.body.data)
  if (deel.mimeType === "text/plain" && deel.body?.data && !uit.tekst) uit.tekst = decodeer(deel.body.data)
  for (const p of deel.parts ?? []) zoekDelen(p, uit)
}

export async function haalInzendingen(zoekopdracht: string, max = 30): Promise<Inzending[]> {
  const q = zoekopdracht || "from:formsubmit.co aanmelding"
  const lijst = await (await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`)).json()
  const uit: Inzending[] = []
  for (const m of lijst.messages ?? []) {
    const bericht = await (await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`)).json()
    const inhoud: { html?: string; tekst?: string } = {}
    zoekDelen(bericht.payload ?? {}, inhoud)
    const velden = leesVelden(inhoud)
    if (Object.keys(velden).length === 0) continue
    uit.push({
      bron: "gmail",
      id: m.id,
      ontvangen: new Date(Number(bericht.internalDate)).toISOString(),
      onderwerp: (bericht.payload?.headers ?? []).find((h: { name: string }) => h.name.toLowerCase() === "subject")?.value ?? "",
      aanmelding: maakAanmelding(velden),
    })
  }
  return uit
}

/** Bij welke boeking is deze inzending al verwerkt? */
export function verwerktBij(i: Inzending, boekingen: Boeking[]): Boeking | undefined {
  const sleutel = i.bron === "gmail" ? "gmail_id" : "aanmelding_id"
  return boekingen.find((b) => (b.aanmelding as Record<string, unknown> | null)?.[sleutel] === i.id)
}

export interface Overname { huurder: boolean; personen: boolean; kenteken: boolean }

export async function neemOver(
  inzending: Inzending,
  boeking: Boeking,
  stappen: WorkflowStap[],
  keuze: Overname,
): Promise<void> {
  const a = inzending.aanmelding
  const h = boeking.expand?.huurder as Huurder | undefined
  if (keuze.huurder && h) {
    const velden: Record<string, string> = {
      aanhef: a.aanhef, voornaam: a.voornaam, achternaam: a.achternaam, adres: a.adres, postcode: a.postcode,
      plaats: a.plaats, telefoon_mobiel: a.telefoonMobiel, telefoon_vast: a.telefoonVast, email: a.email,
    }
    if (keuze.kenteken && a.kenteken) velden.kenteken = a.kenteken
    // Alleen ingevulde waarden overnemen; lege velden van het formulier overschrijven niets.
    const data = Object.fromEntries(Object.entries(velden).filter(([, w]) => w))
    if (Object.keys(data).length) await pb.collection("huurders").update(h.id, data)
  }
  const telling = telPersonen(a, boeking.aankomst)
  const data: Record<string, unknown> = {
    aanmelding: { ...a, [inzending.bron === "gmail" ? "gmail_id" : "aanmelding_id"]: inzending.id, ontvangen: inzending.ontvangen },
    aanmelding_op: new Date().toISOString(),
  }
  if (keuze.kenteken && a.kenteken) data.kenteken = a.kenteken
  if (keuze.personen) {
    data.volwassenen = telling.volwassenen
    data.kinderen = telling.kinderen
  }
  if (boeking.status !== "geannuleerd" && !isBijOfVoorbij(stappen, boeking, "aanmeldformulier_ontvangen")) {
    data.status = "aanmeldformulier_ontvangen"
  }
  await pb.collection("boekingen").update(boeking.id, data)
  if (inzending.bron === "formulier") {
    await pb.collection("aanmeldingen").update(inzending.id, { status: "verwerkt", boeking: boeking.id })
  }
}
