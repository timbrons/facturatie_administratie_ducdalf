import { Link } from "react-router-dom"
import type { Boeking } from "../lib/types"
import type { Aanmelding } from "../domein/aanmelding"
import { formatLang, formatTijdstip } from "../domein/datum"
import { Gegeven, Kaart } from "./ui"

/** Gegevens uit het ingevulde aanmeldformulier, bij de boeking. */
export function AanmeldingKaart({ boeking }: { boeking: Boeking }) {
  const a = boeking.aanmelding as (Aanmelding & { ontvangen?: string }) | null
  if (!a) {
    return (
      <Kaart titel="Aanmeldformulier">
        <p className="text-sm text-zacht">
          Nog geen ingevuld formulier gekoppeld. Haal inzendingen op bij <Link to="/aanmeldingen">Aanmeldingen</Link>.
        </p>
      </Kaart>
    )
  }
  const pas = a.paspoort ? `•••• ${a.paspoort.slice(-3)}` : ""
  return (
    <Kaart titel="Aanmeldformulier" actie={<span className="text-xs text-zacht">ontvangen {formatTijdstip(a.ontvangen ?? boeking.aanmelding_op)}</span>}>
      <dl className="text-sm">
        <Gegeven label="Hoofdhuurder">{[a.aanhef, a.voornaam, a.achternaam].filter(Boolean).join(" ")}</Gegeven>
        <Gegeven label="Geboren">{[a.geboortedatum ? formatLang(a.geboortedatum) : "", a.geboorteplaats].filter(Boolean).join(", ")}</Gegeven>
        <Gegeven label="Paspoort">{pas}</Gegeven>
        <Gegeven label="Kenteken">{a.kenteken}</Gegeven>
        <Gegeven label="Meereizenden">
          {a.extraPersonen.length === 0 ? "" : (
            <ul>
              {a.extraPersonen.map((p, i) => (
                <li key={i}>{p.naam || "(geen naam)"}{p.geboortedatum ? `, ${formatLang(p.geboortedatum)}` : ""}{p.geboorteplaats ? `, ${p.geboorteplaats}` : ""}</li>
              ))}
            </ul>
          )}
        </Gegeven>
        <Gegeven label="Noodcontact">{[a.noodcontact?.naam, a.noodcontact?.telefoonMobiel || a.noodcontact?.telefoonVast, a.noodcontact?.email].filter(Boolean).join(" · ")}</Gegeven>
        <Gegeven label="Opmerkingen">{a.opmerkingen}</Gegeven>
      </dl>
    </Kaart>
  )
}
