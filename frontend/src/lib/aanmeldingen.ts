import { pb } from "./pb"
import type { AanmeldingRecord, Boeking, Huurder } from "./types"
import { maakAanmelding, telPersonen, type Aanmelding } from "../domein/aanmelding"
import { isBijOfVoorbij, type WorkflowStap } from "../domein/workflow"

// Inzendingen van het aanmeldformulier (collectie `aanmeldingen`): na
// bevestiging overnemen in de huurder en de boeking.

export interface Inzending {
  id: string
  ontvangen: string
  aanmelding: Aanmelding
  /** De boeking die de server bij de boekingscode vond. */
  boekingId?: string
  /** Waarom de server niet automatisch koppelde. */
  toelichting?: string
}

/** Adres van het aanmeldformulier van deze app (bijv. https://verhuur.…/aanmelden/). */
export function formulierUrl(): string {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}aanmelden/`
}

export function uitFormulier(r: AanmeldingRecord): Inzending {
  return {
    id: r.id,
    ontvangen: r.created,
    aanmelding: maakAanmelding(r.velden ?? {}),
    boekingId: r.boeking || undefined,
    toelichting: r.toelichting || undefined,
  }
}

export async function verwijderInzending(id: string): Promise<void> {
  await pb.collection("aanmeldingen").delete(id)
}

/** Bij welke boeking is deze inzending al verwerkt? */
export function verwerktBij(i: Inzending, boekingen: Boeking[]): Boeking | undefined {
  return boekingen.find((b) => (b.aanmelding as Record<string, unknown> | null)?.aanmelding_id === i.id)
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
    aanmelding: { ...a, aanmelding_id: inzending.id, ontvangen: inzending.ontvangen },
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
  await pb.collection("aanmeldingen").update(inzending.id, { status: "verwerkt", boeking: boeking.id })
}
