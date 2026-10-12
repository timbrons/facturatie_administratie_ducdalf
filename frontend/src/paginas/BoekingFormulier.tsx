import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useBoeking, useBoekingen, useExtras, useHuurders, useInstellingen, useSeizoenen, useTbTarieven } from "../lib/data"
import { boekingNaam, huurderNaam, type Boeking, type Huurder } from "../lib/types"
import { tbRichtbedrag } from "../lib/boeking"
import { dagenTussen, formatLang, isIsoDatum } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import { berekenHuur, berekenPrijsopbouw, type ExtraRegel } from "../domein/prijs"
import { restVervaldatum } from "../domein/betaling"
import { overlappendeBoekingen } from "../domein/overlap"
import { BedragVeld, Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"

type HuurderInvoer = Pick<Huurder, "aanhef" | "voornaam" | "achternaam" | "email" | "telefoon_mobiel" | "adres" | "postcode" | "plaats" | "land">

const LEGE_HUURDER: HuurderInvoer = {
  aanhef: "", voornaam: "", achternaam: "", email: "", telefoon_mobiel: "", adres: "", postcode: "", plaats: "", land: "Nederland",
}

export function BoekingFormulier() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const bestaand = useBoeking(id)
  const inst = useInstellingen()
  const seizoenen = useSeizoenen()
  const extras = useExtras()
  const tarieven = useTbTarieven()
  const huurders = useHuurders()
  const boekingen = useBoekingen()

  const klaar = inst.data && seizoenen.data && extras.data && tarieven.data && huurders.data && boekingen.data && (!id || bestaand.data)
  const fout = inst.error || seizoenen.error || extras.error || tarieven.error || huurders.error || boekingen.error || bestaand.error
  if (fout) return <Fout fout={fout} />
  if (!klaar) return <Laden />
  return <Formulier key={id ?? "nieuw"} boeking={bestaand.data} vooringevuldeHuurder={params.get("huurder") ?? ""} />
}

function Formulier({ boeking, vooringevuldeHuurder }: { boeking?: Boeking; vooringevuldeHuurder: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inst = useInstellingen().data!
  const seizoenen = useSeizoenen().data!
  const extrasLijst = useExtras().data!
  const tarieven = useTbTarieven().data!
  const huurders = useHuurders().data!
  const boekingen = useBoekingen().data!

  const [huurderId, setHuurderId] = useState(boeking?.huurder ?? vooringevuldeHuurder)
  const [nieuweHuurder, setNieuweHuurder] = useState<HuurderInvoer>(LEGE_HUURDER)
  const [huurderZoek, setHuurderZoek] = useState("")
  const [aankomst, setAankomst] = useState(boeking?.aankomst ?? "")
  const [vertrek, setVertrek] = useState(boeking?.vertrek ?? "")
  const [volwassenen, setVolwassenen] = useState(boeking?.volwassenen ?? 2)
  const [kinderen, setKinderen] = useState(boeking?.kinderen ?? 0)
  const [kenteken, setKenteken] = useState(boeking?.kenteken ?? "")
  const [bron, setBron] = useState(boeking?.bron ?? "")
  const [optie, setOptie] = useState(boeking?.optie ?? false)
  const [status, setStatus] = useState(boeking?.status ?? "aanvraag")
  const [betaalwijze, setBetaalwijze] = useState<"ineens" | "aanbetaling">(boeking?.betaalwijze || "aanbetaling")
  const [aanbetalingPct, setAanbetalingPct] = useState(boeking?.aanbetaling_pct || inst.aanbetaling_pct)
  const [huurHandmatig, setHuurHandmatig] = useState<Cent | null>(boeking?.huur_handmatig ? boeking.huur_cent : null)
  const [schoonmaak, setSchoonmaak] = useState<Cent>(boeking?.schoonmaak_cent ?? inst.schoonmaak_cent)
  const [gekozenExtras, setGekozenExtras] = useState<ExtraRegel[]>(() =>
    extrasLijst
      .filter((e) => e.actief || boeking?.extras?.some((g) => g.extra === e.id))
      .map((e) => {
        const g = boeking?.extras?.find((x) => x.extra === e.id)
        return { extra: e.id, naam: e.naam, aantal: g?.aantal ?? 0, prijs_cent: g?.prijs_cent ?? e.prijs_cent, eenheid: e.eenheid }
      }),
  )
  const [notities, setNotities] = useState(boeking?.notities ?? "")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)

  // Kenteken overnemen van een bekende huurder als het nog leeg is.
  useEffect(() => {
    const h = huurders.find((x) => x.id === huurderId)
    if (h?.kenteken && !kenteken) setKenteken(h.kenteken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huurderId])

  const datumsGeldig = isIsoDatum(aankomst) && isIsoDatum(vertrek) && vertrek > aankomst
  const nachten = datumsGeldig ? dagenTussen(aankomst, vertrek) : 0

  const prijs = useMemo(() => {
    if (!datumsGeldig) return null
    return berekenPrijsopbouw({
      aankomst, vertrek, seizoenen, instellingen: inst, extras: gekozenExtras, huurHandmatigCent: huurHandmatig, schoonmaakCent: schoonmaak,
    })
  }, [datumsGeldig, aankomst, vertrek, seizoenen, inst, gekozenExtras, huurHandmatig, schoonmaak])

  const huur = useMemo(() => (datumsGeldig ? berekenHuur(aankomst, vertrek, seizoenen) : null), [datumsGeldig, aankomst, vertrek, seizoenen])
  const ontbrekendeNachten = huur?.ontbrekend ?? []

  const tb = useMemo(() => {
    if (!prijs) return null
    return tbRichtbedrag({ aankomst, vertrek, huur_cent: prijs.huurCent, parkkosten_cent: prijs.parkkostenCent, volwassenen, kinderen }, tarieven)
  }, [prijs, aankomst, vertrek, volwassenen, kinderen, tarieven])

  const overlap = useMemo(() => {
    if (!datumsGeldig) return []
    return overlappendeBoekingen({ id: boeking?.id, aankomst, vertrek }, boekingen.filter((b) => b.status !== "geannuleerd"))
  }, [datumsGeldig, aankomst, vertrek, boekingen, boeking?.id])

  const minNachten = Math.max(inst.min_nachten, huur?.minNachten ?? 0)
  const gevondenHuurders = huurderZoek.trim()
    ? huurders.filter((h) => `${huurderNaam(h)} ${h.email}`.toLowerCase().includes(huurderZoek.trim().toLowerCase())).slice(0, 8)
    : []

  async function opslaan(e: React.FormEvent) {
    e.preventDefault()
    setFout(null)
    if (!datumsGeldig || !prijs) {
      setFout(new Error("Vul een geldige aankomst- en vertrekdatum in (vertrek na aankomst)."))
      return
    }
    if (!huurderId && !nieuweHuurder.voornaam.trim() && !nieuweHuurder.achternaam.trim()) {
      setFout(new Error("Kies een bestaande huurder of vul een naam in voor een nieuwe huurder."))
      return
    }
    setBezig(true)
    try {
      let hid = huurderId
      if (!hid) {
        const h = await pb.collection("huurders").create<Huurder>({ ...nieuweHuurder, kenteken, taal: "nl" })
        hid = h.id
      } else if (kenteken) {
        // Kenteken ook bij de huurder bijwerken, voor een volgende boeking.
        const h = huurders.find((x) => x.id === hid)
        if (h && h.kenteken !== kenteken) await pb.collection("huurders").update(hid, { kenteken })
      }
      const data: Record<string, unknown> = {
        huurder: hid,
        aankomst,
        vertrek,
        volwassenen,
        kinderen,
        kenteken: kenteken.toUpperCase(),
        bron,
        optie,
        status,
        betaalwijze,
        aanbetaling_pct: betaalwijze === "aanbetaling" ? aanbetalingPct : 0,
        huur_cent: prijs.huurCent,
        huur_berekend_cent: prijs.huurBerekendCent,
        huur_handmatig: prijs.huurHandmatig,
        parkkosten_cent: prijs.parkkostenCent,
        schoonmaak_cent: prijs.schoonmaakCent,
        extras: gekozenExtras.filter((x) => x.aantal > 0),
        tb_berekend_cent: tb?.totaalCent ?? 0,
        rest_vervaldatum: restVervaldatum(aankomst, inst.rest_weken_voor_aankomst),
        notities,
      }
      if (!boeking) data.taal = "nl"
      const opgeslagen = boeking
        ? await pb.collection("boekingen").update<Boeking>(boeking.id, data)
        : await pb.collection("boekingen").create<Boeking>(data)
      await qc.invalidateQueries({ queryKey: sleutels.boekingen })
      await qc.invalidateQueries({ queryKey: sleutels.huurders })
      navigate(`/boekingen/${opgeslagen.id}`)
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  const gekozenHuurder = huurders.find((h) => h.id === huurderId)

  return (
    <form onSubmit={opslaan}>
      <Paginakop wenkbrauw={boeking ? "Boeking bewerken" : "Nieuwe boeking"} titel={boeking ? boekingNaam(boeking) : "Nieuwe boeking"}>
        <Link to={boeking ? `/boekingen/${boeking.id}` : "/boekingen"} className="knop-rand">Annuleren</Link>
        <button type="submit" className="knop" disabled={bezig}>{bezig ? "Opslaan…" : "Opslaan"}</button>
      </Paginakop>

      {fout ? <div className="mb-4"><Fout fout={fout} /></div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Kaart titel="Huurder">
            {gekozenHuurder ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-inkt">{huurderNaam(gekozenHuurder)}</div>
                  <div className="text-sm text-zacht">{gekozenHuurder.email}</div>
                </div>
                <button type="button" className="knop-klein" onClick={() => setHuurderId("")}>Andere huurder</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Veld label="Bestaande huurder zoeken">
                  <input type="search" value={huurderZoek} onChange={(e) => setHuurderZoek(e.target.value)} placeholder="Naam of e-mail" />
                </Veld>
                {gevondenHuurders.length > 0 && (
                  <ul className="divide-y divide-lijn border border-lijn bg-white">
                    {gevondenHuurders.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="w-full px-3 py-2 text-left hover:bg-zand" onClick={() => { setHuurderId(h.id); setHuurderZoek("") }}>
                          {huurderNaam(h)} <span className="text-sm text-zacht">{h.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="wenkbrauw mt-2">Of een nieuwe huurder</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Veld label="Voornaam"><input value={nieuweHuurder.voornaam} onChange={(e) => setNieuweHuurder({ ...nieuweHuurder, voornaam: e.target.value })} /></Veld>
                  <Veld label="Achternaam"><input value={nieuweHuurder.achternaam} onChange={(e) => setNieuweHuurder({ ...nieuweHuurder, achternaam: e.target.value })} /></Veld>
                  <Veld label="E-mail"><input type="email" value={nieuweHuurder.email} onChange={(e) => setNieuweHuurder({ ...nieuweHuurder, email: e.target.value })} /></Veld>
                  <Veld label="Telefoon (mobiel)"><input value={nieuweHuurder.telefoon_mobiel} onChange={(e) => setNieuweHuurder({ ...nieuweHuurder, telefoon_mobiel: e.target.value })} /></Veld>
                </div>
                <p className="text-xs text-zacht">Adres en overige gegevens komen later uit het aanmeldformulier, of vul je aan op de huurderspagina.</p>
              </div>
            )}
          </Kaart>

          <Kaart titel="Verblijf">
            <div className="grid gap-4 sm:grid-cols-2">
              <Veld label="Aankomst"><input type="date" value={aankomst} onChange={(e) => setAankomst(e.target.value)} required /></Veld>
              <Veld label="Vertrek"><input type="date" value={vertrek} min={aankomst || undefined} onChange={(e) => setVertrek(e.target.value)} required /></Veld>
              <Veld label="Volwassenen (18+)"><input type="number" min={0} max={inst.max_personen} value={volwassenen} onChange={(e) => setVolwassenen(Number(e.target.value))} /></Veld>
              <Veld label="Kinderen (< 18)" hint="Vrijgesteld van toeristenbelasting"><input type="number" min={0} max={inst.max_personen} value={kinderen} onChange={(e) => setKinderen(Number(e.target.value))} /></Veld>
              <Veld label="Kenteken auto" hint="Nodig voor de slagboom van het park (kentekenherkenning)">
                <input value={kenteken} onChange={(e) => setKenteken(e.target.value.toUpperCase())} placeholder="AB-123-C" />
              </Veld>
              <Veld label="Bron aanvraag">
                <select value={bron} onChange={(e) => setBron(e.target.value)}>
                  <option value="">Onbekend</option>
                  <option value="website">Eigen website</option>
                  <option value="parc_le_duc">Parc le Duc</option>
                  <option value="bekenden">Familie / bekenden</option>
                  <option value="terugkerend">Terugkerende gast</option>
                  <option value="anders">Anders</option>
                </select>
              </Veld>
            </div>
            <label className="mt-4 flex items-center gap-2 text-inkt">
              <input type="checkbox" checked={optie} onChange={(e) => setOptie(e.target.checked)} />
              Optie (nog niet definitief gereserveerd)
            </label>
            <div className="mt-4 flex flex-col gap-2">
              {datumsGeldig && <div className="text-sm text-zacht">{nachten} nachten: {formatLang(aankomst)} t/m {formatLang(vertrek)}</div>}
              {aankomst && vertrek && !datumsGeldig && <Melding soort="fout">De vertrekdatum moet na de aankomstdatum liggen.</Melding>}
              {datumsGeldig && nachten < minNachten && <Melding soort="waarschuwing">Minder dan het minimum van {minNachten} nachten. Dat kan als uitzondering.</Melding>}
              {volwassenen + kinderen > inst.max_personen && <Melding soort="waarschuwing">Meer dan {inst.max_personen} personen.</Melding>}
              {overlap.length > 0 && (
                <Melding soort="fout">
                  Let op: overlapt met {overlap.map((b) => `${boekingNaam(b)} (${formatLang(b.aankomst)} – ${formatLang(b.vertrek)})`).join(", ")}.
                </Melding>
              )}
              {ontbrekendeNachten.length > 0 && (
                <Melding soort="waarschuwing">
                  Voor {ontbrekendeNachten.length} nacht(en) is geen seizoensprijs ingesteld (vanaf {formatLang(ontbrekendeNachten[0])}). Stel die in bij Prijzen of vul de huur handmatig in.
                </Melding>
              )}
            </div>
          </Kaart>

          <Kaart titel="Extra's">
            {gekozenExtras.length === 0 ? (
              <p className="text-sm text-zacht">Geen extra's ingesteld.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {gekozenExtras.map((x, i) => (
                  <div key={x.extra ?? i} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-inkt">{x.naam}</div>
                      <div className="text-xs text-zacht">{formatEuro(x.prijs_cent)} {x.eenheid === "per_nacht" ? "per nacht" : x.eenheid === "per_verblijf" ? "per verblijf" : "per stuk"}</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      className="w-20"
                      aria-label={`Aantal ${x.naam}`}
                      value={x.aantal}
                      onChange={(e) => setGekozenExtras(gekozenExtras.map((g, j) => (j === i ? { ...g, aantal: Math.max(0, Number(e.target.value)) } : g)))}
                    />
                  </div>
                ))}
              </div>
            )}
          </Kaart>

          <Kaart titel="Notities">
            <textarea rows={4} value={notities} onChange={(e) => setNotities(e.target.value)} placeholder="Afspraken, bijzonderheden…" />
          </Kaart>
        </div>

        <div className="flex flex-col gap-6">
          <Kaart titel="Prijs">
            {!prijs ? (
              <p className="text-sm text-zacht">Vul eerst de periode in.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <dl className="flex flex-col gap-1 text-sm">
                  <Regel label={`Huur (${prijs.nachten} nachten)`} bedrag={prijs.huurCent} markering={prijs.huurHandmatig ? "aangepast" : undefined} />
                  {prijs.parkkostenCent > 0 && <Regel label="Parkkosten" bedrag={prijs.parkkostenCent} />}
                  <Regel label="Eindschoonmaak" bedrag={prijs.schoonmaakCent} />
                  {prijs.extras.map((x) => <Regel key={x.naam} label={`${x.naam} × ${x.aantal}`} bedrag={x.bedragCent} />)}
                  <Regel label="Toeristenbelasting (richtbedrag)" bedrag={tb?.totaalCent ?? 0} />
                  <div className="mt-2 flex justify-between border-t border-inkt/40 pt-2 font-semibold text-inkt">
                    <span>Totaal (indicatie)</span>
                    <span className="tabular-nums">{formatEuro(prijs.totaalCent + (tb?.totaalCent ?? 0))}</span>
                  </div>
                </dl>
                <p className="text-xs text-zacht">
                  Berekende huur: {formatEuro(prijs.huurBerekendCent)}. De toeristenbelasting op de factuur komt uit de simulatie in het portaal.
                </p>
                <Veld label="Afwijkende huur (optioneel)" hint="Laat leeg om de berekende prijs te gebruiken">
                  <BedragVeld waarde={huurHandmatig} onChange={setHuurHandmatig} placeholder={(prijs.huurBerekendCent / 100).toFixed(2).replace(".", ",")} />
                </Veld>
                <Veld label="Eindschoonmaak">
                  <BedragVeld waarde={schoonmaak} onChange={(c) => setSchoonmaak(c ?? 0)} />
                </Veld>
              </div>
            )}
          </Kaart>

          <Kaart titel="Betalingsafspraak">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-inkt">
                <input type="radio" name="betaalwijze" checked={betaalwijze === "aanbetaling"} onChange={() => setBetaalwijze("aanbetaling")} />
                Aanbetaling, rest {inst.rest_weken_voor_aankomst} weken voor aankomst
              </label>
              {betaalwijze === "aanbetaling" && (
                <Veld label="Percentage aanbetaling" className="ml-6">
                  <input type="number" min={1} max={100} value={aanbetalingPct} onChange={(e) => setAanbetalingPct(Number(e.target.value))} />
                </Veld>
              )}
              <label className="flex items-center gap-2 text-inkt">
                <input type="radio" name="betaalwijze" checked={betaalwijze === "ineens"} onChange={() => setBetaalwijze("ineens")} />
                Volledig bedrag ineens
              </label>
              {datumsGeldig && (
                <p className="text-xs text-zacht">
                  Restbetaling uiterlijk {formatLang(restVervaldatum(aankomst, inst.rest_weken_voor_aankomst))}. De vervaldatum van de aanbetaling wordt vastgelegd bij het versturen van de factuur.
                </p>
              )}
            </div>
          </Kaart>

          {!boeking && (
            <Kaart titel="Startstatus">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="aanvraag">Aanvraag</option>
                <option value="in_afstemming">In afstemming</option>
                <option value="bevestigd">Bevestigd</option>
              </select>
            </Kaart>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="submit" className="knop" disabled={bezig}>{bezig ? "Opslaan…" : "Opslaan"}</button>
      </div>
    </form>
  )
}

function Regel({ label, bedrag, markering }: { label: string; bedrag: Cent; markering?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>
        {label}
        {markering && <span className="ml-2 bg-oranje-zacht px-1.5 text-xs text-oranje">{markering}</span>}
      </dt>
      <dd className="tabular-nums text-inkt">{formatEuro(bedrag)}</dd>
    </div>
  )
}
