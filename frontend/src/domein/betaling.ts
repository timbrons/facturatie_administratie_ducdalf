import { plusDagen, plusMaanden, type IsoDatum } from "./datum"
import { percentageVan, type Cent } from "./geld"

export type Betaalwijze = "ineens" | "aanbetaling"

export interface Betaaltermijnen {
  betaalwijze: Betaalwijze
  aanbetalingCent: Cent
  aanbetalingVervaldatum: IsoDatum | null
  restCent: Cent
  restVervaldatum: IsoDatum
}

/** Vervaldatum aanbetaling: factuurdatum + X maanden (standaard 1). */
export function aanbetalingVervaldatum(factuurdatum: IsoDatum, maanden: number): IsoDatum {
  return plusMaanden(factuurdatum, maanden)
}

/** Vervaldatum restbetaling: aankomst − X weken (standaard 4). */
export function restVervaldatum(aankomst: IsoDatum, weken: number): IsoDatum {
  return plusDagen(aankomst, -7 * weken)
}

export function berekenTermijnen(input: {
  totaalCent: Cent
  betaalwijze: Betaalwijze
  aanbetalingPct: number
  factuurdatum: IsoDatum
  aankomst: IsoDatum
  aanbetalingTermijnMaanden: number
  restWekenVoorAankomst: number
  /** Handmatig afgesproken vervaldatum aanbetaling */
  aanbetalingVervaldatum?: IsoDatum | null
}): Betaaltermijnen {
  const rest = restVervaldatum(input.aankomst, input.restWekenVoorAankomst)
  if (input.betaalwijze === "ineens") {
    // Bij betaling ineens: uiterlijk de vervaldatum van de aanbetaling, maar nooit later dan 4 weken voor aankomst.
    const termijn = aanbetalingVervaldatum(input.factuurdatum, input.aanbetalingTermijnMaanden)
    return {
      betaalwijze: "ineens",
      aanbetalingCent: 0,
      aanbetalingVervaldatum: null,
      restCent: input.totaalCent,
      restVervaldatum: termijn < rest ? termijn : rest,
    }
  }
  const aanbetalingCent = percentageVan(input.totaalCent, input.aanbetalingPct)
  return {
    betaalwijze: "aanbetaling",
    aanbetalingCent,
    aanbetalingVervaldatum:
      input.aanbetalingVervaldatum || aanbetalingVervaldatum(input.factuurdatum, input.aanbetalingTermijnMaanden),
    restCent: input.totaalCent - aanbetalingCent,
    restVervaldatum: rest,
  }
}

/**
 * Een aanbetaling heeft geen zin als de restbetaling al vervalt vóór of op
 * de vervaldatum van de aanbetaling (boeking kort voor aankomst).
 */
export function aanbetalingZinvol(factuurdatum: IsoDatum, aankomst: IsoDatum, maanden: number, weken: number): boolean {
  return aanbetalingVervaldatum(factuurdatum, maanden) < restVervaldatum(aankomst, weken)
}
