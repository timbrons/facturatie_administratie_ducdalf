import { dagenTussen, datumVan, formatLang, jaarVan, maandVan, plusDagen, plusMaanden, type IsoDatum } from "./datum"
import { alleOverlappen } from "./overlap"
import { AFGEROND, GEANNULEERD, isBijOfVoorbij, volgendeStap, type WorkflowBoeking, type WorkflowStap } from "./workflow"

export interface ActieBoeking extends WorkflowBoeking {
  id: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  naam: string
  aanbetaling_vervaldatum?: string | null
  rest_vervaldatum?: string | null
  optie?: boolean
}

export interface ActieInstellingen {
  herinnering_rest_dagen: number
  aankomst_vooruit_dagen: number
  tb_aangifte_dag: number
}

export type Urgentie = "rood" | "oranje" | "normaal"

export interface Actie {
  boekingId: string
  soort: "volgende_stap" | "aanbetaling" | "restbetaling" | "aankomst" | "tb_aangifte" | "overlap" | "verblijf"
  titel: string
  toelichting: string
  urgentie: Urgentie
  /** Datum waarop de actie relevant of vervallen is, voor sortering */
  datum: IsoDatum | null
}

/** Periode (JJJJ-MM) waarin een verblijf wordt aangegeven: de maand van de laatste nacht. */
export function tbPeriode(vertrek: IsoDatum): string {
  const laatsteNacht = plusDagen(vertrek, -1)
  return `${jaarVan(laatsteNacht)}-${String(maandVan(laatsteNacht)).padStart(2, "0")}`
}

/**
 * Uiterste datum voor de aangifte toeristenbelasting: de ingestelde dag van
 * de maand na de aangifteperiode (aangifte per afgeronde maand).
 */
export function tbAangifteDeadline(vertrek: IsoDatum, dag: number): IsoDatum {
  const [jaar, maand] = tbPeriode(vertrek).split("-").map(Number)
  const volgende = plusMaanden(datumVan(jaar, maand, 1), 1)
  return datumVan(jaarVan(volgende), maandVan(volgende), dag)
}

const ACTIEVE_STATUS_UITGESLOTEN = new Set([GEANNULEERD, AFGEROND])

export function bouwActielijst(
  boekingen: ActieBoeking[],
  stappen: WorkflowStap[],
  inst: ActieInstellingen,
  vandaag: IsoDatum,
): Actie[] {
  const acties: Actie[] = []

  for (const b of boekingen) {
    if (ACTIEVE_STATUS_UITGESLOTEN.has(b.status)) continue

    const factuurVerstuurd = isBijOfVoorbij(stappen, b, "factuur_verstuurd")
    const aanbetalingBinnen = isBijOfVoorbij(stappen, b, "aanbetaling_ontvangen")
    const volledigBetaald = isBijOfVoorbij(stappen, b, "volledig_betaald")

    // Aanbetaling vervallen of bijna vervallen
    if (b.betaalwijze === "aanbetaling" && factuurVerstuurd && !aanbetalingBinnen && !volledigBetaald && b.aanbetaling_vervaldatum) {
      const dagen = dagenTussen(vandaag, b.aanbetaling_vervaldatum)
      if (dagen < 0) {
        acties.push({
          boekingId: b.id, soort: "aanbetaling", urgentie: "rood", datum: b.aanbetaling_vervaldatum,
          titel: `Aanbetaling vervallen – ${b.naam}`,
          toelichting: `${-dagen} dag(en) over de vervaldatum.`,
        })
      } else if (dagen <= inst.herinnering_rest_dagen) {
        acties.push({
          boekingId: b.id, soort: "aanbetaling", urgentie: "oranje", datum: b.aanbetaling_vervaldatum,
          titel: `Aanbetaling vervalt binnenkort – ${b.naam}`,
          toelichting: dagen === 0 ? "Vervalt vandaag." : `Vervalt over ${dagen} dag(en).`,
        })
      }
    }

    // Restbetaling (of volledige betaling) vervallen of bijna vervallen
    if (factuurVerstuurd && !volledigBetaald && b.rest_vervaldatum) {
      const dagen = dagenTussen(vandaag, b.rest_vervaldatum)
      const wat = b.betaalwijze === "aanbetaling" ? "Restbetaling" : "Betaling"
      if (dagen < 0) {
        acties.push({
          boekingId: b.id, soort: "restbetaling", urgentie: "rood", datum: b.rest_vervaldatum,
          titel: `${wat} vervallen – ${b.naam}`,
          toelichting: `${-dagen} dag(en) over de vervaldatum.`,
        })
      } else if (dagen <= inst.herinnering_rest_dagen) {
        acties.push({
          boekingId: b.id, soort: "restbetaling", urgentie: "oranje", datum: b.rest_vervaldatum,
          titel: `${wat} vervalt binnenkort – ${b.naam}`,
          toelichting: dagen === 0 ? "Vervalt vandaag." : `Vervalt over ${dagen} dag(en).`,
        })
      }
    }

    // Aankomst in de komende dagen
    const totAankomst = dagenTussen(vandaag, b.aankomst)
    if (totAankomst >= 0 && totAankomst <= inst.aankomst_vooruit_dagen && !isBijOfVoorbij(stappen, b, "verblijf")) {
      acties.push({
        boekingId: b.id, soort: "aankomst", urgentie: totAankomst <= 2 ? "oranje" : "normaal", datum: b.aankomst,
        titel: `Aankomst ${b.naam}`,
        toelichting: totAankomst === 0 ? "Komt vandaag aan." : `Komt over ${totAankomst} dag(en) aan.`,
      })
    }

    // Na vertrek: aangifte toeristenbelasting
    if (b.vertrek < vandaag && !b.tb_aangegeven_op) {
      const deadline = tbAangifteDeadline(b.vertrek, inst.tb_aangifte_dag)
      const dagen = dagenTussen(vandaag, deadline)
      acties.push({
        boekingId: b.id, soort: "tb_aangifte", urgentie: dagen < 0 ? "rood" : dagen <= 7 ? "oranje" : "normaal", datum: deadline,
        titel: `Aangifte toeristenbelasting – ${b.naam}`,
        toelichting:
          dagen < 0
            ? `Te laat: de aangifte voor ${tbPeriode(b.vertrek)} moest uiterlijk ${formatLang(deadline)} binnen zijn.`
            : `Aangifte over ${tbPeriode(b.vertrek)} uiterlijk ${formatLang(deadline)}.`,
      })
      continue
    }

    // Volgende workflowstap (alleen stappen waarbij wij iets moeten doen)
    const volgende = volgendeStap(stappen, b)
    if (volgende && !["aanbetaling_ontvangen", "volledig_betaald", "verblijf", "tb_aangegeven", AFGEROND].includes(volgende.sleutel)) {
      acties.push({
        boekingId: b.id, soort: "volgende_stap", urgentie: "normaal", datum: b.aankomst,
        titel: `${volgende.actie_label || volgende.label} – ${b.naam}`,
        toelichting: volgende.omschrijving ?? "",
      })
    }
    if (volgende?.sleutel === "verblijf" && b.aankomst <= vandaag) {
      acties.push({
        boekingId: b.id, soort: "verblijf", urgentie: "normaal", datum: b.aankomst,
        titel: `Verblijf gestart – ${b.naam}`,
        toelichting: "De aankomstdatum is bereikt; zet de status op Verblijf.",
      })
    }
  }

  // Overlappende boekingen (zonder geannuleerde)
  const lopend = boekingen.filter((b) => b.status !== GEANNULEERD && b.vertrek >= vandaag)
  for (const [a, b] of alleOverlappen(lopend)) {
    acties.push({
      boekingId: a.id, soort: "overlap", urgentie: "rood", datum: a.aankomst,
      titel: `Overlappende boekingen: ${a.naam} en ${b.naam}`,
      toelichting: "Deze verblijven delen minstens één nacht.",
    })
  }

  const gewicht: Record<Urgentie, number> = { rood: 0, oranje: 1, normaal: 2 }
  return acties.sort(
    (x, y) => gewicht[x.urgentie] - gewicht[y.urgentie] || (x.datum ?? "9999").localeCompare(y.datum ?? "9999"),
  )
}
