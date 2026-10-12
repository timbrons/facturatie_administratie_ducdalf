import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useBoekingen, useHuurders, useInstellingen, useMaillog } from "../lib/data"
import { exporteerAlles } from "../lib/export"
import { anonimiseer } from "../lib/avg"
import { huurderNaam } from "../lib/types"
import { bewaargrens, teAnonimiseren } from "../domein/avg"
import { formatLang, vandaag } from "../domein/datum"
import { Fout, Kaart, Laden, Melding, Paginakop } from "../components/ui"

export function Beheer() {
  const inst = useInstellingen()
  const huurders = useHuurders()
  const boekingen = useBoekingen()
  const maillog = useMaillog()
  const qc = useQueryClient()
  const [exportStatus, setExportStatus] = useState("")
  const [exportFout, setExportFout] = useState<unknown>(null)
  const [avgBezig, setAvgBezig] = useState(false)
  const [avgFout, setAvgFout] = useState<unknown>(null)
  const [avgKlaar, setAvgKlaar] = useState(0)
  const nu = vandaag()
  const jaren = inst.data?.bewaartermijn_jaren || 7

  const kandidaten = useMemo(
    () => teAnonimiseren(huurders.data ?? [], boekingen.data ?? [], nu, jaren),
    [huurders.data, boekingen.data, nu, jaren],
  )

  if (inst.isLoading || huurders.isLoading || boekingen.isLoading || maillog.isLoading) return <Laden />

  async function exporteer() {
    setExportFout(null)
    try {
      const blob = await exporteerAlles(setExportStatus)
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `ducdalf-export-${nu}.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      setExportStatus(`Klaar: ducdalf-export-${nu}.zip is gedownload.`)
    } catch (err) {
      setExportFout(err)
      setExportStatus("")
    }
  }

  async function anonimiseerAlle() {
    if (!window.confirm(`${kandidaten.length} huurder(s) anonimiseren? Dit kan niet ongedaan worden gemaakt. Facturen en betalingen blijven bewaard.`)) return
    setAvgBezig(true)
    setAvgFout(null)
    try {
      for (const id of kandidaten) await anonimiseer(id, boekingen.data ?? [], maillog.data ?? [])
      setAvgKlaar(kandidaten.length)
      await qc.invalidateQueries()
    } catch (err) {
      setAvgFout(err)
    } finally {
      setAvgBezig(false)
    }
  }

  return (
    <>
      <Paginakop wenkbrauw="Beheer" titel="Export en privacy">
        <Link to="/instellingen" className="knop-rand">Instellingen</Link>
      </Paginakop>
      <div className="flex flex-col gap-6">
        <Kaart titel="Exporteer alles">
          <p className="mb-3 text-sm">
            Download alle gegevens in één zip: alle tabellen als JSON, overzichten als CSV (te openen in Excel) en alle bestanden (factuur-PDF's,
            bewijsstukken, brochure). Handig als extra back-up naast de automatische back-ups op de NAS.
          </p>
          <Melding soort="waarschuwing">De export bevat persoons- en bankgegevens. Bewaar hem op een veilige plek.</Melding>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="knop" disabled={!!exportStatus && !exportStatus.startsWith("Klaar")} onClick={exporteer}>Exporteer alles</button>
            {exportStatus && <span className="text-sm text-zacht">{exportStatus}</span>}
          </div>
          {exportFout ? <div className="mt-3"><Fout fout={exportFout} /></div> : null}
        </Kaart>

        <Kaart titel="Privacy (AVG)">
          <p className="mb-3 text-sm">
            Persoonsgegevens worden {jaren} jaar na het laatste verblijf niet meer bewaard (instelbaar bij Instellingen). Bij anonimiseren worden
            naam, contactgegevens, adres, kenteken, het aanmeldformulier en de tekst van verstuurde mails gewist. Facturen en betalingen blijven
            ongewijzigd bewaard vanwege de fiscale bewaarplicht.
          </p>
          <p className="mb-3 text-sm text-zacht">Grens: laatste vertrek vóór {formatLang(bewaargrens(nu, jaren))}.</p>
          {kandidaten.length === 0 ? (
            <Melding soort="succes">Er zijn geen huurders die geanonimiseerd moeten worden.</Melding>
          ) : (
            <>
              <ul className="mb-3 text-sm">
                {kandidaten.map((id) => {
                  const h = (huurders.data ?? []).find((x) => x.id === id)!
                  return <li key={id}><Link to={`/huurders/${id}`}>{huurderNaam(h)}</Link></li>
                })}
              </ul>
              <button type="button" className="knop" disabled={avgBezig} onClick={anonimiseerAlle}>
                {avgBezig ? "Bezig…" : `${kandidaten.length} huurder(s) anonimiseren`}
              </button>
            </>
          )}
          {avgKlaar > 0 && <div className="mt-3"><Melding soort="succes">{avgKlaar} huurder(s) geanonimiseerd.</Melding></div>}
          {avgFout ? <div className="mt-3"><Fout fout={avgFout} /></div> : null}
        </Kaart>
      </div>
    </>
  )
}
