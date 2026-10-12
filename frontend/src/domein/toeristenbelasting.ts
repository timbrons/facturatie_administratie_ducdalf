import { rondAf, type Cent } from "./geld"

// Richtberekening van de taxe de séjour voor een niet-geclassificeerde
// accommodatie, volgens het rekenblad "Toeristenbelasting_PLD.xlsx":
//
//   kosten per persoon per nacht = nachtprijs / alle personen (incl. minderjarigen)
//   basistarief                  = percentage daarvan, afgetopt op het plafond
//   tarief                       = afgerond(basistarief)
//                                  + afgerond(basistarief × opslag) per opslag
//   belasting                    = tarief × volwassenen × nachten
//
// Het bedrag uit de simulatie in het portaal is altijd leidend; deze
// berekening dient alleen als controle.

export interface TbTarief {
  geldig_vanaf: string
  percentage_bp: number
  plafond_cent: Cent
  opslagen: { naam: string; bp: number }[]
  volwassen_vanaf_leeftijd?: number
}

export interface TbInvoer {
  /** Totale verblijfskosten waarover de belasting gaat (huur incl. parkkosten) */
  verblijfskostenCent: Cent
  nachten: number
  volwassenen: number
  kinderen: number
}

export interface TbBerekening {
  nachtprijsCent: number
  kostenPerPersoonPerNachtCent: number
  basistariefCent: Cent
  opslagen: { naam: string; cent: Cent }[]
  tariefPerPersoonPerNachtCent: Cent
  totaalCent: Cent
  afgetopt: boolean
}

/** Het tarief dat geldt op een datum: het laatste tarief met geldig_vanaf <= datum. */
export function tariefOpDatum(tarieven: TbTarief[], datum: string): TbTarief | null {
  let beste: TbTarief | null = null
  for (const t of tarieven) {
    if (t.geldig_vanaf <= datum && (!beste || t.geldig_vanaf > beste.geldig_vanaf)) beste = t
  }
  return beste
}

export function berekenToeristenbelasting(invoer: TbInvoer, tarief: TbTarief): TbBerekening {
  const personen = invoer.volwassenen + invoer.kinderen
  if (invoer.nachten <= 0 || personen <= 0) {
    return {
      nachtprijsCent: 0,
      kostenPerPersoonPerNachtCent: 0,
      basistariefCent: 0,
      opslagen: tarief.opslagen.map((o) => ({ naam: o.naam, cent: 0 })),
      tariefPerPersoonPerNachtCent: 0,
      totaalCent: 0,
      afgetopt: false,
    }
  }
  // Basistarief als exacte breuk in centen: teller / noemer.
  let teller = invoer.verblijfskostenCent * tarief.percentage_bp
  let noemer = invoer.nachten * personen * 10000
  const afgetopt = teller > tarief.plafond_cent * noemer
  if (afgetopt) {
    teller = tarief.plafond_cent
    noemer = 1
  }
  const basistariefCent = rondAf(teller, noemer)
  const opslagen = tarief.opslagen.map((o) => ({ naam: o.naam, cent: rondAf(teller * o.bp, noemer * 10000) }))
  const tariefCent = basistariefCent + opslagen.reduce((t, o) => t + o.cent, 0)
  return {
    nachtprijsCent: invoer.verblijfskostenCent / invoer.nachten,
    kostenPerPersoonPerNachtCent: invoer.verblijfskostenCent / invoer.nachten / personen,
    basistariefCent,
    opslagen,
    tariefPerPersoonPerNachtCent: tariefCent,
    totaalCent: tariefCent * invoer.volwassenen * invoer.nachten,
    afgetopt,
  }
}
