import { Link } from "react-router-dom"
import type { Boeking } from "../lib/types"
import type { Aanmelding } from "../domein/aanmelding"
import { formatKort, formatLang, formatTijdstip } from "../domein/datum"
import { Gegeven, Kaart, KopieerKnop } from "./ui"

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
  return (
    <Kaart titel="Aanmeldformulier" actie={<span className="text-xs text-zacht">ontvangen {formatTijdstip(a.ontvangen ?? boeking.aanmelding_op)}</span>}>
      <AanmeldingGegevens aanmelding={a} />
    </Kaart>
  )
}

/** De ingevulde velden van een aanmeldformulier (paspoortnummer afgeschermd). */
export function AanmeldingGegevens({ aanmelding: a }: { aanmelding: Aanmelding }) {
  const pas = a.paspoort ? `•••• ${a.paspoort.slice(-3)}` : ""
  return (
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
  )
}

function Kopieerbaar({ label, waarde }: { label: string; waarde: string }) {
  if (!waarde) return <Gegeven label={label}>{""}</Gegeven>
  return (
    <Gegeven label={label}>
      <span className="flex flex-wrap items-center gap-2">
        <span>{waarde}</span>
        <KopieerKnop waarde={waarde} />
      </span>
    </Gegeven>
  )
}

/**
 * Alle gegevens uit het aanmeldformulier om over te nemen in een ander
 * systeem (het PLD-portaal), elk met een kopieerknop. Het paspoortnummer staat
 * hier voluit; daarom alleen in dit venster, op verzoek.
 */
export function AanmeldingVoorPortaal({ aanmelding: a }: { aanmelding: Aanmelding }) {
  const datum = (d: string | null) => (d ? formatKort(d) : "")
  return (
    <dl className="text-sm">
      <Kopieerbaar label="Aanhef" waarde={a.aanhef} />
      <Kopieerbaar label="Voornaam" waarde={a.voornaam} />
      <Kopieerbaar label="Achternaam" waarde={a.achternaam} />
      <Kopieerbaar label="Geboortedatum" waarde={datum(a.geboortedatum)} />
      <Kopieerbaar label="Geboorteplaats" waarde={a.geboorteplaats} />
      <Kopieerbaar label="Paspoort" waarde={a.paspoort} />
      <Kopieerbaar label="Adres" waarde={a.adres} />
      <Kopieerbaar label="Postcode" waarde={a.postcode} />
      <Kopieerbaar label="Plaats" waarde={a.plaats} />
      <Kopieerbaar label="E-mail" waarde={a.email} />
      <Kopieerbaar label="Telefoon" waarde={a.telefoonMobiel || a.telefoonVast} />
      <Kopieerbaar label="Kenteken" waarde={a.kenteken} />
      {a.extraPersonen.map((p, i) => (
        <div key={i} className="mt-2 border-t border-lijn pt-2">
          <div className="wenkbrauw mb-1">Meereizende {i + 1}</div>
          <Kopieerbaar label="Naam" waarde={p.naam} />
          <Kopieerbaar label="Geboortedatum" waarde={datum(p.geboortedatum)} />
          <Kopieerbaar label="Geboorteplaats" waarde={p.geboorteplaats ?? ""} />
        </div>
      ))}
      {(a.noodcontact?.naam || a.noodcontact?.telefoonMobiel || a.noodcontact?.telefoonVast) && (
        <div className="mt-2 border-t border-lijn pt-2">
          <div className="wenkbrauw mb-1">Noodcontact</div>
          <Kopieerbaar label="Naam" waarde={a.noodcontact.naam} />
          <Kopieerbaar label="Telefoon" waarde={a.noodcontact.telefoonMobiel || a.noodcontact.telefoonVast} />
        </div>
      )}
    </dl>
  )
}
