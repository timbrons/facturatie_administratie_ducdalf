import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { sleutels, useBoekingen, useInstellingen, useStappen } from "../lib/data"
import { gmailBeschikbaar, SCOPES, zorgVoorGoogle } from "../lib/gmail"
import { haalInzendingen, neemOver, verwerktBij, type Inzending } from "../lib/aanmeldingen"
import { boekingNaam, type Boeking } from "../lib/types"
import { telPersonen, zoekBoeking } from "../domein/aanmelding"
import { formatLang, formatTijdstip } from "../domein/datum"
import { Fout, Kaart, Laden, Melding, Paginakop } from "../components/ui"
import { GmailKnop } from "../components/Mail"

export function Aanmeldingen() {
  const inst = useInstellingen()
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const [inzendingen, setInzendingen] = useState<Inzending[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)

  if (inst.isLoading || boekingen.isLoading || stappen.isLoading) return <Laden />
  const lijst = boekingen.data ?? []

  async function ophalen() {
    setBezig(true)
    setFout(null)
    try {
      await zorgVoorGoogle(inst.data?.afzender_email, SCOPES.lezen)
      setInzendingen(await haalInzendingen(inst.data?.aanmelding_zoekopdracht ?? ""))
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <Paginakop wenkbrauw="Aanmeldformulier" titel="Aanmeldingen">
        <GmailKnop inst={inst.data} />
        <button type="button" className="knop" disabled={bezig || !gmailBeschikbaar()} onClick={ophalen}>
          {bezig ? "Ophalen…" : "Ophalen uit Gmail"}
        </button>
      </Paginakop>

      <div className="mb-6 flex flex-col gap-3">
        <p className="text-sm text-zacht">
          Ingevulde aanmeldformulieren komen via FormSubmit binnen in de Gmail-inbox. Hier haal je ze op (alleen lezen) en neem je de gegevens
          na controle over in de huurder en de boeking. Er wordt niets automatisch gewijzigd.
        </p>
        {!gmailBeschikbaar() && <Melding soort="waarschuwing">De Google-koppeling is niet ingesteld (VITE_GOOGLE_CLIENT_ID).</Melding>}
        {fout ? <Fout fout={fout} /> : null}
      </div>

      {inzendingen && inzendingen.length === 0 && <div className="infoblok">Geen inzendingen gevonden met zoekopdracht “{inst.data?.aanmelding_zoekopdracht}”.</div>}

      <div className="flex flex-col gap-4">
        {(inzendingen ?? []).map((i) => (
          <InzendingKaart key={i.gmailId} inzending={i} boekingen={lijst} />
        ))}
      </div>
    </>
  )
}

function InzendingKaart({ inzending: i, boekingen }: { inzending: Inzending; boekingen: Boeking[] }) {
  const qc = useQueryClient()
  const stappen = useStappen().data ?? []
  const a = i.aanmelding
  const verwerkt = verwerktBij(i.gmailId, boekingen)
  const kandidaten = useMemo(
    () => zoekBoeking(a, boekingen.map((b) => ({ id: b.id, code: b.code, aankomst: b.aankomst, vertrek: b.vertrek, email: b.expand?.huurder?.email ?? "", status: b.status }))),
    [a, boekingen],
  )
  const [boekingId, setBoekingId] = useState(kandidaten[0]?.boekingId ?? "")
  const [keuze, setKeuze] = useState({ huurder: true, personen: true, kenteken: true })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const [klaar, setKlaar] = useState(false)
  const boeking = boekingen.find((b) => b.id === boekingId)
  const telling = boeking ? telPersonen(a, boeking.aankomst) : null
  const datumsAnders = boeking && a.aankomst && (a.aankomst !== boeking.aankomst || a.vertrek !== boeking.vertrek)
  const personenAnders = boeking && telling && (telling.volwassenen !== boeking.volwassenen || telling.kinderen !== boeking.kinderen)

  return (
    <Kaart titel={`${[a.voornaam, a.achternaam].filter(Boolean).join(" ") || "(zonder naam)"}`} actie={<span className="text-xs text-zacht">ontvangen {formatTijdstip(i.ontvangen)}</span>}>
      <div className="grid gap-4 md:grid-cols-2">
        <dl className="text-sm">
          <div><dt className="inline text-zacht">Verblijf: </dt><dd className="inline">{formatLang(a.aankomst)} – {formatLang(a.vertrek)}</dd></div>
          <div><dt className="inline text-zacht">Adres: </dt><dd className="inline">{[a.adres, `${a.postcode} ${a.plaats}`.trim()].filter(Boolean).join(", ")}</dd></div>
          <div><dt className="inline text-zacht">Contact: </dt><dd className="inline">{[a.email, a.telefoonMobiel].filter(Boolean).join(" · ")}</dd></div>
          <div><dt className="inline text-zacht">Kenteken: </dt><dd className="inline font-semibold">{a.kenteken || "—"}</dd></div>
          <div>
            <dt className="inline text-zacht">Personen: </dt>
            <dd className="inline">
              {1 + a.extraPersonen.length} ({["invuller", ...a.extraPersonen.map((p) => p.naam || "?")].join(", ")})
            </dd>
          </div>
          {a.opmerkingen && <div><dt className="inline text-zacht">Opmerkingen: </dt><dd className="inline">{a.opmerkingen}</dd></div>}
          {a.boekingscode && <div className="text-xs text-zacht">Boekingscode: {a.boekingscode}</div>}
        </dl>

        <div className="flex flex-col gap-3">
          {verwerkt ? (
            <Melding soort="succes">Al overgenomen bij <Link to={`/boekingen/${verwerkt.id}`}>{boekingNaam(verwerkt)}</Link>.</Melding>
          ) : klaar ? (
            <Melding soort="succes">Overgenomen bij <Link to={`/boekingen/${boekingId}`}>{boeking ? boekingNaam(boeking) : "de boeking"}</Link>.</Melding>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span>Bij boeking</span>
                <select value={boekingId} onChange={(e) => setBoekingId(e.target.value)}>
                  <option value="">Kies een boeking…</option>
                  {kandidaten.map((k) => {
                    const b = boekingen.find((x) => x.id === k.boekingId)!
                    return <option key={k.boekingId} value={k.boekingId}>{boekingNaam(b)} · {formatLang(b.aankomst)} (op {k.reden})</option>
                  })}
                  <option disabled>──────────</option>
                  {boekingen.filter((b) => b.status !== "geannuleerd" && !kandidaten.some((k) => k.boekingId === b.id)).map((b) => (
                    <option key={b.id} value={b.id}>{boekingNaam(b)} · {formatLang(b.aankomst)}</option>
                  ))}
                </select>
              </label>
              {kandidaten.length === 0 && <Melding soort="waarschuwing">Geen passende boeking gevonden. Kies er zelf een of maak eerst de boeking aan.</Melding>}
              {datumsAnders && <Melding soort="waarschuwing">Let op: de datums in het formulier wijken af van de boeking ({formatLang(boeking!.aankomst)} – {formatLang(boeking!.vertrek)}).</Melding>}
              {telling && (
                <div className="text-sm">
                  Volgens het formulier: <strong>{telling.volwassenen} volwassene(n)</strong> en <strong>{telling.kinderen} minderjarige(n)</strong> op de aankomstdatum
                  {telling.onbekend > 0 && <span className="text-oranje"> ({telling.onbekend} zonder geboortedatum, geteld als volwassene)</span>}.
                  {personenAnders && <span className="text-oranje"> De boeking heeft nu {boeking!.volwassenen} + {boeking!.kinderen}; dat kan de toeristenbelasting en een bestaande factuur raken.</span>}
                </div>
              )}
              <div className="flex flex-col gap-1 text-sm text-inkt">
                <label className="flex items-center gap-2"><input type="checkbox" checked={keuze.huurder} onChange={(e) => setKeuze({ ...keuze, huurder: e.target.checked })} /> Naam, adres en contactgegevens bij de huurder bijwerken</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={keuze.kenteken} onChange={(e) => setKeuze({ ...keuze, kenteken: e.target.checked })} /> Kenteken overnemen</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={keuze.personen} onChange={(e) => setKeuze({ ...keuze, personen: e.target.checked })} /> Aantal volwassenen/minderjarigen overnemen</label>
              </div>
              {fout ? <Fout fout={fout} /> : null}
              <div>
                <button
                  type="button"
                  className="knop"
                  disabled={!boeking || bezig}
                  onClick={async () => {
                    setBezig(true)
                    setFout(null)
                    try {
                      await neemOver(i, boeking!, stappen, keuze)
                      await Promise.all([qc.invalidateQueries({ queryKey: sleutels.boekingen }), qc.invalidateQueries({ queryKey: sleutels.huurders })])
                      setKlaar(true)
                    } catch (err) {
                      setFout(err)
                    } finally {
                      setBezig(false)
                    }
                  }}
                >
                  {bezig ? "Bezig…" : "Overnemen"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Kaart>
  )
}
