import { useQuery } from "@tanstack/react-query"
import { googleFetch, haalServerToken, heeftRecht, SCOPES } from "./gmail"
import type { MailLog } from "./types"
import { reactiesUit, type GmailBericht, type Reactie } from "../domein/mailgesprek"

// Reacties op mails uit de app: de app leest het Gmail-gesprek van elke mail
// die vanuit een boeking is verstuurd (via de vaste koppeling, gmail.readonly)
// en toont de berichten die de huurder daarin terugstuurde. Er wordt niets
// opgeslagen; Gmail blijft de bron.

export interface Gesprek {
  reacties: Reactie[]
  /** false: de koppeling heeft (nog) geen leesrecht voor Gmail */
  beschikbaar: boolean
}

export function useMailgesprek(boekingId: string, mails: MailLog[]) {
  const threads = [...new Set(mails.map((m) => m.gmail_thread_id).filter(Boolean))].sort()
  return useQuery<Gesprek>({
    queryKey: ["mailgesprek", boekingId, threads.join(",")],
    enabled: threads.length > 0,
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!heeftRecht(SCOPES.lezen)) await haalServerToken()
      if (!heeftRecht(SCOPES.lezen)) return { reacties: [], beschikbaar: false }
      const eigen = new Set(mails.map((m) => m.gmail_message_id).filter(Boolean))
      const reacties: Reactie[] = []
      for (const id of threads) {
        const res = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=full`)
        if (res.status === 404) continue
        if (!res.ok) throw new Error(`Het Gmail-gesprek kon niet worden gelezen (${res.status}).`)
        const data = (await res.json()) as { messages?: GmailBericht[] }
        reacties.push(...reactiesUit(data.messages ?? [], eigen))
      }
      return { reacties, beschikbaar: true }
    },
  })
}
