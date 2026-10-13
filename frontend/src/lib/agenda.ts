import { useQuery } from "@tanstack/react-query"
import { googleFetch, haalServerToken, heeftRecht, SCOPES } from "./gmail"
import { useBoekingen, useInstellingen } from "./data"
import { plusDagen, vandaag } from "../domein/datum"
import { eigenVerblijven, type AgendaItem, type EigenVerblijf } from "../domein/agenda"

export interface AgendaResultaat {
  verblijven: EigenVerblijf[]
  /** false: geen toegang tot Google Agenda (nog niet (opnieuw) gekoppeld) */
  beschikbaar: boolean
}

/** Haalt afspraken uit Google Agenda (vorig jaar t/m twee jaar vooruit). Nooit een Google-venster. */
async function haalAgenda(agendaId: string): Promise<AgendaItem[] | null> {
  if (!heeftRecht(SCOPES.agenda)) await haalServerToken()
  if (!heeftRecht(SCOPES.agenda)) return null
  const van = `${plusDagen(vandaag(), -400)}T00:00:00Z`
  const tot = `${plusDagen(vandaag(), 800)}T00:00:00Z`
  const items: AgendaItem[] = []
  let pagina: string | undefined
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeMin: van, timeMax: tot })
    if (pagina) params.set("pageToken", pagina)
    const res = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agendaId || "primary")}/events?${params}`)
    if (!res.ok) throw new Error(`Google Agenda kon niet worden gelezen (${res.status}). Controleer de agenda bij Instellingen.`)
    const data = await res.json()
    items.push(...((data.items ?? []) as AgendaItem[]))
    pagina = data.nextPageToken
    if (!pagina) break
  }
  return items
}

/** Eigen verblijven uit Google Agenda, voor de kalender en de overlapcontrole. */
export function useEigenVerblijven() {
  const inst = useInstellingen().data
  const boekingen = useBoekingen().data
  return useQuery<AgendaResultaat>({
    queryKey: ["agenda", inst?.agenda_id, inst?.agenda_filter, inst?.agenda_tonen, boekingen?.length],
    enabled: !!inst && !!boekingen,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!inst!.agenda_tonen) return { verblijven: [], beschikbaar: true }
      const items = await haalAgenda(inst!.agenda_id)
      if (!items) return { verblijven: [], beschikbaar: false }
      const actief = boekingen!.filter((b) => b.status !== "geannuleerd")
      return { verblijven: eigenVerblijven(items, inst!.agenda_filter ?? "", actief), beschikbaar: true }
    },
  })
}
