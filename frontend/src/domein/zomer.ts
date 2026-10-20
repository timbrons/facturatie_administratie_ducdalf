import { dagenTussen, nachten, type IsoDatum } from "./datum"
import type { Cent } from "./geld"

// Zomerverdeling tussen de gezinnen die samen eigenaar zijn.
//
// Afspraak: in de zomervakantie (van de eerste tot de laatste vakantiedag,
// over alle onderwijsregio's samen) heeft elk gezin recht op drie weken in het
// huis. Een verblijf in een gehuurd ander huis op het park (de overlapweek)
// telt ook als gebruikt; die huur wordt gelijk over de gezinnen verdeeld. Ziet
// een gezin (deels) af van zijn recht, dan is de huuropbrengst van die weken
// voor dat gezin. Verhuurde nachten vullen eerst de afgeziene weken
// (bij meerdere gezinnen naar verhouding); wat verder in de zomer is
// verhuurd, wordt gelijk over de gezinnen verdeeld. De opbrengst per nacht is
// het gemiddelde over alle verhuurde zomernachten.
//
// Alles wordt in nachten gerekend; een week is zeven nachten.

export const RECHT_NACHTEN = 21

export interface Zomerperiode {
  /** Eerste vakantiedag (eerste regio) */
  van: IsoDatum
  /** Laatste vakantiedag (laatste regio); de nacht daarna telt niet meer mee */
  tot: IsoDatum
}

type Regio = "noord" | "midden" | "zuid"

/** Zomervakanties per regio (rijksoverheid.nl), eerste t/m laatste dag. */
export const ZOMERVAKANTIES: Record<number, Record<Regio, [IsoDatum, IsoDatum]>> = {
  2024: { noord: ["2024-07-20", "2024-09-01"], midden: ["2024-07-13", "2024-08-25"], zuid: ["2024-07-06", "2024-08-18"] },
  2025: { noord: ["2025-07-12", "2025-08-24"], midden: ["2025-07-19", "2025-08-31"], zuid: ["2025-07-05", "2025-08-17"] },
  2026: { noord: ["2026-07-04", "2026-08-16"], midden: ["2026-07-18", "2026-08-30"], zuid: ["2026-07-11", "2026-08-23"] },
  2027: { noord: ["2027-07-10", "2027-08-22"], midden: ["2027-07-17", "2027-08-29"], zuid: ["2027-07-24", "2027-09-05"] },
}

/** De zomer over alle regio's: van de vroegste begindag t/m de laatste einddag. */
export function standaardZomer(jaar: number): Zomerperiode | null {
  const z = ZOMERVAKANTIES[jaar]
  if (!z) return null
  const r = Object.values(z)
  return { van: r.map((x) => x[0]).sort()[0], tot: r.map((x) => x[1]).sort().at(-1)! }
}

/** De zomernachten: van de eerste vakantiedag t/m de nacht vóór de laatste dag. */
export function zomerNachten(p: Zomerperiode): IsoDatum[] {
  return nachten(p.van, p.tot)
}

/** "3 weken", "1 week en 2 nachten", "4 nachten" */
export function wekenTekst(n: number): string {
  const w = Math.floor(n / 7)
  const r = n % 7
  const weken = w === 1 ? "1 week" : `${w} weken`
  const nachtTekst = r === 1 ? "1 nacht" : `${r} nachten`
  if (w === 0) return r === 0 ? "0 weken" : nachtTekst
  return r === 0 ? weken : `${weken} en ${nachtTekst}`
}

export interface ZomerVerblijf {
  /** Gezin; "" = niet opgegeven */
  groep: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  /** In een gehuurd (ander) huis: telt mee als gebruikt, de huur wordt gedeeld */
  anderHuis?: boolean
  huurkosten_cent?: Cent
  /** Gezin dat de huur betaalde ("" = het gezin zelf) */
  betaaldDoor?: string
}

export interface HuurhuisRij {
  groep: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  huurkosten_cent: Cent
  betaaldDoor: string
}

export interface ZomerVerhuur {
  id: string
  naam: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  /** Opbrengst van het hele verblijf (huur min PLD-kosten) */
  opbrengst_cent: Cent
  /** true: nog geen factuur, bedrag uit de boeking */
  geschat: boolean
}

export interface VerhuurRij extends ZomerVerhuur {
  nachten: number
  zomerNachten: number
  zomerOpbrengst_cent: Cent
}

export interface GezinRij {
  gezin: string
  recht: number
  gebruikt: number
  afgezien: number
  /** Verhuurde nachten die aan de afgeziene weken van dit gezin zijn toegerekend */
  verhuurdAfgezien: number
  /** Opbrengst uit de afgeziene weken */
  opbrengstAfgezien_cent: Cent
  /** Aandeel in de gedeelde opbrengst */
  opbrengstGedeeld_cent: Cent
  opbrengst_cent: Cent
  /** Huur van een gehuurd huis: betaald min eigen aandeel (positief: krijgt terug) */
  verrekening_cent: Cent
}

export interface Zomerverdeling {
  nachten: number
  gezinnen: GezinRij[]
  verhuur: VerhuurRij[]
  verhuurdeNachten: number
  opbrengst_cent: Cent
  /** Verhuurde nachten boven de afgeziene weken: gedeeld */
  gedeeldeNachten: number
  gedeeld_cent: Cent
  /** Nachten eigen verblijf in de zomer waarbij geen gezin is opgegeven */
  zonderGezin: number
  /** Gehuurde (andere) huizen in de zomer, met de huurkosten */
  huurhuizen: HuurhuisRij[]
  huurkosten_cent: Cent
}

/** Verdeelt een bedrag in centen naar gewichten, zonder afrondingsverschil (grootste rest). */
export function verdeel(bedrag: Cent, gewichten: number[]): Cent[] {
  const som = gewichten.reduce((t, g) => t + g, 0)
  if (som <= 0) return gewichten.map(() => 0)
  const ruw = gewichten.map((g) => (bedrag * g) / som)
  const uit = ruw.map((x) => Math.floor(x))
  let rest = bedrag - uit.reduce((t, x) => t + x, 0)
  const volgorde = ruw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of volgorde) {
    if (rest <= 0) break
    uit[i]++
    rest--
  }
  return uit
}

export function zomerverdeling(input: {
  periode: Zomerperiode
  gezinnen: string[]
  verblijven: ZomerVerblijf[]
  verhuur: ZomerVerhuur[]
}): Zomerverdeling {
  const zomer = new Set(zomerNachten(input.periode))
  const inZomer = (a: IsoDatum, v: IsoDatum) => nachten(a, v).filter((n) => zomer.has(n))

  // Gebruikte nachten per gezin (dubbele afspraken tellen één keer).
  const namen = [...input.gezinnen]
  for (const v of input.verblijven) {
    for (const g of [v.groep, v.anderHuis ? v.betaaldDoor : ""]) if (g && !namen.includes(g)) namen.push(g)
  }
  const gebruikt = new Map(namen.map((g) => [g, new Set<IsoDatum>()]))
  const zonderGezin = new Set<IsoDatum>()
  for (const v of input.verblijven) {
    for (const n of inZomer(v.aankomst, v.vertrek)) (v.groep ? gebruikt.get(v.groep)! : zonderGezin).add(n)
  }

  const verhuur: VerhuurRij[] = input.verhuur
    .map((b) => {
      const totaal = dagenTussen(b.aankomst, b.vertrek)
      const z = inZomer(b.aankomst, b.vertrek).length
      return { ...b, nachten: totaal, zomerNachten: z, zomerOpbrengst_cent: totaal > 0 ? Math.round((b.opbrengst_cent * z) / totaal) : 0 }
    })
    .filter((r) => r.zomerNachten > 0)
    .sort((a, b) => a.aankomst.localeCompare(b.aankomst))
  const N = verhuur.reduce((t, r) => t + r.zomerNachten, 0)
  const R = verhuur.reduce((t, r) => t + r.zomerOpbrengst_cent, 0)

  const afgezien = namen.map((g) => Math.max(0, RECHT_NACHTEN - gebruikt.get(g)!.size))
  const W = afgezien.reduce((t, x) => t + x, 0)
  // Verhuurde nachten vullen eerst de afgeziene weken, naar verhouding.
  const naarAfgezien = Math.min(N, W)
  const nachtenAfgezien = verdeel(naarAfgezien, afgezien)
  const gedeeldeNachten = N - naarAfgezien
  // Bedragen: gemiddelde opbrengst per verhuurde nacht.
  const [deelAfgezien, deelGedeeld] = verdeel(R, [naarAfgezien, gedeeldeNachten])
  const perAfgezien = verdeel(deelAfgezien, afgezien)
  const perGedeeld = verdeel(deelGedeeld, namen.map(() => 1))

  // Huur van een ander huis (bijv. in de overlapweek): gelijk verdeeld over de gezinnen.
  const huurhuizen: HuurhuisRij[] = input.verblijven
    .filter((v) => v.anderHuis && inZomer(v.aankomst, v.vertrek).length > 0)
    .map((v) => ({ groep: v.groep, aankomst: v.aankomst, vertrek: v.vertrek, huurkosten_cent: v.huurkosten_cent ?? 0, betaaldDoor: v.betaaldDoor || v.groep }))
    .sort((a, b) => a.aankomst.localeCompare(b.aankomst))
  const verrekening = namen.map(() => 0)
  for (const h of huurhuizen) {
    const delen = verdeel(h.huurkosten_cent, namen.map(() => 1))
    namen.forEach((g, i) => {
      verrekening[i] -= delen[i]
      if (g === h.betaaldDoor) verrekening[i] += h.huurkosten_cent
    })
  }

  return {
    nachten: zomer.size,
    gezinnen: namen.map((g, i) => ({
      gezin: g,
      recht: RECHT_NACHTEN,
      gebruikt: gebruikt.get(g)!.size,
      afgezien: afgezien[i],
      verhuurdAfgezien: nachtenAfgezien[i],
      opbrengstAfgezien_cent: perAfgezien[i],
      opbrengstGedeeld_cent: perGedeeld[i],
      opbrengst_cent: perAfgezien[i] + perGedeeld[i],
      verrekening_cent: verrekening[i],
    })),
    verhuur,
    verhuurdeNachten: N,
    opbrengst_cent: R,
    gedeeldeNachten,
    gedeeld_cent: deelGedeeld,
    zonderGezin: zonderGezin.size,
    huurhuizen,
    huurkosten_cent: huurhuizen.reduce((t, h) => t + h.huurkosten_cent, 0),
  }
}

/** De zomer van een jaar: een eigen instelling gaat voor de standaard uit de tabel. */
export function zomerVoor(jaar: number, eigen: Record<string, Zomerperiode> | null | undefined): Zomerperiode | null {
  const e = eigen?.[String(jaar)]
  return e?.van && e?.tot ? e : standaardZomer(jaar)
}
