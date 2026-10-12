import { dagenTussen, vandaag } from "../domein/datum"
import type { Cent } from "../domein/geld"
import { aanbetalingVervaldatum, restVervaldatum } from "../domein/betaling"
import { berekenToeristenbelasting, tariefOpDatum, type TbBerekening } from "../domein/toeristenbelasting"
import { AFGEROND, GEANNULEERD } from "../domein/workflow"
import type { Boeking, Instellingen, TbTariefRecord } from "./types"

export function aantalNachten(b: Pick<Boeking, "aankomst" | "vertrek">): number {
  return Math.max(0, dagenTussen(b.aankomst, b.vertrek))
}

export function extrasTotaal(b: Boeking): Cent {
  const n = aantalNachten(b)
  return (b.extras ?? []).reduce((t, e) => t + e.prijs_cent * e.aantal * (e.eenheid === "per_nacht" ? n : 1), 0)
}

/** Toeristenbelasting die op de factuur komt: het portaalbedrag gaat altijd voor. */
export function tbOpFactuur(b: Boeking): Cent | null {
  if (b.tb_portaal_op) return b.tb_portaal_cent
  return null
}

export function totaalBoeking(b: Boeking): Cent {
  return b.huur_cent + b.parkkosten_cent + b.schoonmaak_cent + extrasTotaal(b) + (tbOpFactuur(b) ?? b.tb_berekend_cent ?? 0)
}

/** Richtberekening toeristenbelasting voor een boeking (huur incl. parkkosten). */
export function tbRichtbedrag(
  b: Pick<Boeking, "aankomst" | "vertrek" | "huur_cent" | "parkkosten_cent" | "volwassenen" | "kinderen">,
  tarieven: TbTariefRecord[],
  personen?: { volwassenen: number; kinderen: number },
): TbBerekening | null {
  const tarief = tariefOpDatum(
    tarieven.map((t) => ({ ...t, opslagen: t.opslagen ?? [] })),
    b.aankomst,
  )
  if (!tarief) return null
  return berekenToeristenbelasting(
    {
      verblijfskostenCent: b.huur_cent + b.parkkosten_cent,
      nachten: aantalNachten(b),
      volwassenen: personen?.volwassenen ?? b.volwassenen,
      kinderen: personen?.kinderen ?? b.kinderen,
    },
    tarief,
  )
}

export function isActief(b: Boeking): boolean {
  return b.status !== GEANNULEERD && b.status !== AFGEROND
}

/**
 * Extra velden die meeveranderen bij een statuswijziging. Bijvoorbeeld: bij
 * "Factuur verstuurd" worden de vervaldatums vastgelegd als ze nog leeg zijn.
 */
export function bijStatuswijziging(b: Boeking, naar: string, inst: Instellingen): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  if (naar === "factuur_verstuurd") {
    if (b.betaalwijze === "aanbetaling" && !b.aanbetaling_vervaldatum) {
      extra.aanbetaling_vervaldatum = aanbetalingVervaldatum(vandaag(), inst.aanbetaling_termijn_maanden)
    }
    if (!b.rest_vervaldatum) {
      extra.rest_vervaldatum = restVervaldatum(b.aankomst, inst.rest_weken_voor_aankomst)
    }
  }
  return extra
}
