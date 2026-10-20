import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { bewaarEigenVerblijf, verwijderEigenVerblijf } from "../lib/agenda"
import { boekingNaam, type Boeking, type Instellingen } from "../lib/types"
import { formatLang, isIsoDatum } from "../domein/datum"
import { overlappendeBoekingen } from "../domein/overlap"
import { verblijfGroepen, verblijfNaam, type EigenVerblijf } from "../domein/agenda"
import { BedragVeld, Dialoog, Fout, Melding, Veld } from "./ui"
import type { Cent } from "../domein/geld"

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
  const groepen = verblijfGroepen(inst.eigen_verblijf_groepen)
  // Een gezin dat inmiddels niet meer in de instellingen staat, blijft kiesbaar.
  const keuzes = verblijf?.groep && !groepen.includes(verblijf.groep) ? [...groepen, verblijf.groep] : groepen
  const [groep, setGroep] = useState(verblijf?.groep ?? "")
  const [anderHuis, setAnderHuis] = useState(verblijf?.anderHuis ?? false)
  const [huurkosten, setHuurkosten] = useState<Cent | null>(verblijf?.anderHuis ? verblijf.huurkosten_cent : null)
  const [betaaldDoor, setBetaaldDoor] = useState(verblijf?.betaaldDoor ?? "")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  // Na het opslaan van een nieuw verblijf (of nieuwe data): wijzen op de aanmelding bij Parc le Duc.
  const [aanmelden, setAanmelden] = useState(false)

  const geldig = isIsoDatum(aankomst) && isIsoDatum(vertrek) && vertrek > aankomst
  const botsing = geldig && !anderHuis ? overlappendeBoekingen({ aankomst, vertrek }, boekingen) : []

  async function klaar(fn: () => Promise<void>, wijsOpAanmelding = false) {
    setBezig(true)
    setFout(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ["agenda"] })
      if (wijsOpAanmelding) setAanmelden(true)
      else onSluiten()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  if (aanmelden) {
    return (
      <Dialoog open={open} titel="Aanmelden bij Parc le Duc" onSluiten={onSluiten}>
        <div className="flex flex-col gap-4 text-sm">
          <Melding soort="succes">Het eigen verblijf is opgeslagen en staat in Google Agenda.</Melding>
          <Melding soort="waarschuwing">
            Vergeet niet dit verblijf ({formatLang(aankomst)} – {formatLang(vertrek)}{groep ? `, ${groep}` : ""}) zelf aan te melden in het
            portaal van Parc le Duc. Dat gebeurt niet automatisch.
          </Melding>
          {!inst.pld_portaal_url && (
            <p className="text-xs text-zacht">Het adres van het PLD-portaal staat nog niet bij Instellingen.</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {inst.pld_portaal_url && (
              <a href={inst.pld_portaal_url} target="_blank" rel="noopener noreferrer" className="knop-rand">Open PLD-portaal ↗</a>
            )}
            <button type="button" className="knop" onClick={onSluiten}>Sluiten</button>
          </div>
        </div>
      </Dialoog>
    )
  }

  return (
    <Dialoog open={open} titel={verblijf ? "Eigen verblijf wijzigen" : "Eigen verblijf toevoegen"} onSluiten={onSluiten}>
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          // Nieuw verblijf of andere data in ons huis: daarna wijzen op de aanmelding bij Parc le Duc.
          const nieuweData = !verblijf || verblijf.aankomst !== aankomst || verblijf.vertrek !== vertrek || !!verblijf.anderHuis
          const gegevens = { titel, notitie, aankomst, vertrek, groep, anderHuis, huurkosten_cent: huurkosten ?? 0, betaaldDoor: betaaldDoor || groep }
          if (geldig) klaar(() => bewaarEigenVerblijf(inst, gegevens, verblijf?.id), nieuweData && !anderHuis)
        }}
      >
        <Veld label="Omschrijving"><input value={titel} onChange={(e) => setTitel(e.target.value)} /></Veld>
        {keuzes.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm text-tekst">Voor wie</legend>
            {[...keuzes, ""].map((g) => (
              <label key={g || "geen"} className="flex items-center gap-2 text-inkt">
                <input type="radio" name="groep" checked={groep === g} onChange={() => setGroep(g)} />
                {g || <span className="text-zacht">Niet opgegeven</span>}
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex items-start gap-2 text-inkt">
          <input type="checkbox" className="mt-0.5" checked={anderHuis} onChange={(e) => setAnderHuis(e.target.checked)} />
          <span>
            Verblijft in een gehuurd (ander) huis op het park
            <span className="block text-xs text-zacht">Bijv. de overlapweek. Ons huis blijft dan vrij in de kalender; de week telt wel mee als gebruikt van het zomerrecht.</span>
          </span>
        </label>
        {anderHuis && (
          <div className="grid gap-3 border-l-2 border-goud pl-3 sm:grid-cols-2">
            <Veld label="Huurkosten van dat huis"><BedragVeld waarde={huurkosten} onChange={setHuurkosten} /></Veld>
            {keuzes.length > 0 && (
              <Veld label="Betaald door">
                <select value={betaaldDoor || groep} onChange={(e) => setBetaaldDoor(e.target.value)}>
                  {!groep && !betaaldDoor && <option value="">Kies…</option>}
                  {keuzes.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Veld>
            )}
            <p className="text-xs text-zacht sm:col-span-2">De huurkosten worden bij Financieel → Zomerverdeling gelijk over de gezinnen verdeeld.</p>
          </div>
        )}
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
                  if (window.confirm(`"${verblijfNaam(verblijf)}" verwijderen uit Google Agenda?`)) klaar(() => verwijderEigenVerblijf(inst, verblijf.id))
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
