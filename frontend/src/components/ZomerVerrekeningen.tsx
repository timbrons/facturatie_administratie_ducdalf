import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels } from "../lib/data"
import type { ZomerVerrekeningRecord } from "../lib/types"
import { formatLang, isIsoDatum, vandaag } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import type { GezinRij } from "../domein/zomer"
import { BedragVeld, Dialoog, Fout, Kaart, Veld } from "./ui"

/**
 * Bedragen die de gezinnen al tussentijds met elkaar hebben verrekend (bijv. in
 * december de helft van de huur van het gehuurde huis), zodat na de zomer
 * alleen het nog openstaande bedrag overblijft.
 */
export function TussentijdsVerrekend({ jaar, lijst, gezinnen }: { jaar: number; lijst: ZomerVerrekeningRecord[]; gezinnen: GezinRij[] }) {
  const [open, setOpen] = useState<ZomerVerrekeningRecord | null | undefined>(undefined)
  return (
    <Kaart titel="Tussentijds verrekend" actie={<button type="button" className="knop-klein" onClick={() => setOpen(null)}>+ Verrekening</button>}>
      <p className="mb-3 text-sm text-zacht">
        Wat de gezinnen voor de zomer van {jaar} al met elkaar hebben verrekend. Dit gaat af van het saldo hierboven; "Nog te verrekenen" is wat er na de
        zomer overblijft. In de kolom "Al verrekend": plus = betaald aan het andere gezin, min = ontvangen.
      </p>
      {lijst.length === 0 ? (
        <p className="text-sm text-zacht">Nog niets tussentijds verrekend.</p>
      ) : (
        <ul className="divide-y divide-lijn border-t border-lijn text-sm">
          {lijst.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-inkt">
                {v.van} → {v.aan}
                <span className="ml-2 text-xs text-zacht">{[v.datum && formatLang(v.datum), v.omschrijving].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                {formatEuro(v.bedrag_cent)}
                <button type="button" className="knop-klein" onClick={() => setOpen(v)}>Wijzigen</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open !== undefined && <VerrekeningDialoog jaar={jaar} record={open} gezinnen={gezinnen} onSluiten={() => setOpen(undefined)} />}
    </Kaart>
  )
}

function VerrekeningDialoog({ jaar, record: r, gezinnen, onSluiten }: {
  jaar: number
  record: ZomerVerrekeningRecord | null
  gezinnen: GezinRij[]
  onSluiten: () => void
}) {
  const qc = useQueryClient()
  // Voorstel bij een nieuwe verrekening: wie nog moet betalen aan wie nog krijgt, voor het openstaande bedrag.
  const betaler = [...gezinnen].sort((a, b) => a.nogOpen_cent - b.nogOpen_cent)[0]
  const ontvanger = [...gezinnen].sort((a, b) => b.nogOpen_cent - a.nogOpen_cent)[0]
  const voorstel = betaler && ontvanger && betaler.nogOpen_cent < 0 && ontvanger.nogOpen_cent > 0
    ? Math.min(-betaler.nogOpen_cent, ontvanger.nogOpen_cent)
    : null
  const namen = gezinnen.map((g) => g.gezin)
  const [van, setVan] = useState(r?.van ?? (voorstel ? betaler.gezin : namen[1] ?? ""))
  const [aan, setAan] = useState(r?.aan ?? (voorstel ? ontvanger.gezin : namen[0] ?? ""))
  const [bedrag, setBedrag] = useState<Cent | null>(r ? r.bedrag_cent : voorstel)
  const [datum, setDatum] = useState(r?.datum ?? vandaag())
  const [omschrijving, setOmschrijving] = useState(r?.omschrijving ?? "Helft huur ander huis")
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const geldig = !!van && !!aan && van !== aan && bedrag !== null && bedrag > 0 && (datum === "" || isIsoDatum(datum))

  async function klaar(fn: () => Promise<unknown>) {
    setBezig(true)
    setFout(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: sleutels.zomerVerrekeningen })
      onSluiten()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  const data = { jaar, van, aan, bedrag_cent: bedrag ?? 0, datum, omschrijving }
  const col = pb.collection("zomer_verrekeningen")
  return (
    <Dialoog open titel={r ? "Verrekening wijzigen" : `Tussentijdse verrekening zomer ${jaar}`} onSluiten={onSluiten}>
      <form className="flex flex-col gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (geldig) klaar(() => (r ? col.update(r.id, data) : col.create(data))) }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Betaald door">
            <select value={van} onChange={(e) => setVan(e.target.value)}>
              {namen.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Veld>
          <Veld label="Aan">
            <select value={aan} onChange={(e) => setAan(e.target.value)}>
              {namen.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Veld>
          <Veld label="Bedrag"><BedragVeld waarde={bedrag} onChange={setBedrag} /></Veld>
          <Veld label="Datum"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
        </div>
        <Veld label="Omschrijving"><input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></Veld>
        {van === aan && <p className="text-xs text-oranje">Kies twee verschillende gezinnen.</p>}
        {fout ? <Fout fout={fout} /> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {r && (
              <button
                type="button"
                className="knop-rand"
                disabled={bezig}
                onClick={() => { if (window.confirm("Deze verrekening verwijderen?")) klaar(() => col.delete(r.id)) }}
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
