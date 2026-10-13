import { nachten as nachtenVan, type IsoDatum, dagenTussen } from "./datum"
import type { Cent } from "./geld"

export interface Seizoen {
  id?: string
  naam: string
  van: IsoDatum
  tot: IsoDatum
  /** Prijs per nacht inclusief parkkosten */
  prijs_per_nacht_cent: Cent
  min_nachten?: number
}

export interface NachtPrijs {
  datum: IsoDatum
  seizoen: string | null
  cent: Cent
}

export interface HuurBerekening {
  nachten: number
  perNacht: NachtPrijs[]
  /** Som van de nachtprijzen (inclusief parkkosten) */
  totaalCent: Cent
  /** Nachten waarvoor geen seizoen is ingesteld */
  ontbrekend: IsoDatum[]
  /** Hoogste minimum aantal nachten van de betrokken seizoenen */
  minNachten: number
  /** Per seizoen: aantal nachten en prijs, voor een leesbare opbouw */
  perSeizoen: { naam: string; nachten: number; prijsPerNachtCent: Cent }[]
}

/**
 * Het seizoen voor een nacht: de nacht valt in het seizoen waarin hij begint
 * (van <= datum <= tot). Vallen er meerdere seizoenen op die datum (een
 * grensdatum), dan wint het seizoen dat het laatst begint.
 */
export function seizoenVoorNacht(datum: IsoDatum, seizoenen: Seizoen[]): Seizoen | null {
  let beste: Seizoen | null = null
  for (const s of seizoenen) {
    if (s.van <= datum && datum <= s.tot) {
      if (!beste || s.van > beste.van) beste = s
    }
  }
  return beste
}

export function berekenHuur(aankomst: IsoDatum, vertrek: IsoDatum, seizoenen: Seizoen[]): HuurBerekening {
  const perNacht: NachtPrijs[] = []
  const ontbrekend: IsoDatum[] = []
  let minNachten = 0
  const perSeizoen = new Map<string, { naam: string; nachten: number; prijsPerNachtCent: Cent }>()
  for (const datum of nachtenVan(aankomst, vertrek)) {
    const s = seizoenVoorNacht(datum, seizoenen)
    if (!s) {
      ontbrekend.push(datum)
      perNacht.push({ datum, seizoen: null, cent: 0 })
      continue
    }
    perNacht.push({ datum, seizoen: s.naam, cent: s.prijs_per_nacht_cent })
    minNachten = Math.max(minNachten, s.min_nachten ?? 0)
    const sleutel = `${s.naam}|${s.prijs_per_nacht_cent}`
    const regel = perSeizoen.get(sleutel) ?? { naam: s.naam, nachten: 0, prijsPerNachtCent: s.prijs_per_nacht_cent }
    regel.nachten++
    perSeizoen.set(sleutel, regel)
  }
  return {
    nachten: perNacht.length,
    perNacht,
    totaalCent: perNacht.reduce((t, n) => t + n.cent, 0),
    ontbrekend,
    minNachten,
    perSeizoen: [...perSeizoen.values()],
  }
}

export type ExtraEenheid = "per_stuk" | "per_nacht" | "per_verblijf"

export interface ExtraRegel {
  extra?: string
  naam: string
  aantal: number
  prijs_cent: Cent
  eenheid: ExtraEenheid
}

export function extraBedrag(regel: ExtraRegel, nachten: number): Cent {
  const factor = regel.eenheid === "per_nacht" ? nachten : 1
  return regel.prijs_cent * regel.aantal * factor
}

export interface PrijsInstellingen {
  schoonmaak_cent: Cent
  parkkosten_per_nacht_cent: Cent
  parkkosten_apart_op_factuur: boolean
}

export interface Prijsopbouw {
  nachten: number
  /** Huurbedrag op de factuur (exclusief parkkosten als die apart staan) */
  huurCent: Cent
  huurBerekendCent: Cent
  huurHandmatig: boolean
  parkkostenCent: Cent
  schoonmaakCent: Cent
  extras: (ExtraRegel & { bedragCent: Cent })[]
  toeristenbelastingCent: Cent
  totaalCent: Cent
}

/**
 * Splitst de berekende huur (nachtprijzen inclusief parkkosten) in een
 * huurbedrag en parkkosten, zoals op de factuur.
 */
export function splitsParkkosten(totaalInclParkCent: Cent, nachten: number, inst: PrijsInstellingen) {
  const park = inst.parkkosten_apart_op_factuur ? inst.parkkosten_per_nacht_cent * nachten : 0
  return { huurCent: Math.max(0, totaalInclParkCent - park), parkkostenCent: park }
}

/**
 * Opbouw van de huur per seizoen voor het prijsoverzicht, bijv. 6 nachten
 * middenseizoen en 1 nacht laagseizoen. Staan de parkkosten apart op de
 * factuur, dan zijn ze hier van de nachtprijs af, zodat de regels optellen
 * tot de huur.
 */
export function huurOpbouw(huur: HuurBerekening, inst: PrijsInstellingen) {
  const park = inst.parkkosten_apart_op_factuur ? inst.parkkosten_per_nacht_cent : 0
  return huur.perSeizoen.map((s) => {
    const prijsPerNachtCent = Math.max(0, s.prijsPerNachtCent - park)
    return { naam: s.naam, nachten: s.nachten, prijsPerNachtCent, bedragCent: prijsPerNachtCent * s.nachten }
  })
}

export function berekenPrijsopbouw(input: {
  aankomst: IsoDatum
  vertrek: IsoDatum
  seizoenen: Seizoen[]
  instellingen: PrijsInstellingen
  extras?: ExtraRegel[]
  /** Handmatig afgesproken huurbedrag (zoals het op de factuur komt) */
  huurHandmatigCent?: Cent | null
  /** Afwijkende schoonmaakkosten voor deze boeking */
  schoonmaakCent?: Cent | null
  toeristenbelastingCent?: Cent | null
}): Prijsopbouw {
  const n = Math.max(0, dagenTussen(input.aankomst, input.vertrek))
  const huur = berekenHuur(input.aankomst, input.vertrek, input.seizoenen)
  const { huurCent: huurBerekendCent, parkkostenCent } = splitsParkkosten(huur.totaalCent, n, input.instellingen)
  const handmatig = input.huurHandmatigCent !== null && input.huurHandmatigCent !== undefined
  const huurCent = handmatig ? (input.huurHandmatigCent as Cent) : huurBerekendCent
  const schoonmaakCent = input.schoonmaakCent ?? input.instellingen.schoonmaak_cent
  const extras = (input.extras ?? [])
    .filter((e) => e.aantal > 0)
    .map((e) => ({ ...e, bedragCent: extraBedrag(e, n) }))
  const tb = input.toeristenbelastingCent ?? 0
  const totaalCent = huurCent + parkkostenCent + schoonmaakCent + extras.reduce((t, e) => t + e.bedragCent, 0) + tb
  return {
    nachten: n,
    huurCent,
    huurBerekendCent,
    huurHandmatig: handmatig,
    parkkostenCent,
    schoonmaakCent,
    extras,
    toeristenbelastingCent: tb,
    totaalCent,
  }
}
