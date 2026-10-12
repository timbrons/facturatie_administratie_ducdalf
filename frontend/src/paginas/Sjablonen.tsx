import { useState } from "react"
import { Link } from "react-router-dom"
import { sleutels, useOpslaan, useSjablonen, useVerwijderen } from "../lib/data"
import type { MailSjabloon, Taal } from "../lib/types"
import { VARIABELEN } from "../domein/sjablonen"
import { Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"
import { KopieerKnop } from "../components/ui"

const TALEN: Record<Taal, string> = { nl: "Nederlands", en: "Engels", fr: "Frans", de: "Duits" }

export function Sjablonen() {
  const sjablonen = useSjablonen()
  const [nieuw, setNieuw] = useState<{ sleutel: string; taal: Taal } | null>(null)
  if (sjablonen.isLoading) return <Laden />
  if (sjablonen.error) return <Fout fout={sjablonen.error} />
  const lijst = sjablonen.data ?? []
  const perSleutel = [...new Set(lijst.map((s) => s.sleutel))]

  return (
    <>
      <Paginakop wenkbrauw="Beheer" titel="E-mailsjablonen">
        <Link to="/instellingen" className="knop-rand">Terug</Link>
      </Paginakop>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {perSleutel.map((k) => (
            <Kaart key={k} titel={lijst.find((s) => s.sleutel === k && s.taal === "nl")?.naam ?? k}>
              <div className="flex flex-col gap-4">
                {lijst.filter((s) => s.sleutel === k).map((s) => <SjabloonForm key={s.id} sjabloon={s} />)}
                {nieuw?.sleutel === k && (
                  <SjabloonForm
                    sjabloon={{ ...lijst.find((s) => s.sleutel === k && s.taal === "nl")!, id: "", taal: nieuw.taal }}
                    onKlaar={() => setNieuw(null)}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-zacht">Variant toevoegen:</span>
                  {(Object.keys(TALEN) as Taal[])
                    .filter((t) => !lijst.some((s) => s.sleutel === k && s.taal === t))
                    .map((t) => (
                      <button key={t} type="button" className="knop-klein" onClick={() => setNieuw({ sleutel: k, taal: t })}>{TALEN[t]}</button>
                    ))}
                </div>
              </div>
            </Kaart>
          ))}
        </div>
        <Kaart titel="Variabelen" className="self-start lg:sticky lg:top-24">
          <p className="mb-3 text-sm text-zacht">Gebruik deze tussen accolades in onderwerp of tekst. Ze worden bij het opstellen ingevuld; je ziet altijd eerst een preview.</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {VARIABELEN.map((v) => (
              <li key={v.naam} className="flex items-center justify-between gap-2">
                <span><code className="text-goud-tekst">{`{${v.naam}}`}</code> <span className="text-xs text-zacht">{v.omschrijving}</span></span>
                <KopieerKnop waarde={`{${v.naam}}`} label="⧉" />
              </li>
            ))}
          </ul>
        </Kaart>
      </div>
    </>
  )
}

function SjabloonForm({ sjabloon, onKlaar }: { sjabloon: MailSjabloon; onKlaar?: () => void }) {
  const opslaan = useOpslaan<MailSjabloon>("mail_sjablonen", [sleutels.sjablonen])
  const verwijderen = useVerwijderen("mail_sjablonen", [sleutels.sjablonen])
  const [d, setD] = useState({ naam: sjabloon.naam, onderwerp: sjabloon.onderwerp, tekst: sjabloon.tekst, bijlagen: sjabloon.bijlagen ?? [] })
  const [klaar, setKlaar] = useState(false)
  const nieuw = !sjabloon.id
  const wissel = (b: "brochure" | "factuur") => setD({ ...d, bijlagen: d.bijlagen.includes(b) ? d.bijlagen.filter((x) => x !== b) : [...d.bijlagen, b] })
  return (
    <details open={nieuw} className="border border-lijn bg-white">
      <summary className="cursor-pointer px-3 py-2 text-inkt">{TALEN[sjabloon.taal]}{nieuw ? " (nieuw)" : ""}</summary>
      <div className="flex flex-col gap-3 p-3">
        <Veld label="Naam (in de app)"><input value={d.naam} onChange={(e) => setD({ ...d, naam: e.target.value })} /></Veld>
        <Veld label="Onderwerp"><input value={d.onderwerp} onChange={(e) => setD({ ...d, onderwerp: e.target.value })} /></Veld>
        <Veld label="Tekst"><textarea rows={10} value={d.tekst} onChange={(e) => setD({ ...d, tekst: e.target.value })} /></Veld>
        <div className="flex gap-4 text-sm text-inkt">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.bijlagen.includes("brochure")} onChange={() => wissel("brochure")} /> Brochure meesturen</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.bijlagen.includes("factuur")} onChange={() => wissel("factuur")} /> Factuur meesturen</label>
        </div>
        {(opslaan.error || verwijderen.error) ? <Fout fout={opslaan.error || verwijderen.error} /> : null}
        {klaar && <Melding soort="succes">Opgeslagen.</Melding>}
        <div className="flex justify-end gap-2">
          {sjabloon.taal !== "nl" && !nieuw && (
            <button type="button" className="knop-klein" onClick={() => window.confirm("Deze taalvariant verwijderen?") && verwijderen.mutate(sjabloon.id)}>Verwijderen</button>
          )}
          {nieuw && <button type="button" className="knop-klein" onClick={onKlaar}>Annuleren</button>}
          <button
            type="button"
            className="knop"
            disabled={opslaan.isPending}
            onClick={() => {
              setKlaar(false)
              opslaan.mutate(
                { id: sjabloon.id || undefined, data: { ...d, sleutel: sjabloon.sleutel, taal: sjabloon.taal } },
                { onSuccess: () => { setKlaar(true); onKlaar?.() } },
              )
            }}
          >
            Opslaan
          </button>
        </div>
      </div>
    </details>
  )
}
