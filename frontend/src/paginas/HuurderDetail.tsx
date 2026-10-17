import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { MailTijdlijn } from "../components/Mail"
import { useQueryClient } from "@tanstack/react-query"
import { sleutels, useBoekingen, useFacturen, useHuurder, useInstellingen, useMaillog, useOpslaan, useStappen } from "../lib/data"
import { verwijderHuurder, type VerwijderResultaat } from "../lib/verwijderen"
import { anonimiseer } from "../lib/avg"
import { vandaag } from "../domein/datum"
import { huurderNaam, type Boeking, type Factuur, type Huurder } from "../lib/types"
import { formatLang } from "../domein/datum"
import { Dialoog, Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"
import { StatusLabel } from "../components/Status"

const VELDEN: [keyof Huurder, string, string?][] = [
  ["aanhef", "Aanhef"],
  ["voornaam", "Voornaam"],
  ["achternaam", "Achternaam"],
  ["email", "E-mail", "email"],
  ["telefoon_mobiel", "Telefoon mobiel", "tel"],
  ["telefoon_vast", "Telefoon vast", "tel"],
  ["adres", "Adres"],
  ["postcode", "Postcode"],
  ["plaats", "Plaats"],
  ["land", "Land"],
  ["kenteken", "Kenteken"],
]

export function HuurderDetail() {
  const { id } = useParams()
  const huurder = useHuurder(id)
  if (huurder.isLoading) return <Laden />
  if (huurder.error) return <Fout fout={huurder.error} />
  return <Formulier key={huurder.data!.updated} huurder={huurder.data!} />
}

function Formulier({ huurder }: { huurder: Huurder }) {
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const opslaan = useOpslaan<Huurder>("huurders", [sleutels.huurders, sleutels.huurder(huurder.id), sleutels.boekingen])
  const [data, setData] = useState<Partial<Huurder>>(huurder)
  const [opgeslagen, setOpgeslagen] = useState(false)
  const maillog = useMaillog()
  const qc = useQueryClient()
  const [avgFout, setAvgFout] = useState<unknown>(null)
  const verblijven = (boekingen.data ?? []).filter((b) => b.huurder === huurder.id).sort((a, b) => b.aankomst.localeCompare(a.aankomst))
  const alleFacturen = useFacturen().data ?? []
  const facturen = alleFacturen.filter((f) => verblijven.some((b) => b.id === f.boeking))
  const [verwijderOpen, setVerwijderOpen] = useState(false)

  return (
    <>
      <Paginakop wenkbrauw="Huurder" titel={huurderNaam(huurder)}>
        <Link to={`/boekingen/nieuw?huurder=${huurder.id}`} className="knop">Nieuwe boeking</Link>
        <button type="button" className="knop-rand" onClick={() => setVerwijderOpen(true)}>Verwijderen</button>
      </Paginakop>
      <VerwijderDialoog
        open={verwijderOpen}
        huurder={huurder}
        verblijven={verblijven}
        facturen={facturen}
        mails={(maillog.data ?? []).filter((m) => verblijven.some((b) => b.id === m.boeking)).length}
        onSluiten={() => setVerwijderOpen(false)}
      />
      {huurder.geanonimiseerd_op && <div className="mb-4"><Melding soort="info">Deze huurder is geanonimiseerd.</Melding></div>}
      {avgFout ? <div className="mb-4"><Fout fout={avgFout} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Kaart titel="Gegevens" className="lg:col-span-2">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              setOpgeslagen(false)
              const { voornaam, achternaam, aanhef, email, telefoon_mobiel, telefoon_vast, adres, postcode, plaats, land, kenteken, notities, taal } = data
              opslaan.mutate(
                { id: huurder.id, data: { voornaam, achternaam, aanhef, email, telefoon_mobiel, telefoon_vast, adres, postcode, plaats, land, kenteken: (kenteken ?? "").toUpperCase(), notities, taal } },
                { onSuccess: () => setOpgeslagen(true) },
              )
            }}
          >
            {VELDEN.map(([veld, label, type]) => (
              <Veld key={veld} label={label}>
                <input type={type ?? "text"} value={String(data[veld] ?? "")} onChange={(e) => setData({ ...data, [veld]: e.target.value })} />
              </Veld>
            ))}
            <Veld label="Taal voor e-mails">
              <select value={data.taal || "nl"} onChange={(e) => setData({ ...data, taal: e.target.value as Huurder["taal"] })}>
                <option value="nl">Nederlands</option>
                <option value="en">Engels</option>
                <option value="fr">Frans</option>
                <option value="de">Duits</option>
              </select>
            </Veld>
            <Veld label="Notities" className="sm:col-span-2">
              <textarea rows={3} value={data.notities ?? ""} onChange={(e) => setData({ ...data, notities: e.target.value })} />
            </Veld>
            <div className="flex flex-col gap-2 sm:col-span-2">
              {opslaan.error ? <Fout fout={opslaan.error} /> : null}
              {opgeslagen && <Melding soort="succes">Opgeslagen.</Melding>}
              <div className="flex justify-end">
                <button type="submit" className="knop" disabled={opslaan.isPending}>Opslaan</button>
              </div>
            </div>
          </form>
        </Kaart>
        <Kaart
          titel="Verblijven"
          actie={!huurder.geanonimiseerd_op && (
            <button
              type="button"
              className="text-xs text-zacht underline"
              onClick={async () => {
                const toekomst = verblijven.some((b) => b.vertrek >= vandaag() && b.status !== "geannuleerd")
                if (toekomst) return setAvgFout(new Error("Deze huurder heeft nog een lopend of toekomstig verblijf en kan nog niet worden geanonimiseerd."))
                if (!window.confirm("Deze huurder anonimiseren? Naam, contactgegevens, kenteken, aanmeldformulier en mailteksten worden gewist. Facturen blijven bewaard. Dit kan niet ongedaan worden gemaakt.")) return
                try {
                  await anonimiseer(huurder.id, boekingen.data ?? [], maillog.data ?? [])
                  await qc.invalidateQueries()
                } catch (err) {
                  setAvgFout(err)
                }
              }}
            >
              Anonimiseren
            </button>
          )}
        >
          {verblijven.length === 0 ? (
            <p className="text-sm text-zacht">Nog geen verblijven.</p>
          ) : (
            <ul className="divide-y divide-lijn">
              {verblijven.map((b) => (
                <li key={b.id} className="py-2">
                  <Link to={`/boekingen/${b.id}`} className="flex flex-col no-underline">
                    <span className="text-inkt">{formatLang(b.aankomst)} – {formatLang(b.vertrek)}</span>
                    <span className="mt-1"><StatusLabel status={b.status} stappen={stappen.data ?? []} optie={b.optie} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Kaart>
        {huurder.email && !huurder.geanonimiseerd_op && (
          <Kaart titel="E-mails" className="lg:col-span-3">
            <p className="mb-3 text-xs text-zacht">Alle mails van en aan {huurder.email}: verstuurd vanuit de app en uit Gmail.</p>
            <MailTijdlijn
              sleutel={`huurder-${huurder.id}`}
              mails={(maillog.data ?? []).filter((m) => verblijven.some((b) => b.id === m.boeking))}
              opties={{ email: huurder.email }}
            />
          </Kaart>
        )}
      </div>
    </>
  )
}

function VerwijderDialoog({ open, huurder, verblijven, facturen, mails, onSluiten }: {
  open: boolean
  huurder: Huurder
  verblijven: Boeking[]
  facturen: Factuur[]
  mails: number
  onSluiten: () => void
}) {
  const naam = huurderNaam(huurder)
  const inst = useInstellingen().data
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [invoer, setInvoer] = useState("")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const [klaar, setKlaar] = useState<VerwijderResultaat | null>(null)
  const definitief = facturen.filter((f) => f.nummer)
  const verstuurd = definitief.filter((f) => f.vergrendeld && !f.geimporteerd)

  async function verwijder() {
    setBezig(true)
    setFout(null)
    try {
      setKlaar(await verwijderHuurder(huurder.id, facturen, inst?.afzender_email))
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  async function sluit() {
    if (klaar) {
      await qc.invalidateQueries()
      navigate("/huurders")
    }
    setInvoer("")
    onSluiten()
  }

  return (
    <Dialoog open={open} titel="Huurder verwijderen" onSluiten={sluit}>
      {klaar ? (
        <div className="flex flex-col gap-3 text-sm">
          <Melding soort="succes">
            {naam} is verwijderd, met {klaar.boekingen} boeking(en), {klaar.facturen} {klaar.facturen === 1 ? "factuur" : "facturen"}, {klaar.betalingen} betaling(en) en {klaar.mails} mail(s) uit het maillog{klaar.aangiften > 0 ? <>, en {klaar.aangiften} maandaangifte(n) toeristenbelasting waar verder geen verblijf bij hoorde</> : null}.
          </Melding>
          {klaar.teruggezet.length > 0 && (
            <p>De factuurnummering is teruggezet; deze nummers worden opnieuw gebruikt: {klaar.teruggezet.slice().reverse().join(", ")}.</p>
          )}
          {klaar.driveOver.length > 0 && (
            <Melding soort="waarschuwing">Deze kopieën in Google Drive konden niet worden verwijderd; verwijder ze zelf: {klaar.driveOver.join(", ")}</Melding>
          )}
          <p className="text-xs text-zacht">
            Verstuurde e-mails blijven staan in Gmail (Verzonden). Kopieën van bewijsstukken toeristenbelasting staan in Google Drive onder
            Toeristenbelasting/&lt;jaar&gt;. Verwijder die daar zelf als dat nodig is.
          </p>
          <div className="flex justify-end"><button type="button" className="knop" onClick={sluit}>Sluiten</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Hiermee verwijder je <strong>{naam}</strong> definitief, met {verblijven.length} boeking(en), {facturen.length} {facturen.length === 1 ? "factuur" : "facturen"}
            (ook de PDF's en de kopieën in Google Drive), alle betalingen, de statushistorie, het aanmeldformulier, {mails} mail(s) uit het
            maillog en maandaangiften toeristenbelasting waar daarna geen verblijf meer bij hoort. Dit kan niet ongedaan worden gemaakt.
          </p>
          <Melding soort="waarschuwing">
            Gebruik dit alleen voor testgegevens of vergissingen. Facturen van echte huurders moeten 7 jaar bewaard blijven; gebruik
            daarvoor <strong>Anonimiseren</strong>.
            {verstuurd.length > 0 && <> Let op: {verstuurd.map((f) => f.nummer).join(", ")} is al verstuurd.</>}
          </Melding>
          {definitief.length > 0 && (
            <p className="text-xs text-zacht">Zijn dit de laatste factuurnummers, dan wordt de nummering teruggezet zodat er geen gat ontstaat.</p>
          )}
          <Veld label={`Typ de naam "${naam}" om te bevestigen`}>
            <input value={invoer} onChange={(e) => setInvoer(e.target.value)} autoComplete="off" />
          </Veld>
          {fout ? <Fout fout={fout} /> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="knop-rand" onClick={sluit}>Terug</button>
            <button type="button" className="knop" disabled={bezig || invoer.trim() !== naam.trim()} onClick={verwijder}>
              {bezig ? "Bezig…" : "Definitief verwijderen"}
            </button>
          </div>
        </div>
      )}
    </Dialoog>
  )
}
