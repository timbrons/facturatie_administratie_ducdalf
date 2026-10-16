import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useBoekingen, useHuurders } from "../lib/data"
import { huurderNaam } from "../lib/types"
import { formatLang } from "../domein/datum"
import { Fout, Laden, Paginakop } from "../components/ui"

export function Huurders() {
  const huurders = useHuurders()
  const boekingen = useBoekingen()
  const [zoek, setZoek] = useState("")

  const perHuurder = useMemo(() => {
    const m = new Map<string, { aantal: number; laatste: string }>()
    for (const b of boekingen.data ?? []) {
      if (!b.huurder || b.status === "geannuleerd") continue
      const v = m.get(b.huurder) ?? { aantal: 0, laatste: "" }
      v.aantal++
      if (b.aankomst > v.laatste) v.laatste = b.aankomst
      m.set(b.huurder, v)
    }
    return m
  }, [boekingen.data])

  const lijst = (huurders.data ?? []).filter((h) => {
    const z = zoek.trim().toLowerCase()
    return !z || `${huurderNaam(h)} ${h.email} ${h.plaats} ${h.kenteken}`.toLowerCase().includes(z)
  })

  if (huurders.isLoading) return <Laden />
  if (huurders.error) return <Fout fout={huurders.error} />

  return (
    <>
      <Paginakop wenkbrauw="Gasten" titel="Huurders" />
      <input className="mb-4" type="search" placeholder="Zoek op naam, e-mail, plaats of kenteken" value={zoek} onChange={(e) => setZoek(e.target.value)} />
      {lijst.length === 0 ? (
        <div className="infoblok">Geen huurders gevonden. Huurders ontstaan bij het aanmaken van een boeking.</div>
      ) : (
        <ul className="divide-y divide-lijn border border-lijn bg-white/70">
          {lijst.map((h) => {
            const s = perHuurder.get(h.id)
            return (
              <li key={h.id}>
                <Link to={`/huurders/${h.id}`} className="flex flex-col gap-1 px-4 py-3 no-underline hover:bg-zand/40 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-inkt">{huurderNaam(h)}</div>
                    <div className="text-sm text-zacht">{[h.email, h.plaats].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="text-sm text-zacht">
                    {s ? `${s.aantal} ${s.aantal === 1 ? "verblijf" : "verblijven"}, laatst ${formatLang(s.laatste)}` : "Nog geen verblijven"}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
