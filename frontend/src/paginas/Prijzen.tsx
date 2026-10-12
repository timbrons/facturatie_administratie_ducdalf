import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useExtras, useOpslaan, useSeizoenen, useTbTarieven, useVerwijderen } from "../lib/data"
import type { ExtraRecord, SeizoenRecord, TbTariefRecord } from "../lib/types"
import { formatLang, jaarVan, vandaag } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import { BedragVeld, Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"

export function Prijzen() {
  return (
    <>
      <Paginakop wenkbrauw="Beheer" titel="Prijzen en tarieven" />
      <div className="flex flex-col gap-6">
        <Seizoenen />
        <Extras />
        <TbTarieven />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Seizoenen
// ---------------------------------------------------------------------------

function Seizoenen() {
  const seizoenen = useSeizoenen()
  const qc = useQueryClient()
  const [jaar, setJaar] = useState(jaarVan(vandaag()))
  const [nieuw, setNieuw] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  if (seizoenen.isLoading) return <Laden />
  if (seizoenen.error) return <Fout fout={seizoenen.error} />
  const alle = seizoenen.data ?? []
  const ditJaar = alle.filter((s) => s.jaar === jaar)
  const jaren = [...new Set([...alle.map((s) => s.jaar), jaarVan(vandaag()), jaar])].sort()

  async function kopieerNaarVolgendJaar() {
    setFout(null)
    if (alle.some((s) => s.jaar === jaar + 1) && !window.confirm(`Er bestaan al seizoenen voor ${jaar + 1}. Toch kopiëren?`)) return
    try {
      for (const s of ditJaar) {
        await pb.collection("seizoenen").create({
          jaar: jaar + 1,
          naam: s.naam,
          van: `${jaar + 1}${s.van.slice(4)}`,
          tot: `${jaar + 1}${s.tot.slice(4)}`,
          prijs_per_nacht_cent: s.prijs_per_nacht_cent,
          min_nachten: s.min_nachten,
        })
      }
      await qc.invalidateQueries({ queryKey: sleutels.seizoenen })
      setJaar(jaar + 1)
    } catch (err) {
      setFout(err)
    }
  }

  return (
    <Kaart
      titel="Seizoenen"
      actie={
        <select className="w-28" value={jaar} onChange={(e) => setJaar(Number(e.target.value))} aria-label="Jaar">
          {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      }
    >
      <p className="mb-4 text-sm text-zacht">
        Prijs per nacht <strong>inclusief parkkosten</strong>. Een nacht valt in het seizoen waarin hij begint; op een grensdatum geldt het seizoen dat dan begint.
      </p>
      {fout ? <div className="mb-3"><Fout fout={fout} /></div> : null}
      <div className="flex flex-col gap-3">
        {ditJaar.map((s) => <SeizoenRij key={s.id} seizoen={s} />)}
        {nieuw && <SeizoenRij jaar={jaar} onKlaar={() => setNieuw(false)} />}
        {ditJaar.length === 0 && !nieuw && <div className="infoblok">Nog geen seizoenen voor {jaar}.</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="knop-rand" onClick={() => setNieuw(true)}>Seizoen toevoegen</button>
        {ditJaar.length > 0 && <button type="button" className="knop-rand" onClick={kopieerNaarVolgendJaar}>Kopieer naar {jaar + 1}</button>}
      </div>
    </Kaart>
  )
}

function SeizoenRij({ seizoen, jaar, onKlaar }: { seizoen?: SeizoenRecord; jaar?: number; onKlaar?: () => void }) {
  const opslaan = useOpslaan<SeizoenRecord>("seizoenen", [sleutels.seizoenen])
  const verwijderen = useVerwijderen("seizoenen", [sleutels.seizoenen])
  const [naam, setNaam] = useState(seizoen?.naam ?? "")
  const [van, setVan] = useState(seizoen?.van ?? "")
  const [tot, setTot] = useState(seizoen?.tot ?? "")
  const [prijs, setPrijs] = useState<Cent | null>(seizoen?.prijs_per_nacht_cent ?? null)
  const [min, setMin] = useState(seizoen?.min_nachten ?? 7)
  const gewijzigd = !seizoen || naam !== seizoen.naam || van !== seizoen.van || tot !== seizoen.tot || prijs !== seizoen.prijs_per_nacht_cent || min !== seizoen.min_nachten
  return (
    <div className="grid grid-cols-2 gap-2 border border-lijn bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_0.6fr_auto] sm:items-end">
      <Veld label="Naam"><input value={naam} onChange={(e) => setNaam(e.target.value)} /></Veld>
      <Veld label="Van"><input type="date" value={van} onChange={(e) => setVan(e.target.value)} /></Veld>
      <Veld label="T/m"><input type="date" value={tot} onChange={(e) => setTot(e.target.value)} /></Veld>
      <Veld label="Per nacht" hint={prijs ? `${formatEuro(prijs * 7)} per week` : undefined}><BedragVeld waarde={prijs} onChange={setPrijs} /></Veld>
      <Veld label="Min. nachten"><input type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} /></Veld>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        {gewijzigd && (
          <button
            type="button"
            className="knop"
            disabled={!naam || !van || !tot || !prijs || opslaan.isPending}
            onClick={() =>
              opslaan.mutate(
                { id: seizoen?.id, data: { jaar: seizoen?.jaar ?? jaar ?? jaarVan(van), naam, van, tot, prijs_per_nacht_cent: prijs, min_nachten: min } },
                { onSuccess: () => onKlaar?.() },
              )
            }
          >
            Opslaan
          </button>
        )}
        <button
          type="button"
          className="knop-klein"
          onClick={() => (seizoen ? window.confirm(`Seizoen "${seizoen.naam}" verwijderen?`) && verwijderen.mutate(seizoen.id) : onKlaar?.())}
        >
          {seizoen ? "Verwijderen" : "Annuleren"}
        </button>
      </div>
      {(opslaan.error || verwijderen.error) ? <div className="col-span-full"><Fout fout={opslaan.error || verwijderen.error} /></div> : null}
      {van && tot && tot < van && <div className="col-span-full"><Melding soort="fout">"T/m" ligt vóór "Van".</Melding></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extra's
// ---------------------------------------------------------------------------

function Extras() {
  const extras = useExtras()
  const [nieuw, setNieuw] = useState(false)
  if (extras.isLoading) return <Laden />
  if (extras.error) return <Fout fout={extras.error} />
  return (
    <Kaart titel="Extra's">
      <p className="mb-4 text-sm text-zacht">Posten die een huurder kan bijboeken, zoals linnen- en handdoekenpakketten.</p>
      <div className="flex flex-col gap-3">
        {(extras.data ?? []).map((x) => <ExtraRij key={x.id} extra={x} />)}
        {nieuw && <ExtraRij onKlaar={() => setNieuw(false)} />}
      </div>
      <button type="button" className="knop-rand mt-4" onClick={() => setNieuw(true)}>Extra toevoegen</button>
    </Kaart>
  )
}

function ExtraRij({ extra, onKlaar }: { extra?: ExtraRecord; onKlaar?: () => void }) {
  const opslaan = useOpslaan<ExtraRecord>("extras", [sleutels.extras])
  const verwijderen = useVerwijderen("extras", [sleutels.extras])
  const [d, setD] = useState({
    naam: extra?.naam ?? "",
    omschrijving: extra?.omschrijving ?? "",
    prijs_cent: extra?.prijs_cent ?? (null as Cent | null),
    eenheid: extra?.eenheid ?? "per_stuk",
    actief: extra?.actief ?? true,
    volgorde: extra?.volgorde ?? 0,
  })
  const gewijzigd = !extra || JSON.stringify(d) !== JSON.stringify({ naam: extra.naam, omschrijving: extra.omschrijving, prijs_cent: extra.prijs_cent, eenheid: extra.eenheid, actief: extra.actief, volgorde: extra.volgorde })
  return (
    <div className="grid grid-cols-2 gap-2 border border-lijn bg-white p-3 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end">
      <Veld label="Naam"><input value={d.naam} onChange={(e) => setD({ ...d, naam: e.target.value })} /></Veld>
      <Veld label="Prijs"><BedragVeld waarde={d.prijs_cent} onChange={(c) => setD({ ...d, prijs_cent: c })} /></Veld>
      <Veld label="Eenheid">
        <select value={d.eenheid} onChange={(e) => setD({ ...d, eenheid: e.target.value as ExtraRecord["eenheid"] })}>
          <option value="per_stuk">Per stuk</option>
          <option value="per_nacht">Per nacht</option>
          <option value="per_verblijf">Per verblijf</option>
        </select>
      </Veld>
      <label className="flex items-center gap-2 pb-2 text-inkt">
        <input type="checkbox" checked={d.actief} onChange={(e) => setD({ ...d, actief: e.target.checked })} /> Actief
      </label>
      <Veld label="Omschrijving" className="col-span-2 sm:col-span-3"><input value={d.omschrijving} onChange={(e) => setD({ ...d, omschrijving: e.target.value })} /></Veld>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        {gewijzigd && (
          <button type="button" className="knop" disabled={!d.naam || d.prijs_cent === null} onClick={() => opslaan.mutate({ id: extra?.id, data: d }, { onSuccess: () => onKlaar?.() })}>
            Opslaan
          </button>
        )}
        <button type="button" className="knop-klein" onClick={() => (extra ? window.confirm(`"${extra.naam}" verwijderen? Gebruik liever "Actief" uitzetten als het al op boekingen staat.`) && verwijderen.mutate(extra.id) : onKlaar?.())}>
          {extra ? "Verwijderen" : "Annuleren"}
        </button>
      </div>
      {(opslaan.error || verwijderen.error) ? <div className="col-span-full"><Fout fout={opslaan.error || verwijderen.error} /></div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tarieven toeristenbelasting
// ---------------------------------------------------------------------------

function TbTarieven() {
  const tarieven = useTbTarieven()
  const [nieuw, setNieuw] = useState(false)
  if (tarieven.isLoading) return <Laden />
  if (tarieven.error) return <Fout fout={tarieven.error} />
  return (
    <Kaart titel="Toeristenbelasting (richtberekening)">
      <p className="mb-4 text-sm text-zacht">
        Alleen voor de controleberekening. Het bedrag uit de simulatie in het portaal is altijd leidend. Pas de parameters aan als de gemeente de tarieven wijzigt.
      </p>
      <div className="flex flex-col gap-3">
        {(tarieven.data ?? []).map((t) => <TariefRij key={t.id} tarief={t} />)}
        {nieuw && <TariefRij onKlaar={() => setNieuw(false)} />}
      </div>
      <button type="button" className="knop-rand mt-4" onClick={() => setNieuw(true)}>Nieuw tarief (vanaf datum)</button>
    </Kaart>
  )
}

function TariefRij({ tarief, onKlaar }: { tarief?: TbTariefRecord; onKlaar?: () => void }) {
  const opslaan = useOpslaan<TbTariefRecord>("tb_tarieven", [sleutels.tbTarieven])
  const [vanaf, setVanaf] = useState(tarief?.geldig_vanaf ?? "")
  const [omschrijving, setOmschrijving] = useState(tarief?.omschrijving ?? "")
  const [pct, setPct] = useState(String((tarief?.percentage_bp ?? 500) / 100).replace(".", ","))
  const [plafond, setPlafond] = useState<Cent | null>(tarief?.plafond_cent ?? 400)
  const [opslagen, setOpslagen] = useState((tarief?.opslagen ?? []).map((o) => ({ naam: o.naam, pct: String(o.bp / 100).replace(".", ",") })))
  const naarBp = (s: string) => Math.round(Number(s.replace(",", ".")) * 100)
  return (
    <div className="flex flex-col gap-3 border border-lijn bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Veld label="Geldig vanaf"><input type="date" value={vanaf} onChange={(e) => setVanaf(e.target.value)} /></Veld>
        <Veld label="Percentage (%)" hint="van de prijs p.p.p.n."><input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Veld>
        <Veld label="Plafond p.p.p.n." hint="vóór opslagen"><BedragVeld waarde={plafond} onChange={setPlafond} /></Veld>
        <Veld label="Omschrijving"><input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} /></Veld>
      </div>
      <div>
        <div className="mb-1 text-sm text-zacht">Opslagen (elk apart afgerond op centen)</div>
        {opslagen.map((o, i) => (
          <div key={i} className="mb-2 grid grid-cols-[2fr_1fr_auto] gap-2">
            <input value={o.naam} aria-label="Naam opslag" onChange={(e) => setOpslagen(opslagen.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)))} />
            <input value={o.pct} aria-label="Percentage opslag" inputMode="decimal" onChange={(e) => setOpslagen(opslagen.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
            <button type="button" className="knop-klein" onClick={() => setOpslagen(opslagen.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="knop-klein" onClick={() => setOpslagen([...opslagen, { naam: "", pct: "" }])}>+ Opslag</button>
      </div>
      {tarief && <div className="text-xs text-zacht">Geldt vanaf {formatLang(tarief.geldig_vanaf)}.</div>}
      {opslaan.error ? <Fout fout={opslaan.error} /> : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="knop"
          disabled={!vanaf || Number.isNaN(naarBp(pct)) || plafond === null}
          onClick={() =>
            opslaan.mutate(
              {
                id: tarief?.id,
                data: {
                  geldig_vanaf: vanaf,
                  omschrijving,
                  percentage_bp: naarBp(pct),
                  plafond_cent: plafond,
                  opslagen: opslagen.filter((o) => o.naam).map((o) => ({ naam: o.naam, bp: naarBp(o.pct) })),
                  volwassen_vanaf_leeftijd: tarief?.volwassen_vanaf_leeftijd ?? 18,
                },
              },
              { onSuccess: () => onKlaar?.() },
            )
          }
        >
          Opslaan
        </button>
        {!tarief && <button type="button" className="knop-klein" onClick={onKlaar}>Annuleren</button>}
      </div>
    </div>
  )
}
