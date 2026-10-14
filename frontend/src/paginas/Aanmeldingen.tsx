import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { sleutels, useAanmeldingen, useBoekingen, useInstellingen, useStappen } from "../lib/data"
import { gmailBeschikbaar, SCOPES, zorgVoorGoogle } from "../lib/gmail"
import { formulierUrl, haalInzendingen, neemOver, uitFormulier, verwerktBij, verwijderInzending, type Inzending } from "../lib/aanmeldingen"
import { boekingNaam, type Boeking } from "../lib/types"
import { telPersonen, zoekBoeking } from "../domein/aanmelding"
import { formatLang, formatTijdstip } from "../domein/datum"
import { Fout, Kaart, Laden, Melding, Paginakop } from "../components/ui"
import { GmailKnop } from "../components/Mail"

export function Aanmeldingen() {
  const inst = useInstellingen()
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const aanmeldingen = useAanmeldingen()
  const [inzendingen, setInzendingen] = useState<Inzending[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const [oudOpen, setOudOpen] = useState(false)

  if (inst.isLoading || boekingen.isLoading || stappen.isLoading || aanmeldingen.isLoading) return <Laden />
  if (aanmeldingen.error) return <Fout fout={aanmeldingen.error} />
  const lijst = boekingen.data ?? []
  const nieuw = (aanmeldingen.data ?? []).filter((a) => a.status === "nieuw")
  const verwerkt = (aanmeldingen.data ?? []).filter((a) => a.status !== "nieuw").slice(0, 15)
  const formulierAdres = formulierUrl()

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
        <a href={formulierAdres} target="_blank" rel="noreferrer" className="knop-rand">Formulier bekijken</a>
      </Paginakop>

      <p className="mb-6 text-sm text-zacht">
        Huurders vullen het formulier in op <a href={formulierAdres} target="_blank" rel="noreferrer">{formulierAdres.replace(/^https?:\/\//, "")}</a>.
        Komen ze via de persoonlijke link uit de mail (met boekingscode) en klopt alles, dan wordt de aanmelding automatisch bij de boeking
        verwerkt. Anders staat hij hieronder klaar om te controleren en over te nemen.
      </p>

      <h2 className="mb-3">Te controleren</h2>
      {nieuw.length === 0 ? (
        <div className="infoblok mb-8">Er staan geen aanmeldingen klaar.</div>
      ) : (
        <div className="mb-8 flex flex-col gap-4">
          {nieuw.map((a) => <InzendingKaart key={a.id} inzending={uitFormulier(a)} boekingen={lijst} />)}
        </div>
      )}

      {verwerkt.length > 0 && (
        <Kaart titel="Recent verwerkt" className="mb-8">
          <ul className="divide-y divide-lijn text-sm">
            {verwerkt.map((a) => {
              const b = lijst.find((x) => x.id === a.boeking)
              return (
                <li key={a.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="text-inkt">{a.naam}</span>
                    <span className="text-zacht"> · {formatLang(a.aankomst)} – {formatLang(a.vertrek)}</span>
                  </span>
                  <span className="text-xs text-zacht">
                    {a.status === "gekoppeld" ? "automatisch" : "handmatig"} verwerkt op {formatTijdstip(a.created)}
                    {b && <> · <Link to={`/boekingen/${b.id}`}>{boekingNaam(b)}</Link></>}
                  </span>
                </li>
              )
            })}
          </ul>
        </Kaart>
      )}

      <div className="border-t border-lijn pt-6">
        <button type="button" className="text-sm text-goud-tekst underline" onClick={() => setOudOpen(!oudOpen)}>
          {oudOpen ? "Verberg" : "Toon"} inzendingen van het oude formulier (FormSubmit, via Gmail)
        </button>
        {oudOpen && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <GmailKnop inst={inst.data} />
              <button type="button" className="knop" disabled={bezig || !gmailBeschikbaar()} onClick={ophalen}>
                {bezig ? "Ophalen…" : "Ophalen uit Gmail"}
              </button>
            </div>
            {!gmailBeschikbaar() && <Melding soort="waarschuwing">De Google-koppeling is niet ingesteld (VITE_GOOGLE_CLIENT_ID).</Melding>}
            {fout ? <Fout fout={fout} /> : null}
            {inzendingen && inzendingen.length === 0 && <div className="infoblok">Geen inzendingen gevonden met zoekopdracht “{inst.data?.aanmelding_zoekopdracht}”.</div>}
            {(inzendingen ?? []).map((i) => <InzendingKaart key={i.id} inzending={i} boekingen={lijst} />)}
          </div>
        )}
      </div>
    </>
  )
}

function InzendingKaart({ inzending: i, boekingen }: { inzending: Inzending; boekingen: Boeking[] }) {
  const qc = useQueryClient()
  const stappen = useStappen().data ?? []
  const a = i.aanmelding
  const verwerkt = verwerktBij(i, boekingen)
  const kandidaten = useMemo(
    () => zoekBoeking(a, boekingen.map((b) => ({ id: b.id, code: b.code, aankomst: b.aankomst, vertrek: b.vertrek, email: b.expand?.huurder?.email ?? "", status: b.status }))),
    [a, boekingen],
  )
  const [boekingId, setBoekingId] = useState(i.boekingId ?? kandidaten[0]?.boekingId ?? "")
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
              {i.toelichting && <Melding soort="waarschuwing">Niet automatisch verwerkt: {i.toelichting}</Melding>}
              {kandidaten.length === 0 && !i.boekingId && <Melding soort="waarschuwing">Geen passende boeking gevonden. Kies er zelf een of maak eerst de boeking aan.</Melding>}
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
                      await Promise.all([
                        qc.invalidateQueries({ queryKey: sleutels.boekingen }),
                        qc.invalidateQueries({ queryKey: sleutels.huurders }),
                        qc.invalidateQueries({ queryKey: sleutels.aanmeldingen }),
                      ])
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
                {i.bron === "formulier" && (
                  <button
                    type="button"
                    className="ml-3 text-sm text-rood underline"
                    disabled={bezig}
                    onClick={async () => {
                      if (!window.confirm("Deze aanmelding verwijderen? Doe dit alleen bij spam of een dubbele inzending.")) return
                      setBezig(true)
                      try {
                        await verwijderInzending(i.id)
                        await qc.invalidateQueries({ queryKey: sleutels.aanmeldingen })
                      } catch (err) {
                        setFout(err)
                        setBezig(false)
                      }
                    }}
                  >
                    Verwijderen
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Kaart>
  )
}
