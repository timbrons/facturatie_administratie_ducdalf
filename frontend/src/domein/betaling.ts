import { plusDagen, plusMaanden, type IsoDatum } from "./datum"
import { percentageVan, type Cent } from "./geld"

export type Betaalwijze = "ineens" | "aanbetaling"

export interface Betaaltermijnen {
  betaalwijze: Betaalwijze
  /** Aanbetaling afgesproken, maar de restbetaling vervalt al vóór de aanbetaling: één termijn. */
  omgezetNaarIneens: boolean
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

/** Minimale betaaltermijn in dagen, ook als de aankomst dichtbij is. */
export const MINIMALE_TERMIJN_DAGEN = 7

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
  const aanbetalingDatum = input.aanbetalingVervaldatum || aanbetalingVervaldatum(input.factuurdatum, input.aanbetalingTermijnMaanden)
  const omgezet = input.betaalwijze === "aanbetaling" && aanbetalingDatum >= rest
  if (input.betaalwijze === "ineens" || omgezet) {
    // Eén termijn: uiterlijk de vervaldatum van de aanbetaling, niet later dan
    // 4 weken voor aankomst, maar altijd minstens een week na de factuurdatum
    // (en niet na de aankomst).
    let termijn = aanbetalingVervaldatum(input.factuurdatum, input.aanbetalingTermijnMaanden)
    if (rest < termijn) termijn = rest
    const minimaal = plusDagen(input.factuurdatum, MINIMALE_TERMIJN_DAGEN)
    if (termijn < minimaal) termijn = minimaal < input.aankomst ? minimaal : input.factuurdatum
    return {
      betaalwijze: "ineens",
      omgezetNaarIneens: omgezet,
      aanbetalingCent: 0,
      aanbetalingVervaldatum: null,
      restCent: input.totaalCent,
      restVervaldatum: termijn,
    }
  }
  const aanbetalingCent = percentageVan(input.totaalCent, input.aanbetalingPct)
  return {
    betaalwijze: "aanbetaling",
    omgezetNaarIneens: false,
    aanbetalingCent,
    aanbetalingVervaldatum: aanbetalingDatum,
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
