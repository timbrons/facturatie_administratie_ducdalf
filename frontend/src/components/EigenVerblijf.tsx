import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { bewaarEigenVerblijf, verwijderEigenVerblijf } from "../lib/agenda"
import { boekingNaam, type Boeking, type Instellingen } from "../lib/types"
import { formatLang, isIsoDatum } from "../domein/datum"
import { overlappendeBoekingen } from "../domein/overlap"
import type { EigenVerblijf } from "../domein/agenda"
import { Dialoog, Fout, Melding, Veld } from "./ui"

/**
 * Eigen verblijf toevoegen of wijzigen. Wordt direct in Google Agenda gezet
 * (hele dagen, van aankomst t/m vertrekdag). Huurders horen hier niet: die
 * boek je via Nieuwe boeking.
 */
export function EigenVerblijfDialoog({ open, verblijf, inst, boekingen, onSluiten }: {
  open: boolean
  verblijf: EigenVerblijf | null
  inst: Instellingen
  boekingen: Boeking[]
  onSluiten: () => void
}) {
  const qc = useQueryClient()
  const [titel, setTitel] = useState(verblijf?.titel ?? "Eigen verblijf")
  const [aankomst, setAankomst] = useState(verblijf?.aankomst ?? "")
  const [vertrek, setVertrek] = useState(verblijf?.vertrek ?? "")
  const [notitie, setNotitie] = useState(verblijf?.notitie ?? "")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)

  const geldig = isIsoDatum(aankomst) && isIsoDatum(vertrek) && vertrek > aankomst
  const botsing = geldig ? overlappendeBoekingen({ aankomst, vertrek }, boekingen) : []

  async function klaar(fn: () => Promise<void>) {
    setBezig(true)
    setFout(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ["agenda"] })
      onSluiten()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialoog open={open} titel={verblijf ? "Eigen verblijf wijzigen" : "Eigen verblijf toevoegen"} onSluiten={onSluiten}>
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (geldig) klaar(() => bewaarEigenVerblijf(inst, { titel, notitie, aankomst, vertrek }, verblijf?.id))
        }}
      >
        <Veld label="Omschrijving"><input value={titel} onChange={(e) => setTitel(e.target.value)} /></Veld>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Aankomst"><input type="date" value={aankomst} onChange={(e) => setAankomst(e.target.value)} required /></Veld>
          <Veld label="Vertrek"><input type="date" value={vertrek} onChange={(e) => setVertrek(e.target.value)} required /></Veld>
        </div>
        <Veld label="Notitie (optioneel)"><textarea rows={2} value={notitie} onChange={(e) => setNotitie(e.target.value)} /></Veld>
        {aankomst && vertrek && !geldig && <Melding soort="fout">De vertrekdatum moet na de aankomstdatum liggen.</Melding>}
        {botsing.length > 0 && (
          <Melding soort="waarschuwing">
            Let op: in deze periode is al geboekt door {botsing.map((b) => `${boekingNaam(b)} (${formatLang(b.aankomst)} – ${formatLang(b.vertrek)})`).join(", ")}.
          </Melding>
        )}
        <p className="text-xs text-zacht">
          Komt in Google Agenda als afspraak voor hele dagen, van de aankomstdag tot en met de vertrekdag. Huurders boek je via
          Nieuwe boeking, niet hier.
        </p>
        {fout ? <Fout fout={fout} /> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {verblijf && (
              <button
                type="button"
                className="knop-rand"
                disabled={bezig}
                onClick={() => {
                  if (window.confirm(`"${verblijf.titel}" verwijderen uit Google Agenda?`)) klaar(() => verwijderEigenVerblijf(inst, verblijf.id))
                }}
              >
                Verwijderen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="knop-rand" onClick={onSluiten}>Annuleren</button>
            <button type="submit" className="knop" disabled={bezig || !geldig}>{bezig ? "Bezig…" : "Opslaan"}</button>
          </div>
        </div>
      </form>
    </Dialoog>
  )
}
