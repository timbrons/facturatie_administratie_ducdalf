import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useInstellingen, useUitgaven } from "../lib/data"
import type { Uitgave } from "../lib/types"
import { formatLang, isIsoDatum, maandNaam } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import { jaarVanUitgave, starlinkBedrag, starlinkJaar, totaalUitgaven } from "../domein/uitgaven"
import { schrijfCsv, csvBedrag } from "../domein/csv"
import { BedragVeld, Dialoog, Fout, Kaart, Laden, Veld } from "./ui"

function downloadCsv(naam: string, rijen: (string | number | null | undefined)[][]) {
  const blob = new Blob([schrijfCsv(rijen)], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = naam
  a.click()
  URL.revokeObjectURL(a.href)
}

async function openBewijs(u: Uitgave) {
  const token = await pb.files.getToken()
  for (const f of u.bewijs ?? []) window.open(pb.files.getURL(u, f, { token }), "_blank", "noopener")
}

/** "2026-08" → "augustus 2026" */
function periodeTekst(periode: string): string {
  if (!/^\d{4}-\d{2}$/.test(periode)) return ""
  const [j, m] = periode.split("-").map(Number)
  return `${maandNaam(m)} ${j}`
}

/**
 * Betalingen van de toeristenbelasting aan Grand Pic Saint-Loup (via het
 * portaal, van de gezamenlijke rekening), naast wat er is aangegeven.
 */
export function TbBetalingen({ jaar, aangegevenCent }: { jaar: number; aangegevenCent: Cent }) {
  const uitgaven = useUitgaven()
  const [open, setOpen] = useState<Uitgave | null | undefined>(undefined)
  if (uitgaven.isLoading) return <Laden />
  const lijst = (uitgaven.data ?? []).filter((u) => u.soort === "toeristenbelasting" && jaarVanUitgave(u) === jaar)
  const betaald = totaalUitgaven(jaar, uitgaven.data ?? [], "toeristenbelasting")
  return (
    <Kaart titel="Betaald aan Grand Pic Saint-Loup" actie={<button type="button" className="knop-klein" onClick={() => setOpen(null)}>+ Betaling</button>}>
      <p className="mb-3 text-sm text-zacht">
        Wat we via het portaal hebben betaald (afgeschreven van de gezamenlijke rekening). Een betaling telt in het jaar van afschrijving.
      </p>
      {uitgaven.error ? <Fout fout={uitgaven.error} /> : null}
      {lijst.length === 0 ? (
        <p className="text-sm text-zacht">Nog geen betalingen in {jaar}.</p>
      ) : (
        <ul className="divide-y divide-lijn border-t border-lijn text-sm">
          {lijst.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-inkt">
                {u.datum ? formatLang(u.datum) : "Datum onbekend"}
                <span className="ml-2 text-xs text-zacht">{[u.periode && `over ${periodeTekst(u.periode)}`, u.omschrijving].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                {formatEuro(u.bedrag_cent)}
                {u.bewijs?.length ? <button type="button" className="text-xs underline" onClick={() => openBewijs(u)}>bewijs</button> : null}
                <button type="button" className="knop-klein" onClick={() => setOpen(u)}>Wijzigen</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-3 grid max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t-2 border-inkt/50 pt-2 text-sm tabular-nums">
        <dt className="text-zacht">Aangegeven (verblijven {jaar})</dt><dd className="text-right">{formatEuro(aangegevenCent)}</dd>
        <dt className="font-semibold text-inkt">Betaald in {jaar}</dt><dd className="text-right font-semibold text-inkt">{formatEuro(betaald)}</dd>
      </dl>
      {open !== undefined && (
        <UitgaveDialoog
          soort="toeristenbelasting"
          titel={open ? "Betaling wijzigen" : "Betaling toeristenbelasting"}
          uitgave={open}
          standaard={{ omschrijving: "Toeristenbelasting Grand Pic Saint-Loup" }}
          onSluiten={() => setOpen(undefined)}
        />
      )}
    </Kaart>
  )
}

/** Een betaling toevoegen, wijzigen of verwijderen, met bewijsstukken. */
function UitgaveDialoog({ soort, titel, uitgave: u, standaard, onSluiten }: {
  soort: Uitgave["soort"]
  titel: string
  uitgave: Uitgave | null
  standaard: { omschrijving?: string }
  onSluiten: () => void
}) {
  const qc = useQueryClient()
  const [datum, setDatum] = useState(u?.datum ?? "")
  const [periode, setPeriode] = useState(u?.periode ?? "")
  const [bedrag, setBedrag] = useState<Cent | null>(u ? u.bedrag_cent : null)
  const [omschrijving, setOmschrijving] = useState(u?.omschrijving ?? standaard.omschrijving ?? "")
  const [bestanden, setBestanden] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const geldig = bedrag !== null && (datum === "" || isIsoDatum(datum))

  async function klaar(fn: () => Promise<unknown>) {
    setBezig(true)
    setFout(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: sleutels.uitgaven })
      onSluiten()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  function bewaar() {
    const data = new FormData()
    data.set("soort", soort)
    data.set("datum", datum)
    data.set("periode", periode)
    data.set("bedrag_cent", String(bedrag ?? 0))
    data.set("omschrijving", omschrijving)
    for (const f of bestanden) data.append("bewijs+", f)
    return klaar(() => (u ? pb.collection("uitgaven").update(u.id, data) : pb.collection("uitgaven").create(data)))
  }

  return (
    <Dialoog open titel={titel} onSluiten={onSluiten}>
      <form className="flex flex-col gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (geldig) bewaar() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Afgeschreven op"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
          <Veld label="Bedrag"><BedragVeld waarde={bedrag} onChange={setBedrag} /></Veld>
        </div>
        <Veld label="Over welke maand (optioneel)" hint="Bijv. de maand van de aangifte.">
          <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </Veld>
        <Veld label="Omschrijving"><input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></Veld>
        <Veld label="Bewijs (bijv. betaalbevestiging of afschrift)">
          <input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setBestanden([...(e.target.files ?? [])])} />
        </Veld>
        {u?.bewijs?.length ? <p className="text-xs text-zacht">Al toegevoegd: {u.bewijs.length} bestand(en). Nieuwe bestanden komen erbij.</p> : null}
        {fout ? <Fout fout={fout} /> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {u && (
              <button
                type="button"
                className="knop-rand"
                disabled={bezig}
                onClick={() => {
                  if (window.confirm("Deze betaling verwijderen, met de bewijsstukken?")) klaar(() => pb.collection("uitgaven").delete(u.id))
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

/** Starlink-abonnement: per maand actief of gepauzeerd, met het betaalde bedrag. */
export function Starlink({ jaar }: { jaar: number }) {
  const uitgaven = useUitgaven()
  const inst = useInstellingen().data
  if (uitgaven.isLoading || !inst) return <Laden />
  const maanden = starlinkJaar(jaar, uitgaven.data ?? [])
  const totaal = totaalUitgaven(jaar, (uitgaven.data ?? []).filter((u) => u.periode.startsWith(`${jaar}-`)), "starlink")

  function exporteer() {
    downloadCsv(`starlink-${jaar}.csv`, [
      ["Maand", "Status", "Bedrag", "Afgeschreven op"],
      ...maanden.map((m) => [m.periode, m.uitgave?.status ?? "", m.uitgave ? csvBedrag(m.uitgave.bedrag_cent) : "", m.uitgave?.datum ?? ""]),
      ["Totaal", "", csvBedrag(totaal), ""],
    ])
  }

  return (
    <Kaart titel={`Starlink-abonnement ${jaar}`} actie={<button type="button" className="knop-klein" onClick={exporteer}>Exporteer CSV</button>}>
      <p className="mb-3 text-sm text-zacht">
        Per maand: actief ({formatEuro(starlinkBedrag("actief", inst))}) of gepauzeerd ({formatEuro(starlinkBedrag("gepauzeerd", inst))}). Het bedrag
        wordt bij de status ingevuld en is aan te passen; de standaardbedragen staan bij Instellingen.
      </p>
      {uitgaven.error ? <Fout fout={uitgaven.error} /> : null}
      <div className="flex flex-col divide-y divide-lijn border-t border-lijn">
        {maanden.map((m) => (
          <StarlinkMaand key={m.periode + (m.uitgave?.updated ?? "")} periode={m.periode} maand={m.maand} jaar={jaar} uitgave={m.uitgave} inst={inst} />
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t-2 border-inkt/50 pt-2 text-sm font-semibold tabular-nums text-inkt">
        <span>Totaal {jaar}</span>
        <span>{formatEuro(totaal)}</span>
      </div>
    </Kaart>
  )
}

function StarlinkMaand({ periode, maand, jaar, uitgave: u, inst }: {
  periode: string
  maand: number
  jaar: number
  uitgave: Uitgave | null
  inst: { starlink_actief_cent?: Cent | null; starlink_pauze_cent?: Cent | null }
}) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<string>(u?.status ?? "")
  const [bedrag, setBedrag] = useState<Cent | null>(u ? u.bedrag_cent : null)
  const [datum, setDatum] = useState(u?.datum ?? "")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const gewijzigd = status !== (u?.status ?? "") || (bedrag ?? 0) !== (u?.bedrag_cent ?? 0) || datum !== (u?.datum ?? "")

  async function bewaar() {
    setBezig(true)
    setFout(null)
    try {
      const col = pb.collection("uitgaven")
      if (!status) {
        if (u) await col.delete(u.id)
      } else {
        const data = { soort: "starlink", periode, status, bedrag_cent: bedrag ?? 0, datum, omschrijving: `Starlink ${maandNaam(maand)} ${jaar}` }
        if (u) await col.update(u.id, data)
        else await col.create(data)
      }
      await qc.invalidateQueries({ queryKey: sleutels.uitgaven })
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="py-2">
      <div className="grid items-end gap-2 sm:grid-cols-[8rem_12rem_9rem_1fr_auto]">
        <div className="pb-2 text-sm text-inkt">{maandNaam(maand)}</div>
        <select
          aria-label={`Status ${maandNaam(maand)}`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setBedrag(e.target.value ? starlinkBedrag(e.target.value, inst) : null)
          }}
        >
          <option value="">Geen abonnement</option>
          <option value="actief">Actief</option>
          <option value="gepauzeerd">Gepauzeerd</option>
        </select>
        <BedragVeld waarde={bedrag} onChange={setBedrag} />
        <input type="date" aria-label={`Afgeschreven op ${maandNaam(maand)}`} value={datum} onChange={(e) => setDatum(e.target.value)} disabled={!status} />
        <button type="button" className="knop-klein" disabled={bezig || !gewijzigd} onClick={bewaar}>{bezig ? "Bezig…" : "Opslaan"}</button>
      </div>
      {fout ? <div className="mt-1"><Fout fout={fout} /></div> : null}
    </div>
  )
}
