import { useQuery } from "@tanstack/react-query"
import { googleFetch, haalServerToken, heeftRecht, SCOPES, zorgVoorGoogle } from "./gmail"
import { useBoekingen, useInstellingen } from "./data"
import type { Instellingen } from "./types"
import { plusDagen, vandaag } from "../domein/datum"
import { agendaAfspraak, eigenVerblijven, verblijfGroepen, type AgendaItem, type EigenVerblijf } from "../domein/agenda"

// Eigen verblijven in Google Agenda (het afzenderaccount, via de vaste
// koppeling). Lezen kan ook met een oudere koppeling met alleen leesrechten;
// toevoegen, wijzigen en verwijderen vraagt calendar.events.

const LEZEN_OUD = "https://www.googleapis.com/auth/calendar.readonly"

export interface AgendaResultaat {
  verblijven: EigenVerblijf[]
  /** false: geen toegang tot Google Agenda (nog niet (opnieuw) gekoppeld) */
  beschikbaar: boolean
  /** true: eigen verblijven kunnen vanuit de app worden toegevoegd en gewijzigd */
  schrijven: boolean
}

const magLezen = () => heeftRecht(SCOPES.agenda) || heeftRecht(LEZEN_OUD)

function basis(agendaId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agendaId || "primary")}/events`
}

/** Haalt afspraken uit Google Agenda (vorig jaar t/m twee jaar vooruit). Nooit een Google-venster. */
async function haalAgenda(agendaId: string): Promise<AgendaItem[] | null> {
  if (!magLezen()) await haalServerToken()
  if (!magLezen()) return null
  const van = `${plusDagen(vandaag(), -400)}T00:00:00Z`
  const tot = `${plusDagen(vandaag(), 800)}T00:00:00Z`
  const items: AgendaItem[] = []
  let pagina: string | undefined
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeMin: van, timeMax: tot })
    if (pagina) params.set("pageToken", pagina)
    const res = await googleFetch(`${basis(agendaId)}?${params}`)
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
      if (!inst!.agenda_tonen) return { verblijven: [], beschikbaar: true, schrijven: false }
      const items = await haalAgenda(inst!.agenda_id)
      if (!items) return { verblijven: [], beschikbaar: false, schrijven: false }
      const actief = boekingen!.filter((b) => b.status !== "geannuleerd")
      return { verblijven: eigenVerblijven(items, inst!.agenda_filter ?? "", actief), beschikbaar: true, schrijven: heeftRecht(SCOPES.agenda) }
    },
  })
}

export interface EigenVerblijfInvoer { titel: string; notitie: string; aankomst: string; vertrek: string; groep: string }

async function schrijf(url: string, init: RequestInit, inst: Instellingen): Promise<Response> {
  await zorgVoorGoogle(inst.afzender_email, SCOPES.agenda)
  const res = await googleFetch(url, init)
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Google Agenda weigerde de wijziging: ${data?.error?.message ?? res.statusText}`)
  }
  return res
}

export async function bewaarEigenVerblijf(inst: Instellingen, v: EigenVerblijfInvoer, id?: string): Promise<void> {
  const body = JSON.stringify(agendaAfspraak(v, verblijfGroepen(inst.eigen_verblijf_groepen)))
  const headers = { "Content-Type": "application/json" }
  if (id) await schrijf(`${basis(inst.agenda_id)}/${encodeURIComponent(id)}`, { method: "PATCH", headers, body }, inst)
  else await schrijf(basis(inst.agenda_id), { method: "POST", headers, body }, inst)
}

export async function verwijderEigenVerblijf(inst: Instellingen, id: string): Promise<void> {
  await schrijf(`${basis(inst.agenda_id)}/${encodeURIComponent(id)}`, { method: "DELETE" }, inst)
}
