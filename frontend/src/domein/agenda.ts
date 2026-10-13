import type { IsoDatum } from "./datum"

// Eigen verblijven uit Google Agenda: afspraken van minstens één nacht. Met
// een filter (komma-gescheiden woorden) tellen alleen afspraken waarvan de
// titel een van die woorden bevat. Afspraken met precies dezelfde periode als
// een boeking (bijv. een huurder die ook in de agenda staat) worden
// overgeslagen.

export interface AgendaItem {
  id?: string
  summary?: string
  status?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

export interface EigenVerblijf {
  id: string
  titel: string
  aankomst: IsoDatum
  vertrek: IsoDatum
}

function dag(t?: { date?: string; dateTime?: string }): string {
  return t?.date ?? t?.dateTime?.slice(0, 10) ?? ""
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
    const aankomst = dag(it.start)
    const vertrek = dag(it.end)
    if (!aankomst || !vertrek || vertrek <= aankomst) continue
    const titel = (it.summary ?? "").trim()
    if (woorden.length && !woorden.some((w) => titel.toLowerCase().includes(w))) continue
    if (boekingen.some((b) => b.aankomst === aankomst && b.vertrek === vertrek)) continue
    uit.push({ id: it.id ?? `${aankomst}-${vertrek}-${titel}`, titel: titel || "Eigen verblijf", aankomst, vertrek })
  }
  return uit.sort((a, b) => a.aankomst.localeCompare(b.aankomst))
}
