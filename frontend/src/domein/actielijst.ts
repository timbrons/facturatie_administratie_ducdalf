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
  bron?: string
}

export interface ActieInstellingen {
  herinnering_rest_dagen: number
  aankomst_vooruit_dagen: number
  tb_aangifte_dag: number
}

export type Urgentie = "rood" | "oranje" | "normaal"

export interface Actie {
  boekingId: string
  soort: "volgende_stap" | "aanbetaling" | "restbetaling" | "aankomst" | "tb_aangifte" | "overlap" | "verblijf" | "bericht"
  titel: string
  toelichting: string
  urgentie: Urgentie
  /** Datum waarop de actie relevant of vervallen is, voor sortering */
  datum: IsoDatum | null
  /** Sjabloon voor een herinnering of bericht dat bij deze actie hoort */
  mail?: string
  /** Wij wachten op de huurder (geen actie van ons nodig) */
  wachten?: boolean
}

/**
 * Wat er bij de volgende workflowstap te doen is, als taak geformuleerd. De
 * labels in workflow_stappen beschrijven de stap als die gedaan is ("Huurder
 * heeft toegezegd"); hier staat wat wij nu moeten doen of waarop we wachten.
 * Onbekende (zelf toegevoegde) stappen vallen terug op het label.
 */
const TE_DOEN: Record<string, { titel: string; toelichting: string; wachten?: boolean }> = {
  in_afstemming: {
    titel: "Contact opnemen",
    toelichting: "Stem beschikbaarheid en prijs af met de huurder en zet de status op Afstemming met huurder.",
  },
  bevestigd: {
    titel: "Wachten op bevestiging",
    toelichting: "We wachten op de bevestiging van de huurder. Zet de status op Bevestigd zodra de huurder heeft toegezegd.",
    wachten: true,
  },
  aanmeldformulier_verstuurd: {
    titel: "Aanmeldformulier versturen",
    toelichting: "De huurder heeft bevestigd. Stuur de link naar het aanmeldformulier.",
  },
  aanmeldformulier_ontvangen: {
    titel: "Wachten op aanmeldformulier",
    toelichting: "Het aanmeldformulier is verstuurd. Zodra de huurder het invult, wordt het verwerkt.",
    wachten: true,
  },
  brochure_verstuurd: {
    titel: "Brochure versturen",
    toelichting: "Stuur de huurder de informatiebrochure.",
  },
  tb_berekend: {
    titel: "Toeristenbelasting berekenen",
    toelichting: "Doe de simulatie in het portaal en leg het bedrag vast.",
  },
  factuur_verstuurd: {
    titel: "Factuur versturen",
    toelichting: "Maak de factuur en stuur hem naar de huurder.",
  },
  le_duc_aangemeld: {
    titel: "Aanmelden in het Le Duc Portaal",
    toelichting: "Meld de huurder en de meereizenden aan in het portaal van Parc le Duc.",
  },
}

/** Eerder verstuurde mails (uit het maillog), om herinneringen te tonen of te onderdrukken. */
export interface VerstuurdeMail {
  boekingId: string
  sjablonen: string[]
  datum: IsoDatum
}

export const FIJNE_REIS_DAGEN = 7

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
  mails: VerstuurdeMail[] = [],
): Actie[] {
  const acties: Actie[] = []
  const laatste = (boekingId: string, sjabloon: string) =>
    mails.filter((m) => m.boekingId === boekingId && m.sjablonen.includes(sjabloon)).map((m) => m.datum).sort().at(-1)
  const herinnerd = (boekingId: string, sjabloon: string) => {
    const d = laatste(boekingId, sjabloon)
    return d ? ` Herinnering verstuurd op ${formatLang(d)}.` : ""
  }

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
          boekingId: b.id, soort: "aanbetaling", urgentie: "rood", datum: b.aanbetaling_vervaldatum, mail: "herinnering_aanbetaling",
          titel: `Aanbetaling vervallen – ${b.naam}`,
          toelichting: `${-dagen} dag(en) over de vervaldatum.${herinnerd(b.id, "herinnering_aanbetaling")}`,
        })
      } else if (dagen <= inst.herinnering_rest_dagen) {
        acties.push({
          boekingId: b.id, soort: "aanbetaling", urgentie: "oranje", datum: b.aanbetaling_vervaldatum, mail: "herinnering_aanbetaling",
          titel: `Aanbetaling vervalt binnenkort – ${b.naam}`,
          toelichting: (dagen === 0 ? "Vervalt vandaag." : `Vervalt over ${dagen} dag(en).`) + herinnerd(b.id, "herinnering_aanbetaling"),
        })
      }
    }

    // Restbetaling (of volledige betaling) vervallen of bijna vervallen
    if (factuurVerstuurd && !volledigBetaald && b.rest_vervaldatum) {
      const dagen = dagenTussen(vandaag, b.rest_vervaldatum)
      const wat = b.betaalwijze === "aanbetaling" ? "Restbetaling" : "Betaling"
      if (dagen < 0) {
        acties.push({
          boekingId: b.id, soort: "restbetaling", urgentie: "rood", datum: b.rest_vervaldatum, mail: "herinnering_rest",
          titel: `${wat} vervallen – ${b.naam}`,
          toelichting: `${-dagen} dag(en) over de vervaldatum.${herinnerd(b.id, "herinnering_rest")}`,
        })
      } else if (dagen <= inst.herinnering_rest_dagen) {
        acties.push({
          boekingId: b.id, soort: "restbetaling", urgentie: "oranje", datum: b.rest_vervaldatum, mail: "herinnering_rest",
          titel: `${wat} vervalt binnenkort – ${b.naam}`,
          toelichting: (dagen === 0 ? "Vervalt vandaag." : `Vervalt over ${dagen} dag(en).`) + herinnerd(b.id, "herinnering_rest"),
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

    // Kort voor aankomst: "fijne reis / praktische info" als dat nog niet is verstuurd
    if (totAankomst >= 0 && totAankomst <= FIJNE_REIS_DAGEN && !laatste(b.id, "fijne_reis") && b.status !== "aanvraag" && b.status !== "in_afstemming") {
      acties.push({
        boekingId: b.id, soort: "bericht", urgentie: "normaal", datum: b.aankomst, mail: "fijne_reis",
        titel: `Praktische info sturen – ${b.naam}`,
        toelichting: "Stuur kort voor aankomst de mail met praktische informatie.",
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
    if (b.status === "aanvraag" && b.bron === "website") {
      // Nieuwe aanvraag via het boekingsformulier: valt op tot er contact is.
      acties.push({
        boekingId: b.id, soort: "volgende_stap", urgentie: "oranje", datum: b.aankomst,
        titel: `Nieuwe boekingsaanvraag – ${b.naam}`,
        toelichting: `${formatLang(b.aankomst)} – ${formatLang(b.vertrek)}, via de website. Neem contact op en zet de status op Afstemming met huurder.`,
      })
    } else if (volgende && !["aanbetaling_ontvangen", "volledig_betaald", "verblijf", "tb_aangegeven", AFGEROND].includes(volgende.sleutel)) {
      const taak = TE_DOEN[volgende.sleutel]
      acties.push({
        boekingId: b.id, soort: "volgende_stap", urgentie: "normaal", datum: b.aankomst,
        titel: `${taak?.titel || volgende.actie_label || volgende.label} – ${b.naam}`,
        toelichting: taak?.toelichting ?? volgende.omschrijving ?? "",
        wachten: taak?.wachten,
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
