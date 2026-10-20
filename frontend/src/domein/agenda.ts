import { plusDagen, type IsoDatum } from "./datum"

// Eigen verblijven in Google Agenda.
//
// Een eigen verblijf is een afspraak van minstens één nacht. Een afspraak
// voor de hele dag loopt in Google van de aankomstdag tot en met de
// vertrekdag (zo blokkeer je het huis in je agenda); Google slaat het einde
// op als de dag ná de laatste dag. De app rekent zoals bij boekingen: de
// vertrekdag zelf is vrij.
//
// Met een filter (komma-gescheiden woorden) tellen alleen afspraken waarvan de
// titel een van die woorden bevat; afspraken die de app zelf heeft gemaakt
// tellen altijd. Afspraken met precies dezelfde periode als een boeking (een
// huurder die ook in de agenda staat) worden overgeslagen: huurders komen
// alleen uit de app.

export const APP_KENMERK = "ducdalf"

export interface AgendaItem {
  id?: string
  summary?: string
  description?: string
  status?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export interface EigenVerblijf {
  id: string
  titel: string
  notitie: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  /** Voor wie het verblijf is (een van de gezinnen uit de instellingen), "" = niet opgegeven */
  groep: string
  /** Gemaakt vanuit de app */
  vanApp: boolean
  /** Het gezin verblijft in een gehuurd (ander) huis op het park, niet in ons huis */
  anderHuis: boolean
  /** Huurkosten van het andere huis (verdeeld over de gezinnen) */
  huurkosten_cent: number
  /** Welk gezin de huur van het andere huis heeft betaald ("" = het gezin zelf) */
  betaaldDoor: string
}

export interface EigenVerblijfGegevens {
  titel: string
  notitie?: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  groep?: string
  anderHuis?: boolean
  huurkosten_cent?: number
  betaaldDoor?: string
}

/** Gezinnen voor een eigen verblijf: één per regel in de instellingen. */
export function verblijfGroepen(tekst: string | null | undefined): string[] {
  return (tekst ?? "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
}

/** Naam zoals in de kalender en in Google Agenda, bijv. "Eigen verblijf – Gezin A (gehuurd huis)". */
export function verblijfNaam(v: { titel: string; groep?: string; anderHuis?: boolean }): string {
  const titel = v.titel.trim() || "Eigen verblijf"
  const naam = v.groep ? `${titel} – ${v.groep}` : titel
  return v.anderHuis ? `${naam} (gehuurd huis)` : naam
}

// Kleur per gezin in Google Agenda (colorId): pauw, mandarijn, druif, salie, flamingo.
const KLEUREN = ["7", "6", "3", "2", "4"]

function periode(it: AgendaItem): { aankomst: string; vertrek: string } | null {
  if (it.start?.date && it.end?.date) {
    // Hele dagen: het einde is exclusief, de laatste dag is de vertrekdag.
    return { aankomst: it.start.date, vertrek: plusDagen(it.end.date, -1) }
  }
  const aankomst = it.start?.dateTime?.slice(0, 10)
  const vertrek = it.end?.dateTime?.slice(0, 10)
  return aankomst && vertrek ? { aankomst, vertrek } : null
}

export function eigenVerblijven(
  items: AgendaItem[],
  filter: string,
  boekingen: { aankomst: string; vertrek: string }[],
): EigenVerblijf[] {
  const woorden = filter.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)
  const uit: EigenVerblijf[] = []
  for (const it of items) {
    if (it.status === "cancelled") continue
    const p = periode(it)
    if (!p || p.vertrek <= p.aankomst) continue
    const titel = (it.summary ?? "").trim()
    const kenmerk = it.extendedProperties?.private?.[APP_KENMERK]
    // Huurboekingen die de app zelf in de agenda zet, zijn geen eigen verblijven.
    if (kenmerk === "boeking") continue
    const vanApp = kenmerk === "eigen-verblijf"
    if (!vanApp && woorden.length && !woorden.some((w) => titel.toLowerCase().includes(w))) continue
    if (!vanApp && boekingen.some((b) => b.aankomst === p.aankomst && b.vertrek === p.vertrek)) continue
    // De app bewaart titel en gezin apart, zodat de samengestelde naam niet terugkomt als titel.
    const eigen = vanApp ? it.extendedProperties?.private : undefined
    const groep = eigen?.groep ?? ""
    const kaal = eigen?.titel ?? titel
    uit.push({
      id: it.id ?? `${p.aankomst}-${p.vertrek}-${titel}`, titel: kaal || "Eigen verblijf", notitie: it.description ?? "", ...p, groep, vanApp,
      anderHuis: eigen?.ander_huis === "ja",
      huurkosten_cent: Number(eigen?.huurkosten_cent) || 0,
      betaaldDoor: eigen?.betaald_door ?? "",
    })
  }
  return uit.sort((a, b) => a.aankomst.localeCompare(b.aankomst))
}

/**
 * Google-afspraak (hele dagen, aankomst t/m vertrekdag) voor een eigen verblijf.
 * Met een gezin staat dat in de titel en krijgt de afspraak de kleur van dat
 * gezin (groepen: de lijst uit de instellingen, voor de kleur).
 */
export function agendaAfspraak(v: EigenVerblijfGegevens, groepen: string[] = []) {
  const titel = v.titel.trim() || "Eigen verblijf"
  const groep = (v.groep ?? "").trim()
  const nr = groep ? groepen.indexOf(groep) : -1
  const anderHuis = !!v.anderHuis
  return {
    summary: verblijfNaam({ titel, groep, anderHuis }),
    description: v.notitie ?? "",
    start: { date: v.aankomst },
    end: { date: plusDagen(v.vertrek, 1) },
    // Een verblijf in een ander (gehuurd) huis houdt ons huis niet bezet.
    transparency: anderHuis ? "transparent" : "opaque",
    // null wist een eerder gekozen kleur bij het wijzigen.
    colorId: nr >= 0 ? KLEUREN[nr % KLEUREN.length] : null,
    extendedProperties: {
      private: {
        [APP_KENMERK]: "eigen-verblijf", titel, groep,
        // Lege waarden wissen bij het wijzigen een eerder gezet gegeven.
        ander_huis: anderHuis ? "ja" : "",
        huurkosten_cent: anderHuis ? String(v.huurkosten_cent ?? 0) : "",
        betaald_door: anderHuis ? (v.betaaldDoor ?? "") : "",
      },
    },
  }
}

/** Alleen de verblijven in ons eigen huis (voor bezetting en overlap). */
export function inEigenHuis<T extends { anderHuis?: boolean }>(verblijven: T[]): T[] {
  return verblijven.filter((v) => !v.anderHuis)
}
