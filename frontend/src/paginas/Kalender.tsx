import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useBoekingen, useInstellingen } from "../lib/data"
import { EigenVerblijfDialoog } from "../components/EigenVerblijf"
import { boekingNaam, type Boeking } from "../lib/types"
import { datumVan, formatLang, jaarVan, maandNaam, maandVan, plusDagen, vandaag } from "../domein/datum"
import { alleOverlappen, overlappendeBoekingen } from "../domein/overlap"
import { useEigenVerblijven } from "../lib/agenda"
import { inEigenHuis, verblijfNaam, type EigenVerblijf } from "../domein/agenda"
import { Dialoog, Fout, Laden, Melding, Paginakop } from "../components/ui"

const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]

/** Welke boekingen bezetten de nacht van `datum`? (aankomst <= datum < vertrek) */
function bezetting(boekingen: Boeking[], datum: string): Boeking[] {
  return boekingen.filter((b) => b.aankomst <= datum && datum < b.vertrek)
}

function dagenInMaand(jaar: number, maand: number): string[] {
  const eerste = datumVan(jaar, maand, 1)
  const uit: string[] = []
  for (let d = eerste; maandVan(d) === maand; d = plusDagen(d, 1)) uit.push(d)
  return uit
}

type Keuze = { soort: "boeking"; b: Boeking } | { soort: "eigen"; v: EigenVerblijf }

function MaandRaster({ jaar, maand, boekingen, eigen, elders, groot, onKies }: {
  jaar: number; maand: number; boekingen: Boeking[]; eigen: EigenVerblijf[]
  /** Verblijven in een gehuurd (ander) huis: bezetten ons huis niet, alleen een streepje */
  elders: EigenVerblijf[]
  groot?: boolean
  onKies: (keuzes: Keuze[]) => void
}) {
  const dagen = dagenInMaand(jaar, maand)
  const eersteWeekdag = (new Date(Date.UTC(jaar, maand - 1, 1)).getUTCDay() + 6) % 7
  const nu = vandaag()
  return (
    <div className="grid grid-cols-7 gap-px bg-lijn text-center">
      {WEEKDAGEN.map((d) => <div key={d} className="bg-zand py-1 text-[10px] uppercase tracking-wider text-zacht">{d}</div>)}
      {Array.from({ length: eersteWeekdag }).map((_, i) => <div key={`l${i}`} className="bg-creme" />)}
      {dagen.map((d) => {
        const bezet = bezetting(boekingen, d)
        const zelf = eigen.filter((v) => v.aankomst <= d && d < v.vertrek)
        const ander = elders.filter((v) => v.aankomst <= d && d < v.vertrek)
        const aankomst = boekingen.find((b) => b.aankomst === d)
        const eigenStart = eigen.find((v) => v.aankomst === d)
        const dubbel = bezet.length + zelf.length > 1
        const b = bezet[0]
        const kleur = dubbel ? "bg-rood text-white" : b ? (b.optie ? "bg-zand-donker text-inkt" : "bg-goud text-white") : zelf.length ? "bg-olijf text-white" : "bg-white"
        const namen = [
          ...bezet.map((x) => `${boekingNaam(x)}${x.optie ? " (optie)" : ""}`),
          ...zelf.map((v) => `Eigen verblijf: ${verblijfNaam(v)}`),
          ...ander.map((v) => verblijfNaam(v)),
        ]
        const keuzes: Keuze[] = [...bezet.map((x) => ({ soort: "boeking" as const, b: x })), ...[...zelf, ...ander].map((v) => ({ soort: "eigen" as const, v }))]
        return (
          <button
            key={d}
            type="button"
            title={namen.length ? namen.join(" + ") : formatLang(d)}
            onClick={() => (keuzes.length ? onKies(keuzes) : undefined)}
            className={`relative ${groot ? "min-h-16 p-1 text-left" : "aspect-square text-[11px]"} ${kleur} ${d === nu ? "outline-2 -outline-offset-2 outline-inkt" : ""} ${keuzes.length ? "cursor-pointer" : "cursor-default"}`}
          >
            {ander.length > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-inkt/70" aria-hidden />}
            <span className={groot ? "text-xs" : ""}>{Number(d.slice(8))}</span>
            {groot && aankomst && (
              <span className="mt-0.5 block truncate text-[11px] leading-tight">{boekingNaam(aankomst)}</span>
            )}
            {groot && !aankomst && eigenStart && (
              <span className="mt-0.5 block truncate text-[11px] leading-tight">{verblijfNaam(eigenStart)}</span>
            )}
            {groot && ander.filter((v) => v.aankomst === d).map((v) => (
              <span key={v.id} className="mt-0.5 block truncate text-[11px] leading-tight opacity-90">{verblijfNaam(v)}</span>
            ))}
          </button>
        )
      })}
    </div>
  )
}

export function Kalender() {
  const boekingen = useBoekingen()
  const navigate = useNavigate()
  const nu = vandaag()
  const [jaar, setJaar] = useState(jaarVan(nu))
  const [maand, setMaand] = useState<number | null>(null)

  const actief = useMemo(() => (boekingen.data ?? []).filter((b) => b.status !== "geannuleerd"), [boekingen.data])
  const overlappen = useMemo(() => alleOverlappen(actief), [actief])
  const agenda = useEigenVerblijven()
  const inst = useInstellingen().data
  // undefined = dicht, null = nieuw, anders wijzigen
  const [eigenOpen, setEigenOpen] = useState<EigenVerblijf | null | undefined>(undefined)
  const kanSchrijven = !!agenda.data?.schrijven && !!inst
  const openEigen = (v: EigenVerblijf) => (kanSchrijven ? setEigenOpen(v) : undefined)
  // Meerdere dingen op één dag (bijv. de overlapweek): eerst kiezen wat je wilt openen.
  const [keuzes, setKeuzes] = useState<Keuze[] | null>(null)
  // Verblijven in een gehuurd (ander) huis bezetten ons huis niet: alleen een streepje onder de dag.
  const eigen = inEigenHuis(agenda.data?.verblijven ?? [])
  const alleElders = (agenda.data?.verblijven ?? []).filter((v) => v.anderHuis)
  const elders = alleElders.filter((v) => jaarVan(v.aankomst) <= jaar && jaarVan(v.vertrek) >= jaar)
  const botsingen = eigen.flatMap((v) => overlappendeBoekingen({ aankomst: v.aankomst, vertrek: v.vertrek }, actief).map((b) => [v, b] as const))

  if (boekingen.isLoading) return <Laden />
  if (boekingen.error) return <Fout fout={boekingen.error} />

  const open = (b: Boeking) => navigate(`/boekingen/${b.id}`)
  const kies = (k: Keuze) => (k.soort === "boeking" ? open(k.b) : openEigen(k.v))
  const onKies = (lijst: Keuze[]) => {
    // Alleen eigen verblijven die je kunt wijzigen tellen als keuze.
    const bruikbaar = lijst.filter((k) => k.soort === "boeking" || kanSchrijven)
    if (bruikbaar.length === 1) kies(bruikbaar[0])
    else if (bruikbaar.length > 1) setKeuzes(bruikbaar)
  }

  function verschuif(stap: 1 | -1) {
    if (!maand) return setJaar(jaar + stap)
    const m = maand + stap
    if (m < 1) { setJaar(jaar - 1); setMaand(12) }
    else if (m > 12) { setJaar(jaar + 1); setMaand(1) }
    else setMaand(m)
  }

  return (
    <>
      <Paginakop wenkbrauw="Bezetting" titel={maand ? `${maandNaam(maand)} ${jaar}` : `Kalender ${jaar}`}>
        <button type="button" className="knop-rand" onClick={() => verschuif(-1)}>‹ Vorige</button>
        <button type="button" className="knop-rand" onClick={() => verschuif(1)}>Volgende ›</button>
        {maand && <button type="button" className="knop-rand" onClick={() => setMaand(null)}>Jaaroverzicht</button>}
        {kanSchrijven && <button type="button" className="knop" onClick={() => setEigenOpen(null)}>+ Eigen verblijf</button>}
      </Paginakop>
      {keuzes && (
        <Dialoog open titel="Wat wil je openen?" onSluiten={() => setKeuzes(null)}>
          <ul className="flex flex-col gap-2">
            {keuzes.map((k) => (
              <li key={k.soort === "boeking" ? k.b.id : k.v.id}>
                <button
                  type="button"
                  className="w-full border border-lijn bg-white px-3 py-2 text-left text-sm hover:border-goud"
                  onClick={() => { setKeuzes(null); kies(k) }}
                >
                  <span className="text-inkt">{k.soort === "boeking" ? boekingNaam(k.b) : verblijfNaam(k.v)}</span>
                  <span className="ml-2 text-xs text-zacht">
                    {formatLang(k.soort === "boeking" ? k.b.aankomst : k.v.aankomst)} – {formatLang(k.soort === "boeking" ? k.b.vertrek : k.v.vertrek)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Dialoog>
      )}
      {eigenOpen !== undefined && inst && (
        <EigenVerblijfDialoog
          key={eigenOpen?.id ?? "nieuw"}
          open
          verblijf={eigenOpen}
          inst={inst}
          boekingen={actief}
          onSluiten={() => setEigenOpen(undefined)}
        />
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-zacht">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-goud" /> Geboekt</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-zand-donker" /> Optie</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-olijf" /> Eigen verblijf (Google Agenda)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-rood" /> Dubbel geboekt</span>
        <span className="flex items-center gap-1"><span className="inline-block h-1 w-3 bg-inkt/70" /> Gezin in een gehuurd huis op het park</span>
        <span>Een dag is bezet als er die nacht iemand slaapt; de vertrekdag is dus vrij.</span>
      </div>

      {overlappen.length > 0 && (
        <div className="mb-4">
          <Melding soort="fout">
            Overlappende boekingen:{" "}
            {overlappen.map(([a, b], i) => (
              <span key={i}>
                {i > 0 && "; "}
                <Link to={`/boekingen/${a.id}`}>{boekingNaam(a)}</Link> en <Link to={`/boekingen/${b.id}`}>{boekingNaam(b)}</Link>
              </span>
            ))}
          </Melding>
        </div>
      )}

      {botsingen.length > 0 && (
        <div className="mb-4">
          <Melding soort="fout">
            Boeking tijdens een eigen verblijf:{" "}
            {botsingen.map(([v, b], i) => (
              <span key={i}>
                {i > 0 && "; "}
                <Link to={`/boekingen/${b.id}`}>{boekingNaam(b)}</Link> en "{verblijfNaam(v)}" ({formatLang(v.aankomst)} – {formatLang(v.vertrek)})
              </span>
            ))}
          </Melding>
        </div>
      )}
      {agenda.data?.beschikbaar && !agenda.data.schrijven && inst?.agenda_tonen && (
        <div className="mb-4">
          <Melding soort="info">
            Om eigen verblijven ook vanuit de app toe te voegen en te wijzigen: koppel Google opnieuw bij{" "}
            <Link to="/instellingen">Instellingen</Link> en geef toegang tot Google Agenda.
          </Melding>
        </div>
      )}
      {agenda.data && !agenda.data.beschikbaar && (
        <div className="mb-4">
          <Melding soort="info">
            Eigen verblijven uit Google Agenda worden nog niet getoond. Koppel het Google-account (opnieuw) bij{" "}
            <Link to="/instellingen">Instellingen</Link> en geef daarbij ook toegang tot Google Agenda.
          </Melding>
        </div>
      )}
      {agenda.error ? <div className="mb-4"><Fout fout={agenda.error} /></div> : null}

      {maand ? (
        <MaandRaster jaar={jaar} maand={maand} boekingen={actief} eigen={eigen} elders={alleElders} groot onKies={onKies} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <div key={m}>
              <button type="button" className="mb-2 font-serif text-lg text-inkt hover:text-goud-tekst" onClick={() => setMaand(m)}>
                {maandNaam(m)}
              </button>
              <MaandRaster jaar={jaar} maand={m} boekingen={actief} eigen={eigen} elders={alleElders} onKies={onKies} />
            </div>
          ))}
        </div>
      )}

      {elders.length > 0 && (
        <div className="mt-8">
          <div className="wenkbrauw mb-2">In een gehuurd huis op het park</div>
          <ul className="divide-y divide-lijn border-t border-lijn text-sm">
            {elders.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-inkt">
                  {verblijfNaam(v)}
                  <span className="ml-2 text-xs text-zacht">{formatLang(v.aankomst)} – {formatLang(v.vertrek)}</span>
                </span>
                {kanSchrijven && <button type="button" className="knop-klein" onClick={() => openEigen(v)}>Wijzigen</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
