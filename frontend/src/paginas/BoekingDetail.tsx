import { useEffect, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useBoeking, useFacturen, useHistorie, useInstellingen, useStappen, useTbTarieven } from "../lib/data"
import { gmailBeschikbaar } from "../lib/gmail"
import { actueleFactuur } from "../lib/mail"
import { boekingNaam, huurderNaam, type Boeking, type Instellingen } from "../lib/types"
import { aantalNachten, bijStatuswijziging, extrasTotaal, tbOpFactuur, tbRichtbedrag, totaalBoeking } from "../lib/boeking"
import { formatLang, formatTijdstip } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import { GEANNULEERD, gesorteerd, isBijOfVoorbij, labelVoor, overgangFout, stappenbalk, volgendeStap, type WorkflowStap } from "../domein/workflow"
import { Dialoog, Fout, Gegeven, Kaart, Laden, Melding, Paginakop } from "../components/ui"
import { StatusLabel } from "../components/Status"
import { TbAangifteDialoog, TbBerekenDialoog } from "../components/Toeristenbelasting"
import { BetalingenKaart, FacturenKaart } from "../components/FacturenBetalingen"
import { MailKaart } from "../components/Mail"

const BRONNEN: Record<string, string> = {
  website: "Eigen website",
  parc_le_duc: "Parc le Duc",
  bekenden: "Familie / bekenden",
  terugkerend: "Terugkerende gast",
  anders: "Anders",
}

export function BoekingDetail() {
  const { id } = useParams()
  const boeking = useBoeking(id)
  const stappen = useStappen()
  const inst = useInstellingen()
  const tarieven = useTbTarieven()

  if (boeking.isLoading || stappen.isLoading || inst.isLoading || tarieven.isLoading) return <Laden />
  const fout = boeking.error || stappen.error || inst.error || tarieven.error
  if (fout) return <Fout fout={fout} />
  return <Detail boeking={boeking.data!} stappen={stappen.data!} inst={inst.data!} />
}

function Detail({ boeking: b, stappen, inst }: { boeking: Boeking; stappen: WorkflowStap[]; inst: Instellingen }) {
  const qc = useQueryClient()
  const historie = useHistorie(b.id)
  const tarieven = useTbTarieven().data ?? []
  const [fout, setFout] = useState<unknown>(null)
  const [bezig, setBezig] = useState(false)
  const [dialoog, setDialoog] = useState<"" | "annuleren" | "status" | "tb_berekend" | "tb_aangegeven" | "betaling" | "mail">("")
  const [mailSleutels, setMailSleutels] = useState<string[]>([])
  const facturen = useFacturen().data ?? []
  const [params, setParams] = useSearchParams()

  function openMail(sleutelsVoorMail: string[]) {
    setMailSleutels(sleutelsVoorMail)
    setDialoog("mail")
  }

  // Vanuit de actielijst: ?mail=herinnering_rest opent direct het opstelscherm.
  useEffect(() => {
    const m = params.get("mail")
    if (m) {
      openMail(m.split(","))
      const p = new URLSearchParams(params)
      p.delete("mail")
      setParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const volgende = volgendeStap(stappen, b)
  const huurder = b.expand?.huurder
  const nachten = aantalNachten(b)
  const richt = tbRichtbedrag(b, tarieven)
  const tbFactuur = tbOpFactuur(b)

  async function ververs() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: sleutels.boekingen }),
      qc.invalidateQueries({ queryKey: sleutels.historie(b.id) }),
    ])
  }

  async function zetStatus(naar: string, extra: Record<string, unknown> = {}) {
    const melding = overgangFout(stappen, { ...b, ...extra } as Boeking, naar)
    if (melding) {
      setFout(new Error(melding))
      return false
    }
    setFout(null)
    setBezig(true)
    try {
      await pb.collection("boekingen").update(b.id, { ...bijStatuswijziging(b, naar, inst), ...extra, status: naar })
      await ververs()
      return true
    } catch (err) {
      setFout(err)
      return false
    } finally {
      setBezig(false)
    }
  }

  function voerVolgendeStapUit() {
    if (!volgende) return
    if (volgende.sleutel === "tb_berekend") return setDialoog("tb_berekend")
    if (volgende.sleutel === "tb_aangegeven") return setDialoog("tb_aangegeven")
    if (volgende.sleutel === "aanbetaling_ontvangen" || volgende.sleutel === "volledig_betaald") return setDialoog("betaling")
    const viaMail = gmailBeschikbaar()
    if (viaMail && volgende.sleutel === "aanmeldformulier_verstuurd") return openMail(["aanmeldformulier"])
    if (viaMail && volgende.sleutel === "brochure_verstuurd") return openMail(["brochure"])
    if (volgende.sleutel === "factuur_verstuurd") {
      const f = actueleFactuur(b, facturen)
      if (viaMail && f?.pdf) return openMail(["factuur"])
      document.getElementById("facturen")?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    zetStatus(volgende.sleutel)
  }

  return (
    <>
      <Paginakop
        wenkbrauw={`Boeking · ${formatLang(b.aankomst)} – ${formatLang(b.vertrek)}`}
        titel={boekingNaam(b)}
      >
        <Link to={`/boekingen/${b.id}/bewerken`} className="knop-rand">Bewerken</Link>
        {b.status !== GEANNULEERD && (
          <button type="button" className="knop-rand" onClick={() => setDialoog("annuleren")}>Annuleren</button>
        )}
      </Paginakop>

      {fout ? <div className="mb-4"><Fout fout={fout} /></div> : null}

      {b.status === GEANNULEERD && (
        <div className="mb-6">
          <Melding soort="waarschuwing">Deze boeking is geannuleerd. Reden: {b.geannuleerd_reden || "—"}</Melding>
        </div>
      )}

      {/* Stappenbalk */}
      <Stappenbalk boeking={b} stappen={stappen} />

      {/* Volgende actie */}
      <section className="mb-6 flex flex-col gap-4 border border-lijn bg-zand p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-zacht">
            Status: <StatusLabel status={b.status} stappen={stappen} optie={b.optie} />
          </div>
          <div className="wenkbrauw mb-1">Volgende actie</div>
          {volgende ? (
            <>
              <div className="font-serif text-2xl text-inkt">{volgende.actie_label || volgende.label}</div>
              {volgende.omschrijving && <div className="text-sm text-tekst">Daarna: {volgende.omschrijving}</div>}
            </>
          ) : (
            <div className="font-serif text-2xl text-inkt">{b.status === GEANNULEERD ? "Geen – geannuleerd" : "Alles is afgerond"}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {volgende && (
            <button type="button" className="knop" disabled={bezig} onClick={voerVolgendeStapUit}>
              {volgende.actie_label || volgende.label}
            </button>
          )}
          <button type="button" className="knop-klein" onClick={() => setDialoog("status")}>Status corrigeren</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Kaart titel="Huurder" actie={huurder && <Link to={`/huurders/${huurder.id}`} className="text-sm">Huurderskaart</Link>}>
            <dl>
              <Gegeven label="Naam">{huurder ? `${huurder.aanhef ? huurder.aanhef + " " : ""}${huurderNaam(huurder)}` : ""}</Gegeven>
              <Gegeven label="E-mail">{huurder?.email && <a href={`mailto:${huurder.email}`}>{huurder.email}</a>}</Gegeven>
              <Gegeven label="Telefoon">{[huurder?.telefoon_mobiel, huurder?.telefoon_vast].filter(Boolean).join(" · ")}</Gegeven>
              <Gegeven label="Adres">{[huurder?.adres, [huurder?.postcode, huurder?.plaats].filter(Boolean).join(" "), huurder?.land].filter(Boolean).join(", ")}</Gegeven>
              <Gegeven label="Kenteken">
                {b.kenteken ? (
                  <span className="inline-block border-2 border-inkt bg-[#f5c400] px-2 py-0.5 font-mono font-semibold tracking-wider text-inkt">{b.kenteken}</span>
                ) : (
                  <span className="text-oranje">Nog onbekend – nodig voor de slagboom</span>
                )}
              </Gegeven>
            </dl>
          </Kaart>

          <Kaart titel="Verblijf">
            <dl>
              <Gegeven label="Aankomst">{formatLang(b.aankomst)}</Gegeven>
              <Gegeven label="Vertrek">{formatLang(b.vertrek)}</Gegeven>
              <Gegeven label="Nachten">{nachten}</Gegeven>
              <Gegeven label="Personen">{`${b.volwassenen} volwassene(n)${b.kinderen ? `, ${b.kinderen} kind(eren)` : ""}`}</Gegeven>
              <Gegeven label="Bron">{BRONNEN[b.bron] ?? b.bron}</Gegeven>
              {b.optie && <Gegeven label="Optie">Ja, nog niet definitief</Gegeven>}
            </dl>
          </Kaart>

          <FacturenKaart boeking={b} inst={inst} stappen={stappen} />

          <MailKaart
            boeking={b}
            inst={inst}
            stappen={stappen}
            open={dialoog === "mail"}
            sleutels={mailSleutels}
            onOpen={openMail}
            onSluiten={() => setDialoog("")}
          />

          <Notities boeking={b} onOpgeslagen={ververs} />
        </div>

        <div className="flex flex-col gap-6">
          <Kaart titel="Prijsopbouw">
            <dl className="flex flex-col gap-1 text-sm">
              <PrijsRegel label={`Huur (${nachten} nachten)`} bedrag={b.huur_cent} markering={b.huur_handmatig ? "aangepast" : undefined} />
              {b.parkkosten_cent > 0 && <PrijsRegel label="Parkkosten" bedrag={b.parkkosten_cent} />}
              <PrijsRegel label="Eindschoonmaak" bedrag={b.schoonmaak_cent} />
              {(b.extras ?? []).map((x) => (
                <PrijsRegel key={x.naam} label={`${x.naam} × ${x.aantal}`} bedrag={x.prijs_cent * x.aantal * (x.eenheid === "per_nacht" ? nachten : 1)} />
              ))}
              <PrijsRegel
                label="Toeristenbelasting"
                bedrag={tbFactuur ?? b.tb_berekend_cent}
                markering={tbFactuur === null ? "richtbedrag" : "uit portaal"}
              />
              <div className="mt-2 flex justify-between border-t border-inkt/40 pt-2 font-semibold text-inkt">
                <span>Totaal</span>
                <span className="tabular-nums">{formatEuro(totaalBoeking(b))}</span>
              </div>
            </dl>
            {b.huur_handmatig && (
              <p className="mt-3 text-xs text-zacht">Berekende huur was {formatEuro(b.huur_berekend_cent)}.</p>
            )}
            {tbFactuur !== null && richt && richt.totaalCent !== tbFactuur && (
              <div className="mt-3">
                <Melding soort="waarschuwing">
                  Het portaalbedrag ({formatEuro(tbFactuur)}) wijkt af van de richtberekening ({formatEuro(richt.totaalCent)}). Het portaalbedrag gaat voor.
                </Melding>
              </div>
            )}
            {extrasTotaal(b) > 0 && <p className="mt-2 text-xs text-zacht">Waarvan extra's: {formatEuro(extrasTotaal(b))}</p>}
          </Kaart>

          <BetalingenKaart boeking={b} stappen={stappen} open={dialoog === "betaling"} onOpen={() => setDialoog("betaling")} onSluiten={() => setDialoog("")} />

          <Kaart titel="Toeristenbelasting">
            <dl className="text-sm">
              <Gegeven label="Richtbedrag">{richt ? formatEuro(richt.totaalCent) : "geen tarief"}</Gegeven>
              <Gegeven label="Simulatie portaal">{b.tb_portaal_op ? formatEuro(b.tb_portaal_cent) : ""}</Gegeven>
              <Gegeven label="Aangegeven">{b.tb_aangegeven_op ? `${formatEuro(b.tb_aangegeven_cent)} op ${formatLang(b.tb_aangegeven_op)}` : ""}</Gegeven>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="knop-klein" onClick={() => setDialoog("tb_berekend")}>Invulhulp vooraf</button>
              <button type="button" className="knop-klein" onClick={() => setDialoog("tb_aangegeven")}>Aangifte registreren</button>
            </div>
          </Kaart>

          <Kaart titel="Historie">
            {historie.isLoading ? (
              <Laden />
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {(historie.data ?? []).map((h) => (
                  <li key={h.id} className="border-l-2 border-goud pl-3">
                    <div className="text-inkt">{labelVoor(stappen, h.naar)}</div>
                    <div className="text-xs text-zacht">{formatTijdstip(h.created)}{h.door ? ` · ${h.door}` : ""}</div>
                    {h.opmerking && <div className="text-xs">{h.opmerking}</div>}
                  </li>
                ))}
              </ol>
            )}
          </Kaart>
        </div>
      </div>

      <AnnuleerDialoog
        open={dialoog === "annuleren"}
        onSluiten={() => setDialoog("")}
        onBevestig={async (reden) => {
          if (await zetStatus(GEANNULEERD, { geannuleerd_reden: reden })) setDialoog("")
        }}
      />
      <StatusDialoog
        open={dialoog === "status"}
        huidig={b.status}
        stappen={stappen}
        onSluiten={() => setDialoog("")}
        onBevestig={async (naar) => {
          if (await zetStatus(naar)) setDialoog("")
        }}
      />
      <TbBerekenDialoog
        open={dialoog === "tb_berekend"}
        boeking={b}
        inst={inst}
        richt={richt}
        onSluiten={() => setDialoog("")}
        onOpslaan={async (cent) => {
          const data = { tb_portaal_cent: cent, tb_portaal_op: new Date().toISOString() }
          // Alleen doorschuiven als de boeking nog vóór deze stap staat.
          const ok = b.status !== GEANNULEERD && !isBijOfVoorbij(stappen, b, "tb_berekend")
            ? await zetStatus("tb_berekend", data)
            : await pb.collection("boekingen").update(b.id, data).then(ververs).then(() => true).catch((e) => (setFout(e), false))
          if (ok) setDialoog("")
        }}
      />
      <TbAangifteDialoog
        open={dialoog === "tb_aangegeven"}
        boeking={b}
        inst={inst}
        tarieven={tarieven}
        onSluiten={() => setDialoog("")}
        onOpgeslagen={async () => {
          if (b.status !== GEANNULEERD && !isBijOfVoorbij(stappen, b, "tb_aangegeven")) {
            const vers = await pb.collection("boekingen").getOne<Boeking>(b.id)
            if (await zetStatus("tb_aangegeven", { tb_aangegeven_op: vers.tb_aangegeven_op })) setDialoog("")
          } else {
            await ververs()
            setDialoog("")
          }
        }}
      />
    </>
  )
}

function Stappenbalk({ boeking, stappen }: { boeking: Boeking; stappen: WorkflowStap[] }) {
  const balk = stappenbalk(stappen, boeking)
  const geannuleerd = boeking.status === GEANNULEERD
  return (
    <ol className="mb-6 flex gap-1 overflow-x-auto pb-2" aria-label="Voortgang">
      {balk.map(({ stap, toestand }, i) => {
        const stijl = geannuleerd
          ? "bg-lijn/50 text-zacht"
          : {
              gedaan: "bg-olijf text-white",
              huidig: "bg-goud text-white",
              open: "bg-white text-zacht border border-lijn",
              overgeslagen: "bg-transparent text-zacht/60 line-through border border-dashed border-lijn",
            }[toestand]
        return (
          <li
            key={stap.sleutel}
            className={`flex min-w-[7.5rem] flex-1 flex-col px-2 py-2 text-[11px] leading-tight ${stijl}`}
            title={stap.omschrijving}
            aria-current={toestand === "huidig" ? "step" : undefined}
          >
            <span className="opacity-70">{i + 1}</span>
            <span className="font-medium">{stap.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Notities({ boeking, onOpgeslagen }: { boeking: Boeking; onOpgeslagen: () => Promise<void> }) {
  const [tekst, setTekst] = useState(boeking.notities)
  const [status, setStatus] = useState<"" | "bezig" | "opgeslagen" | "fout">("")
  const gewijzigd = tekst !== boeking.notities
  return (
    <Kaart titel="Notities" actie={status === "opgeslagen" ? <span className="text-xs text-olijf-donker">Opgeslagen</span> : status === "fout" ? <span className="text-xs text-rood">Niet opgeslagen</span> : null}>
      <textarea
        rows={5}
        value={tekst}
        onChange={(e) => { setTekst(e.target.value); setStatus("") }}
        placeholder="Vrije notities over deze boeking…"
      />
      {gewijzigd && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="knop"
            disabled={status === "bezig"}
            onClick={async () => {
              setStatus("bezig")
              try {
                await pb.collection("boekingen").update(boeking.id, { notities: tekst })
                await onOpgeslagen()
                setStatus("opgeslagen")
              } catch {
                setStatus("fout")
              }
            }}
          >
            Notities opslaan
          </button>
        </div>
      )}
    </Kaart>
  )
}

function PrijsRegel({ label, bedrag, markering }: { label: string; bedrag: number; markering?: string }) {
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

function AnnuleerDialoog({ open, onSluiten, onBevestig }: { open: boolean; onSluiten: () => void; onBevestig: (reden: string) => void }) {
  const [reden, setReden] = useState("")
  return (
    <Dialoog open={open} titel="Boeking annuleren" onSluiten={onSluiten}>
      <p className="mb-3 text-sm">Geef de reden van de annulering. Is er al een factuur verstuurd? Maak daarna bij Facturen een creditfactuur.</p>
      <textarea rows={3} value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden" />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="knop-rand" onClick={onSluiten}>Terug</button>
        <button type="button" className="knop" disabled={!reden.trim()} onClick={() => onBevestig(reden.trim())}>Annuleren bevestigen</button>
      </div>
    </Dialoog>
  )
}

function StatusDialoog({
  open, huidig, stappen, onSluiten, onBevestig,
}: { open: boolean; huidig: string; stappen: WorkflowStap[]; onSluiten: () => void; onBevestig: (naar: string) => void }) {
  const [naar, setNaar] = useState(huidig)
  return (
    <Dialoog open={open} titel="Status corrigeren" onSluiten={onSluiten}>
      <p className="mb-3 text-sm">Gebruik dit alleen om een vergissing te herstellen of een stap handmatig vast te leggen. De wijziging komt in de historie.</p>
      <select value={naar} onChange={(e) => setNaar(e.target.value)}>
        {gesorteerd(stappen).map((s) => <option key={s.sleutel} value={s.sleutel}>{s.label}</option>)}
      </select>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="knop-rand" onClick={onSluiten}>Terug</button>
        <button type="button" className="knop" disabled={naar === huidig} onClick={() => onBevestig(naar)}>Status wijzigen</button>
      </div>
    </Dialoog>
  )
}
