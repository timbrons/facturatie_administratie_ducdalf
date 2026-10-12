import { Link } from "react-router-dom"
import { useMemo } from "react"
import { useBoekingen, useInstellingen, useStappen } from "../lib/data"
import { boekingNaam } from "../lib/types"
import { aantalNachten, isActief, totaalBoeking } from "../lib/boeking"
import { bouwActielijst, type Urgentie } from "../domein/actielijst"
import { formatMiddel, jaarVan, vandaag } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import { Fout, Kaart, Laden, Paginakop } from "../components/ui"
import { StatusLabel } from "../components/Status"

const KLEUR: Record<Urgentie, string> = {
  rood: "border-l-rood bg-rood-zacht",
  oranje: "border-l-oranje bg-oranje-zacht",
  normaal: "border-l-olijf bg-white/70",
}

export function Dashboard() {
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const inst = useInstellingen()
  const nu = vandaag()
  const jaar = jaarVan(nu)

  const acties = useMemo(() => {
    if (!boekingen.data || !stappen.data || !inst.data) return []
    return bouwActielijst(
      boekingen.data.map((b) => ({ ...b, naam: boekingNaam(b) })),
      stappen.data,
      inst.data,
      nu,
    )
  }, [boekingen.data, stappen.data, inst.data, nu])

  if (boekingen.isLoading || stappen.isLoading || inst.isLoading) return <Laden />
  const fout = boekingen.error || stappen.error || inst.error
  if (fout) return <Fout fout={fout} />

  const alle = boekingen.data ?? []
  const ditJaar = alle.filter((b) => jaarVan(b.aankomst) === jaar && b.status !== "geannuleerd")
  const komend = alle.filter((b) => isActief(b) && b.vertrek >= nu).slice(0, 6)
  const nachten = ditJaar.filter((b) => !b.optie).reduce((t, b) => t + aantalNachten(b), 0)
  const omzet = ditJaar.filter((b) => !b.optie).reduce((t, b) => t + totaalBoeking(b), 0)

  return (
    <>
      <Paginakop wenkbrauw={`Vandaag, ${formatMiddel(nu)}`} titel="Wat moet ik doen?">
        <Link to="/boekingen/nieuw" className="knop sm:hidden">Nieuwe boeking</Link>
      </Paginakop>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {acties.length === 0 ? (
            <div className="infoblok">Er staat niets open. Alles is bijgewerkt.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {acties.map((a, i) => (
                <li key={`${a.boekingId}-${a.soort}-${i}`}>
                  <Link to={`/boekingen/${a.boekingId}`} className={`block border border-lijn border-l-4 px-4 py-3 no-underline hover:border-goud ${KLEUR[a.urgentie]}`}>
                    <div className="font-medium text-inkt">{a.titel}</div>
                    {a.toelichting && <div className="text-sm text-tekst">{a.toelichting}</div>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Kaart titel={`Seizoen ${jaar}`}>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-zacht">Boekingen</dt>
                <dd className="font-serif text-3xl text-inkt">{ditJaar.filter((b) => !b.optie).length}</dd>
              </div>
              <div>
                <dt className="text-xs text-zacht">Nachten verhuurd</dt>
                <dd className="font-serif text-3xl text-inkt">{nachten}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-zacht">Totaal geboekt (incl. kosten en belasting)</dt>
                <dd className="font-serif text-2xl text-goud-tekst">{formatEuro(omzet)}</dd>
              </div>
            </dl>
          </Kaart>

          <Kaart titel="Komende verblijven" actie={<Link to="/kalender" className="text-sm">Kalender</Link>}>
            {komend.length === 0 ? (
              <p className="text-sm text-zacht">Geen komende verblijven.</p>
            ) : (
              <ul className="divide-y divide-lijn">
                {komend.map((b) => (
                  <li key={b.id} className="py-2">
                    <Link to={`/boekingen/${b.id}`} className="flex flex-col no-underline">
                      <span className="text-inkt">{boekingNaam(b)}</span>
                      <span className="text-xs text-zacht">{formatMiddel(b.aankomst)} – {formatMiddel(b.vertrek)}</span>
                      <span className="mt-1"><StatusLabel status={b.status} stappen={stappen.data ?? []} optie={b.optie} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Kaart>
        </div>
      </div>
    </>
  )
}
