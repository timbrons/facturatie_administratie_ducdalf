import { dagenTussen, formatLang, nachten, type IsoDatum } from "./datum"
import { formatEuro, type Cent } from "./geld"

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
  /** Hoe het zomerdeel is berekend: tegen het hoogseizoentarief, of (zonder tarief) naar rato van de opbrengst */
  tarief: "hoogseizoen" | "naar rato"
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
  /** Door dit gezin betaalde huur van gehuurde huizen */
  huurBetaald_cent: Cent
  /** Aandeel van dit gezin in de huur van alle gehuurde huizen */
  huurAandeel_cent: Cent
  /** Opbrengst + huur ander huis (positief: krijgt nog) */
  saldo_cent: Cent
  /** Al tussentijds verrekend: betaald aan de andere gezinnen min ontvangen */
  verrekend_cent: Cent
  /** Wat na de tussentijdse verrekeningen nog openstaat (positief: krijgt nog) */
  nogOpen_cent: Cent
  /**
   * Deel daarvan dat tussen de gezinnen moet worden verrekend: huur ander
   * huis + al verrekend (positief: krijgt nog van een ander gezin). De rest
   * (opbrengst_cent) komt uit de huuropbrengst op de gezamenlijke rekening.
   */
  tussenGezinnen_cent: Cent
}

/** Een tussentijdse verrekening tussen twee gezinnen (bijv. de helft van de huur van een ander huis). */
export interface ZomerVerrekening {
  /** Gezin dat betaalde */
  van: string
  /** Gezin dat ontving */
  aan: string
  bedrag_cent: Cent
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
  /** De tussentijdse verrekeningen (zoals meegegeven) */
  verrekeningen: ZomerVerrekening[]
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
  /**
   * Hoogseizoentarief per nacht (zonder parkkosten) voor een datum. Verhuurde
   * zomernachten tellen tegen dit tarief; zonder tarief naar rato van de
   * opbrengst van het hele verblijf.
   */
  hoogseizoen?: (datum: IsoDatum) => Cent | null
  /** Tussentijds al verrekende bedragen tussen de gezinnen */
  verrekend?: ZomerVerrekening[]
}): Zomerverdeling {
  const zomer = new Set(zomerNachten(input.periode))
  const inZomer = (a: IsoDatum, v: IsoDatum) => nachten(a, v).filter((n) => zomer.has(n))

  // Gebruikte nachten per gezin (dubbele afspraken tellen één keer).
  const namen = [...input.gezinnen]
  for (const v of input.verblijven) {
    for (const g of [v.groep, v.anderHuis ? v.betaaldDoor : ""]) if (g && !namen.includes(g)) namen.push(g)
  }
  for (const v of input.verrekend ?? []) for (const g of [v.van, v.aan]) if (g && !namen.includes(g)) namen.push(g)
  const gebruikt = new Map(namen.map((g) => [g, new Set<IsoDatum>()]))
  const zonderGezin = new Set<IsoDatum>()
  for (const v of input.verblijven) {
    for (const n of inZomer(v.aankomst, v.vertrek)) (v.groep ? gebruikt.get(v.groep)! : zonderGezin).add(n)
  }

  const verhuur: VerhuurRij[] = input.verhuur
    .map((b) => {
      const totaal = dagenTussen(b.aankomst, b.vertrek)
      const zomernachten = inZomer(b.aankomst, b.vertrek)
      const z = zomernachten.length
      // In de verrekening tellen zomernachten tegen het hoogseizoentarief.
      const tarieven = input.hoogseizoen ? zomernachten.map((d) => input.hoogseizoen!(d)) : []
      if (z > 0 && tarieven.length === z && tarieven.every((t) => t !== null)) {
        const som = tarieven.reduce((t: number, c) => t + (c ?? 0), 0)
        return { ...b, tarief: "hoogseizoen" as const, nachten: totaal, zomerNachten: z, zomerOpbrengst_cent: som }
      }
      return { ...b, tarief: "naar rato" as const, nachten: totaal, zomerNachten: z, zomerOpbrengst_cent: totaal > 0 ? Math.round((b.opbrengst_cent * z) / totaal) : 0 }
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
  const huurBetaald = namen.map(() => 0)
  const huurAandeel = namen.map(() => 0)
  for (const h of huurhuizen) {
    const delen = verdeel(h.huurkosten_cent, namen.map(() => 1))
    namen.forEach((g, i) => {
      verrekening[i] -= delen[i]
      huurAandeel[i] += delen[i]
      if (g === h.betaaldDoor) {
        verrekening[i] += h.huurkosten_cent
        huurBetaald[i] += h.huurkosten_cent
      }
    })
  }

  // Tussentijds verrekend: wie betaalde, heeft minder te betalen; wie ontving, krijgt minder.
  const verrekend = namen.map(() => 0)
  for (const v of input.verrekend ?? []) {
    verrekend[namen.indexOf(v.van)] += v.bedrag_cent
    verrekend[namen.indexOf(v.aan)] -= v.bedrag_cent
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
      huurBetaald_cent: huurBetaald[i],
      huurAandeel_cent: huurAandeel[i],
      saldo_cent: perAfgezien[i] + perGedeeld[i] + verrekening[i],
      verrekend_cent: verrekend[i],
      nogOpen_cent: perAfgezien[i] + perGedeeld[i] + verrekening[i] + verrekend[i],
      tussenGezinnen_cent: verrekening[i] + verrekend[i],
    })),
    verhuur,
    verhuurdeNachten: N,
    opbrengst_cent: R,
    gedeeldeNachten,
    gedeeld_cent: deelGedeeld,
    zonderGezin: zonderGezin.size,
    huurhuizen,
    huurkosten_cent: huurhuizen.reduce((t, h) => t + h.huurkosten_cent, 0),
    verrekeningen: input.verrekend ?? [],
  }
}

/** De zomer van een jaar: een eigen instelling gaat voor de standaard uit de tabel. */
export function zomerVoor(jaar: number, eigen: Record<string, Zomerperiode> | null | undefined): Zomerperiode | null {
  const e = eigen?.[String(jaar)]
  return e?.van && e?.tot ? e : standaardZomer(jaar)
}

/**
 * Toelichting in gewone zinnen bij de zomerverdeling: hoe de huur van een
 * ander huis is verdeeld, wat er al is verrekend, wie wie nog moet betalen en
 * wie wat krijgt uit de huuropbrengst (van de gezamenlijke rekening).
 */
export function toelichting(z: Zomerverdeling): string[] {
  const uit: string[] = []
  const n = z.gezinnen.length
  // Werkwoord passend bij de naam: "Gezin A heeft", "Tim, Claire en Alicia hebben".
  const mv = (naam: string) => /,| en /.test(naam)
  const ww = (naam: string, enkelvoud: string, meervoud: string) => (mv(naam) ? meervoud : enkelvoud)

  // Huuropbrengst: hoe "Opbrengst afgeziene weken" en "Gedeelde opbrengst" tot stand komen
  const N = z.verhuurdeNachten
  if (N === 0) {
    uit.push("In de zomer is niet verhuurd, dus er is geen huuropbrengst te verdelen.")
  } else {
    const perNacht = Math.round(z.opbrengst_cent / N)
    const allesHoog = z.verhuur.every((r) => r.tarief === "hoogseizoen")
    uit.push(
      `In de zomer is ${wekenTekst(N)} verhuurd. ` +
        (allesHoog
          ? `Elke zomernacht telt tegen het hoogseizoentarief (zonder parkkosten): samen ${formatEuro(z.opbrengst_cent)}, ${formatEuro(perNacht)} per nacht.`
          : `De opbrengst daarvan is ${formatEuro(z.opbrengst_cent)} (zomernachten tegen het hoogseizoentarief; waar geen tarief bekend is naar rato van ` +
            `de huur zonder toeristenbelasting en PLD-kosten), gemiddeld ${formatEuro(perNacht)} per nacht.`),
    )
    const afziend = z.gezinnen.filter((g) => g.afgezien > 0)
    for (const g of afziend) {
      uit.push(`${g.gezin} ${ww(g.gezin, "heeft", "hebben")} ${wekenTekst(g.afgezien)} van het recht van 3 weken niet gebruikt (afgezien).`)
    }
    const naarAfgezien = N - z.gedeeldeNachten
    const afgezienOpbrengst = z.opbrengst_cent - z.gedeeld_cent
    if (afziend.length === 0) {
      uit.push("Geen van de gezinnen heeft afgezien van zijn weken, dus de hele opbrengst wordt gedeeld.")
    } else if (naarAfgezien > 0) {
      const verdeling =
        afziend.length === 1
          ? `Die ${formatEuro(afgezienOpbrengst)} is voor ${afziend[0].gezin} ("Opbrengst afgeziene weken").`
          : `Die ${formatEuro(afgezienOpbrengst)} wordt verdeeld naar verhouding van de afgeziene nachten ("Opbrengst afgeziene weken"): ` +
            afziend.map((g) => `${g.gezin} ${formatEuro(g.opbrengstAfgezien_cent)}`).join(", ") + "."
      uit.push(
        `De verhuurde nachten vullen eerst de afgeziene weken: ${wekenTekst(naarAfgezien)} × ${formatEuro(perNacht)} = ${formatEuro(afgezienOpbrengst)}. ${verdeling}`,
      )
    }
    if (z.gedeeldeNachten > 0) {
      const deel = Math.round(z.gedeeld_cent / Math.max(1, n))
      uit.push(
        `${afziend.length ? "Er is meer verhuurd dan er afgeziene weken waren. " : ""}De opbrengst van ${wekenTekst(z.gedeeldeNachten)} ` +
          `(${formatEuro(z.gedeeld_cent)}) wordt gelijk over de gezinnen verdeeld ("Gedeelde opbrengst"): ieder gezin krijgt ${formatEuro(deel)}.`,
      )
    } else if (afziend.length) {
      uit.push("Er is niet meer verhuurd dan er afgeziene weken waren, dus er is geen gedeelde opbrengst.")
    }
  }

  const huizen = z.huurhuizen.filter((h) => h.huurkosten_cent)
  for (const h of huizen) {
    const wie = h.betaaldDoor || h.groep
    const voor = h.betaaldDoor && h.betaaldDoor !== h.groep ? ` (voor ${h.groep})` : ""
    uit.push(`${wie} ${ww(wie, "heeft", "hebben")} van ${formatLang(h.aankomst)} tot ${formatLang(h.vertrek)} een ander huis gehuurd${voor} voor ${formatEuro(h.huurkosten_cent)}.`)
  }
  if (huizen.length) {
    const deel = Math.round(z.huurkosten_cent / Math.max(1, n))
    uit.push(
      `${huizen.length > 1 ? "Samen kostten de gehuurde huizen" : "Dat kost"} ${formatEuro(z.huurkosten_cent)}; ` +
        (n === 2 ? `ieder gezin draagt de helft (${formatEuro(deel)}).` : `elk gezin draagt een gelijk deel (${formatEuro(deel)}).`),
    )
    for (const g of z.gezinnen) {
      const verschil = g.huurBetaald_cent - g.huurAandeel_cent
      if (!verschil) continue
      uit.push(
        `${g.gezin} ${ww(g.gezin, "heeft", "hebben")} ${formatEuro(g.huurBetaald_cent)} aan huur betaald en ${ww(g.gezin, "draagt", "dragen")} ${formatEuro(g.huurAandeel_cent)}, ` +
          (verschil > 0
            ? `dus ${ww(g.gezin, "krijgt", "krijgen")} ${formatEuro(verschil)} terug.`
            : `dus ${ww(g.gezin, "moet", "moeten")} nog ${formatEuro(-verschil)} bijdragen.`),
      )
    }
  }
  // Al verrekend, per richting opgeteld
  const paren = new Map<string, number>()
  for (const v of z.verrekeningen) paren.set(`${v.van}\u0000${v.aan}`, (paren.get(`${v.van}\u0000${v.aan}`) ?? 0) + v.bedrag_cent)
  for (const [k, bedrag] of paren) {
    const [van, aan] = k.split("\u0000")
    uit.push(`${van} ${ww(van, "heeft", "hebben")} al ${formatEuro(bedrag)} aan ${aan} betaald.`)
  }
  // Nog tussen de gezinnen: wie moet betalen, aan wie
  if (huizen.length || z.verrekeningen.length) {
    const opdrachten = verrekenOpdrachten(z)
    if (opdrachten.length === 0) uit.push("Tussen de gezinnen is alles verrekend.")
    for (const o of opdrachten) {
      const teVeel = z.verrekeningen.some((v) => v.van === o.aan && v.aan === o.van)
      uit.push(
        `Conclusie: ${o.van} ${ww(o.van, "betaalt", "betalen")} nog ${formatEuro(o.bedrag_cent)} aan ${o.aan}` +
          (teVeel ? ` (${o.aan} ${ww(o.aan, "heeft", "hebben")} eerder ${formatEuro(o.bedrag_cent)} te veel betaald).` : "."),
      )
    }
  }
  // Uit de huuropbrengst
  for (const g of z.gezinnen) {
    if (g.opbrengst_cent <= 0) continue
    const waarom = [
      g.opbrengstAfgezien_cent > 0 ? `${formatEuro(g.opbrengstAfgezien_cent)} voor de verhuur in de weken waarvan zij hebben afgezien` : "",
      g.opbrengstGedeeld_cent > 0 ? `${formatEuro(g.opbrengstGedeeld_cent)} als hun deel van de gedeeld verhuurde weken` : "",
    ].filter(Boolean).join(" en ")
    uit.push(
      `${g.gezin} ${ww(g.gezin, "krijgt", "krijgen")} ${formatEuro(g.opbrengst_cent)} uit de huuropbrengst van de zomer (${waarom}). ` +
        "Dit komt van de gezamenlijke rekening, niet van het andere gezin.",
    )
  }
  if (uit.length === 0) uit.push("Er valt deze zomer niets te verrekenen.")
  return uit
}

/** Wie aan wie nog moet betalen om "Verrekenen tussen gezinnen" op nul te krijgen. */
export function verrekenOpdrachten(z: Zomerverdeling): ZomerVerrekening[] {
  const betalers = z.gezinnen.filter((g) => g.tussenGezinnen_cent < 0).map((g) => ({ gezin: g.gezin, rest: -g.tussenGezinnen_cent }))
  const ontvangers = z.gezinnen.filter((g) => g.tussenGezinnen_cent > 0).map((g) => ({ gezin: g.gezin, rest: g.tussenGezinnen_cent }))
  const uit: ZomerVerrekening[] = []
  for (const b of betalers) {
    for (const o of ontvangers) {
      const x = Math.min(b.rest, o.rest)
      if (x <= 0) continue
      uit.push({ van: b.gezin, aan: o.gezin, bedrag_cent: x })
      b.rest -= x
      o.rest -= x
    }
  }
  return uit
}

/**
 * Hoogseizoentarief per nacht voor de zomerverrekening: de prijs van het
 * seizoen "Hoogseizoen" (naam bevat "hoog") van dat jaar, zonder parkkosten
 * als die apart worden bijgehouden. Valt de nacht in zo'n seizoen, dan dat
 * seizoen; anders het (duurste) hoogseizoen van hetzelfde jaar.
 */
export function hoogseizoenTarief(
  seizoenen: { naam: string; van: IsoDatum; tot: IsoDatum; prijs_per_nacht_cent: Cent }[],
  park: { parkkosten_per_nacht_cent?: Cent | null; parkkosten_apart_op_factuur?: boolean | null },
): (datum: IsoDatum) => Cent | null {
  const hoog = seizoenen.filter((s) => /hoog/i.test(s.naam))
  const parkPerNacht = park.parkkosten_apart_op_factuur ? park.parkkosten_per_nacht_cent ?? 0 : 0
  return (datum) => {
    const jaar = datum.slice(0, 4)
    const kandidaten = hoog.filter((s) => s.van.slice(0, 4) === jaar || s.tot.slice(0, 4) === jaar)
    const s = kandidaten.find((x) => x.van <= datum && datum <= x.tot) ?? [...kandidaten].sort((a, b) => b.prijs_per_nacht_cent - a.prijs_per_nacht_cent)[0]
    return s ? Math.max(0, s.prijs_per_nacht_cent - parkPerNacht) : null
  }
}
