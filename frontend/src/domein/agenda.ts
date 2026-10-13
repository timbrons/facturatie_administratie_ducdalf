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
  /** Gemaakt vanuit de app */
  vanApp: boolean
}

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
    const vanApp = it.extendedProperties?.private?.[APP_KENMERK] === "eigen-verblijf"
    if (!vanApp && woorden.length && !woorden.some((w) => titel.toLowerCase().includes(w))) continue
    if (!vanApp && boekingen.some((b) => b.aankomst === p.aankomst && b.vertrek === p.vertrek)) continue
    uit.push({ id: it.id ?? `${p.aankomst}-${p.vertrek}-${titel}`, titel: titel || "Eigen verblijf", notitie: it.description ?? "", ...p, vanApp })
  }
  return uit.sort((a, b) => a.aankomst.localeCompare(b.aankomst))
}

/** Google-afspraak (hele dagen, aankomst t/m vertrekdag) voor een eigen verblijf. */
export function agendaAfspraak(v: { titel: string; notitie?: string; aankomst: IsoDatum; vertrek: IsoDatum }) {
  return {
    summary: v.titel.trim() || "Eigen verblijf",
    description: v.notitie ?? "",
    start: { date: v.aankomst },
    end: { date: plusDagen(v.vertrek, 1) },
    transparency: "opaque",
    extendedProperties: { private: { [APP_KENMERK]: "eigen-verblijf" } },
  }
}
