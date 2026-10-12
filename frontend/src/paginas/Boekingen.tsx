import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useBoekingen, useStappen } from "../lib/data"
import { boekingNaam } from "../lib/types"
import { aantalNachten, totaalBoeking } from "../lib/boeking"
import { formatMiddel, jaarVan, vandaag } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import { gesorteerd } from "../domein/workflow"
import { Fout, Laden, Paginakop } from "../components/ui"
import { StatusLabel } from "../components/Status"

export function Boekingen() {
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const [params, setParams] = useSearchParams()
  const [zoek, setZoek] = useState("")
  const jaar = Number(params.get("jaar") || jaarVan(vandaag()))
  const status = params.get("status") || ""

  const jaren = useMemo(() => {
    const set = new Set((boekingen.data ?? []).map((b) => jaarVan(b.aankomst)))
    set.add(jaarVan(vandaag()))
    return [...set].sort((a, b) => b - a)
  }, [boekingen.data])

  const lijst = useMemo(() => {
    const z = zoek.trim().toLowerCase()
    return (boekingen.data ?? []).filter((b) => {
      if (jaarVan(b.aankomst) !== jaar) return false
      if (status === "actief" ? ["geannuleerd", "afgerond"].includes(b.status) : status && b.status !== status) return false
      if (z && !`${boekingNaam(b)} ${b.expand?.huurder?.email ?? ""} ${b.kenteken}`.toLowerCase().includes(z)) return false
      return true
    })
  }, [boekingen.data, jaar, status, zoek])

  function zet(sleutel: string, waarde: string) {
    const p = new URLSearchParams(params)
    if (waarde) p.set(sleutel, waarde)
    else p.delete(sleutel)
    setParams(p, { replace: true })
  }

  if (boekingen.isLoading || stappen.isLoading) return <Laden />
  if (boekingen.error) return <Fout fout={boekingen.error} />

  return (
    <>
      <Paginakop wenkbrauw="Overzicht" titel="Boekingen">
        <Link to="/boekingen/nieuw" className="knop">Nieuwe boeking</Link>
      </Paginakop>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <select value={jaar} onChange={(e) => zet("jaar", e.target.value)} aria-label="Jaar">
          {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
        <select value={status} onChange={(e) => zet("status", e.target.value)} aria-label="Status">
          <option value="">Alle statussen</option>
          <option value="actief">Alleen lopend</option>
          {gesorteerd(stappen.data ?? []).map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
          <option value="geannuleerd">Geannuleerd</option>
        </select>
        <input type="search" placeholder="Zoek op naam, e-mail of kenteken" value={zoek} onChange={(e) => setZoek(e.target.value)} />
      </div>

      {lijst.length === 0 ? (
        <div className="infoblok">Geen boekingen gevonden.</div>
      ) : (
        <div className="border border-lijn bg-white/70">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-lijn bg-zand/60 text-xs uppercase tracking-wider text-zacht">
              <tr>
                <th className="px-4 py-3 font-semibold">Huurder</th>
                <th className="px-4 py-3 font-semibold">Periode</th>
                <th className="px-4 py-3 font-semibold">Pers.</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lijn">
              {lijst.map((b) => (
                <tr key={b.id} className="hover:bg-zand/40">
                  <td className="px-4 py-3"><Link to={`/boekingen/${b.id}`} className="text-inkt">{boekingNaam(b)}</Link></td>
                  <td className="px-4 py-3">{formatMiddel(b.aankomst)} – {formatMiddel(b.vertrek)} <span className="text-zacht">({aantalNachten(b)} n.)</span></td>
                  <td className="px-4 py-3">{b.volwassenen}{b.kinderen ? ` + ${b.kinderen}` : ""}</td>
                  <td className="px-4 py-3"><StatusLabel status={b.status} stappen={stappen.data ?? []} optie={b.optie} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuro(totaalBoeking(b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-lijn md:hidden">
            {lijst.map((b) => (
              <li key={b.id}>
                <Link to={`/boekingen/${b.id}`} className="block px-4 py-3 no-underline">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-inkt">{boekingNaam(b)}</span>
                    <span className="tabular-nums text-sm">{formatEuro(totaalBoeking(b))}</span>
                  </div>
                  <div className="text-xs text-zacht">{formatMiddel(b.aankomst)} – {formatMiddel(b.vertrek)}</div>
                  <div className="mt-1"><StatusLabel status={b.status} stappen={stappen.data ?? []} optie={b.optie} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
