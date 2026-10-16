// De workflow komt uit de collectie `workflow_stappen` (configuratie). Hier
// staat alleen de logica: welke stappen gelden voor een boeking, wat de
// volgende actie is en welke overgangen zijn toegestaan.

export const GEANNULEERD = "geannuleerd"
export const AFGEROND = "afgerond"

export interface WorkflowStap {
  sleutel: string
  label: string
  actie_label: string
  omschrijving?: string
  volgorde: number
  overslaan_als?: string
  actief: boolean
}

/** Minimale boekingsgegevens die de workflow nodig heeft. */
export interface WorkflowBoeking {
  status: string
  betaalwijze?: string | null
  tb_aangegeven_op?: string | null
  tb_portaal_cent?: number | null
}

/**
 * Voorwaarden waarmee een stap automatisch wordt overgeslagen. De naam wordt
 * in `workflow_stappen.overslaan_als` gezet; nieuwe voorwaarden voeg je hier toe.
 */
export const VOORWAARDEN: Record<string, { omschrijving: string; geldt: (b: WorkflowBoeking) => boolean }> = {
  geen_aanbetaling: {
    omschrijving: "Overslaan als er geen aanbetaling is afgesproken",
    geldt: (b) => b.betaalwijze !== "aanbetaling",
  },
}

/** Overgangen die alleen mogen als aan een voorwaarde is voldaan. */
const VEREISTEN: Record<string, (b: WorkflowBoeking) => string | null> = {
  [AFGEROND]: (b) =>
    b.tb_aangegeven_op ? null : "Registreer eerst de aangifte toeristenbelasting voordat je de boeking afrondt.",
}

export function gesorteerd(stappen: WorkflowStap[]): WorkflowStap[] {
  return [...stappen].filter((s) => s.actief).sort((a, b) => a.volgorde - b.volgorde)
}

/** De stappen die voor deze boeking gelden (overgeslagen stappen eruit). */
export function stappenVoor(stappen: WorkflowStap[], boeking: WorkflowBoeking): WorkflowStap[] {
  return gesorteerd(stappen).filter((s) => {
    if (!s.overslaan_als) return true
    const v = VOORWAARDEN[s.overslaan_als]
    return !(v && v.geldt(boeking))
  })
}

/** Positie van de huidige status in de volledige (gesorteerde) lijst; -1 als onbekend. */
export function positie(stappen: WorkflowStap[], status: string): number {
  return gesorteerd(stappen).findIndex((s) => s.sleutel === status)
}

/** Is de boeking al bij (of voorbij) de gegeven stap? */
export function isBijOfVoorbij(stappen: WorkflowStap[], boeking: WorkflowBoeking, sleutel: string): boolean {
  if (boeking.status === GEANNULEERD) return false
  const huidig = positie(stappen, boeking.status)
  const doel = positie(stappen, sleutel)
  return huidig >= 0 && doel >= 0 && huidig >= doel
}

export function huidigeStap(stappen: WorkflowStap[], boeking: WorkflowBoeking): WorkflowStap | null {
  return gesorteerd(stappen).find((s) => s.sleutel === boeking.status) ?? null
}

/** De eerstvolgende stap die voor deze boeking geldt, of null als de boeking klaar of geannuleerd is. */
export function volgendeStap(stappen: WorkflowStap[], boeking: WorkflowBoeking): WorkflowStap | null {
  if (boeking.status === GEANNULEERD) return null
  const alle = gesorteerd(stappen)
  const huidig = alle.findIndex((s) => s.sleutel === boeking.status)
  const geldig = new Set(stappenVoor(stappen, boeking).map((s) => s.sleutel))
  for (let i = huidig + 1; i < alle.length; i++) {
    if (geldig.has(alle[i].sleutel)) return alle[i]
  }
  return null
}

/** Foutmelding als de overgang (nog) niet mag, anders null. */
export function overgangFout(stappen: WorkflowStap[], boeking: WorkflowBoeking, naar: string): string | null {
  if (naar === boeking.status) return "De boeking heeft deze status al."
  if (boeking.status === GEANNULEERD && naar !== GEANNULEERD) {
    // Heropenen mag, maar alleen bewust (wordt in de interface bevestigd).
    return null
  }
  if (naar !== GEANNULEERD && positie(stappen, naar) < 0) return "Onbekende status."
  const vereiste = VEREISTEN[naar]
  return vereiste ? vereiste(boeking) : null
}

export function labelVoor(stappen: WorkflowStap[], status: string): string {
  if (status === GEANNULEERD) return "Geannuleerd"
  return stappen.find((s) => s.sleutel === status)?.label ?? status
}

export interface StapWeergave {
  stap: WorkflowStap
  toestand: "gedaan" | "huidig" | "open" | "overgeslagen"
}

/** Voor de stappenbalk op de detailpagina. */
export function stappenbalk(stappen: WorkflowStap[], boeking: WorkflowBoeking): StapWeergave[] {
  const alle = gesorteerd(stappen)
  const geldig = new Set(stappenVoor(stappen, boeking).map((s) => s.sleutel))
  const huidig = alle.findIndex((s) => s.sleutel === boeking.status)
  return alle.map((stap, i) => ({
    stap,
    toestand: !geldig.has(stap.sleutel)
      ? "overgeslagen"
      : i < huidig
        ? "gedaan"
        : i === huidig
          ? "huidig"
          : "open",
  }))
}

/** Stappen die de app zelf zet zodra een betaling binnen is. */
export const BETAALSTAPPEN = new Set(["aanbetaling_ontvangen", "volledig_betaald"])

/**
 * Tot welke stap een binnengekomen betaling de boeking mag doorschuiven
 * (doel: "aanbetaling_ontvangen" of "volledig_betaald"). Handmatige stappen
 * vóór de factuur worden overgeslagen, zoals altijd; een handmatige stap ná
 * de factuur (bijv. aanmelden in het Le Duc-portaal) houdt het doorschuiven
 * tegen, zodat die stap niet ongemerkt wordt overgeslagen. Geeft null als de
 * boeking niet verder kan.
 */
export function doorschuivenTot(stappen: WorkflowStap[], boeking: WorkflowBoeking, doel: string): string | null {
  const geldig = stappenVoor(stappen, boeking)
  const huidig = geldig.findIndex((s) => s.sleutel === boeking.status)
  const factuur = geldig.findIndex((s) => s.sleutel === "factuur_verstuurd")
  let uit: string | null = null
  for (let i = huidig + 1; i < geldig.length; i++) {
    const s = geldig[i]
    if (BETAALSTAPPEN.has(s.sleutel)) {
      uit = s.sleutel
      if (s.sleutel === doel) break
      continue
    }
    if (factuur >= 0 && i > factuur) break
  }
  return uit
}
