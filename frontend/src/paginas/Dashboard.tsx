import { Link } from "react-router-dom"
import { useMemo } from "react"
import { useBoekingen, useInstellingen, useMaillog, useStappen } from "../lib/data"
import { boekingNaam } from "../lib/types"
import { isActief } from "../lib/boeking"
import { bouwActielijst, type Urgentie } from "../domein/actielijst"
import { formatMiddel, vandaag } from "../domein/datum"
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
  const maillog = useMaillog()
  const nu = vandaag()

  const acties = useMemo(() => {
    if (!boekingen.data || !stappen.data || !inst.data) return []
    return bouwActielijst(
      boekingen.data.map((b) => ({ ...b, naam: boekingNaam(b) })),
      stappen.data,
      inst.data,
      nu,
      (maillog.data ?? []).map((m) => ({ boekingId: m.boeking, sjablonen: m.sjablonen ?? [], datum: m.created.slice(0, 10) })),
    )
  }, [boekingen.data, stappen.data, inst.data, maillog.data, nu])

  if (boekingen.isLoading || stappen.isLoading || inst.isLoading) return <Laden />
  const fout = boekingen.error || stappen.error || inst.error
  if (fout) return <Fout fout={fout} />

  const alle = boekingen.data ?? []
  const komend = alle.filter((b) => isActief(b) && b.vertrek >= nu).slice(0, 6)

  return (
    <>
      <Paginakop wenkbrauw={`Vandaag, ${formatMiddel(nu)}`} titel="Acties">
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
                  <div className={`flex flex-col gap-2 border border-lijn border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${KLEUR[a.urgentie]}`}>
                    <Link to={`/boekingen/${a.boekingId}`} className="no-underline">
                      <div className="font-medium text-inkt">{a.titel}</div>
                      {a.toelichting && <div className="text-sm text-tekst">{a.toelichting}</div>}
                    </Link>
                    {a.mail && (
                      <Link to={`/boekingen/${a.boekingId}?mail=${a.mail}`} className="knop-klein shrink-0 self-start sm:self-center">
                        {a.mail === "fijne_reis" ? "Mail opstellen" : "Herinnering sturen"}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <img
            src={`${import.meta.env.BASE_URL}inloggen.jpg`}
            alt="Vakantiehuis Duc’dalf"
            className="aspect-[4/3] w-full border border-lijn object-cover object-[50%_48%]"
          />

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
