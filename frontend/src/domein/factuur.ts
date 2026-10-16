import { formatKort, type IsoDatum } from "./datum"
import { formatEuro, type Cent } from "./geld"
import type { ExtraRegel } from "./prijs"
import type { Betaaltermijnen } from "./betaling"

export type RegelSoort = "huur" | "schoonmaak" | "parkkosten" | "extra" | "toeristenbelasting" | "overig"

export interface Factuurregel {
  soort: RegelSoort
  omschrijving: string
  nachten?: number | null
  personen?: number | null
  bedrag_cent: Cent
}

export interface FactuurBoeking {
  aankomst: IsoDatum
  vertrek: IsoDatum
  volwassenen: number
  huur_cent: Cent
  parkkosten_cent: Cent
  schoonmaak_cent: Cent
  extras: ExtraRegel[] | null
  tb_portaal_cent: Cent
  nachten: number
}

/** Factuurregels in de volgorde van de voorbeeldfactuur. */
export function bouwFactuurregels(b: FactuurBoeking): Factuurregel[] {
  const regels: Factuurregel[] = [
    { soort: "huur", omschrijving: "Huur", nachten: b.nachten, bedrag_cent: b.huur_cent },
    { soort: "schoonmaak", omschrijving: "Eindschoonmaak", bedrag_cent: b.schoonmaak_cent },
  ]
  if (b.parkkosten_cent > 0) regels.push({ soort: "parkkosten", omschrijving: "Parkkosten", bedrag_cent: b.parkkosten_cent })
  for (const e of b.extras ?? []) {
    if (e.aantal <= 0) continue
    const factor = e.eenheid === "per_nacht" ? b.nachten : 1
    regels.push({
      soort: "extra",
      omschrijving: e.aantal > 1 ? `${e.naam} (${e.aantal}×)` : e.naam,
      nachten: e.eenheid === "per_nacht" ? b.nachten : null,
      bedrag_cent: e.prijs_cent * e.aantal * factor,
    })
  }
  regels.push({
    soort: "toeristenbelasting",
    omschrijving: "Toeristenbelasting",
    nachten: b.nachten,
    personen: b.volwassenen,
    bedrag_cent: b.tb_portaal_cent,
  })
  return regels
}

export function totaalVan(regels: Factuurregel[]): Cent {
  return regels.reduce((t, r) => t + r.bedrag_cent, 0)
}

/** Betaaltekst onder de factuur. */
export function betaaltekst(t: Betaaltermijnen, aanbetalingPct: number, restWeken: number): string {
  if (t.betaalwijze === "aanbetaling") {
    return (
      `Graag ${aanbetalingPct}% van het factuurbedrag (${formatEuro(t.aanbetalingCent)}) vóór ${formatKort(t.aanbetalingVervaldatum)} voldoen ` +
      `en het resterende bedrag (${formatEuro(t.restCent)}) uiterlijk ${formatKort(t.restVervaldatum)} (${restWeken} weken voor aankomst).`
    )
  }
  return `Graag het factuurbedrag (${formatEuro(t.restCent)}) uiterlijk ${formatKort(t.restVervaldatum)} voldoen.`
}

// ---------------------------------------------------------------------------
// Betaalstatus
// ---------------------------------------------------------------------------

export type Betaalstatus = "concept" | "open" | "deels betaald" | "betaald" | "vervallen" | "geannuleerd"

export interface StatusFactuur {
  id: string
  nummer: string
  totaal_cent: Cent
  aanbetaling_cent: Cent
  aanbetaling_vervaldatum: string
  rest_vervaldatum: string
  /** Gezet als de factuur is geannuleerd (bijv. door een annulering van de boeking) */
  geannuleerd_op?: string
}

/** Geldige facturen: definitief (genummerd) en niet geannuleerd. */
export function geldigeFacturen<T extends Pick<StatusFactuur, "nummer" | "geannuleerd_op">>(facturen: T[]): T[] {
  return facturen.filter((f) => f.nummer && !f.geannuleerd_op)
}

/**
 * Betaalstatus van een factuur, op basis van de betalingen bij de boeking.
 * Een geannuleerde factuur telt niet meer mee.
 */
export function betaalstatus(f: StatusFactuur, alleFacturen: StatusFactuur[], betaaldCent: Cent, vandaag: IsoDatum): Betaalstatus {
  if (!f.nummer) return "concept"
  if (f.geannuleerd_op) return "geannuleerd"
  const saldo = openstaand(alleFacturen, betaaldCent)
  if (saldo <= 0) return "betaald"
  const vervallenDeel =
    (f.aanbetaling_vervaldatum && f.aanbetaling_vervaldatum < vandaag && betaaldCent < f.aanbetaling_cent) ||
    (f.rest_vervaldatum && f.rest_vervaldatum < vandaag)
  if (vervallenDeel) return "vervallen"
  return betaaldCent > 0 ? "deels betaald" : "open"
}

/**
 * Totaal van de geldige facturen min wat is betaald. Zonder geldige factuur
 * (alles geannuleerd) staat er niets open; een eventuele terugbetaling wordt
 * met de huurder afgesproken en als negatieve betaling geregistreerd.
 */
export function openstaand(facturen: Pick<StatusFactuur, "nummer" | "totaal_cent" | "geannuleerd_op">[], betaaldCent: Cent): Cent {
  const geldig = geldigeFacturen(facturen)
  if (geldig.length === 0) return 0
  return geldig.reduce((t, f) => t + f.totaal_cent, 0) - betaaldCent
}
