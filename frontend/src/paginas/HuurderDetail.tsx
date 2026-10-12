import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { sleutels, useBoekingen, useHuurder, useMaillog, useOpslaan, useStappen } from "../lib/data"
import { anonimiseer } from "../lib/avg"
import { vandaag } from "../domein/datum"
import { huurderNaam, type Huurder } from "../lib/types"
import { formatLang } from "../domein/datum"
import { Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"
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

  return (
    <>
      <Paginakop wenkbrauw="Huurder" titel={huurderNaam(huurder)}>
        <Link to={`/boekingen/nieuw?huurder=${huurder.id}`} className="knop">Nieuwe boeking</Link>
      </Paginakop>
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
      </div>
    </>
  )
}
