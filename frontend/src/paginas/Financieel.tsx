import { useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { pb } from "../lib/pb"
import { sleutels, useBetalingen, useBoekingen, useFacturen, useOpslaan, useTbAangiften } from "../lib/data"
import { boekingNaam, type Boeking, type TbAangifte } from "../lib/types"
import { pdfUrl } from "../lib/facturen"
import { formatLang, jaarVan, maandNaam, vandaag } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import { betaalstatus } from "../domein/factuur"
import { financieelOverzicht, parkkostenOverzicht, tbOverzicht, type FinBoeking } from "../domein/financieel"
import { openParkkostenFactuur } from "../lib/parkkosten"
import { csvBedrag, schrijfCsv } from "../domein/csv"
import { BedragVeld, Fout, Kaart, Laden, Paginakop, Veld } from "../components/ui"
import { StatusFactuur } from "../components/FacturenBetalingen"

type Tab = "overzicht" | "facturen" | "toeristenbelasting" | "parkkosten"

function downloadCsv(naam: string, rijen: (string | number | null | undefined)[][]) {
  const blob = new Blob([schrijfCsv(rijen)], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = naam
  a.click()
  URL.revokeObjectURL(a.href)
}

export function Financieel() {
  const boekingen = useBoekingen()
  const facturen = useFacturen()
  const betalingen = useBetalingen()
  const aangiften = useTbAangiften()
  const [params, setParams] = useSearchParams()
  const jaar = Number(params.get("jaar") || jaarVan(vandaag()))
  const tab = (params.get("tab") as Tab) || "overzicht"
  const zet = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }

  const fin = useMemo(
    () => (boekingen.data ?? []).map<FinBoeking>((b) => ({ ...b, naam: boekingNaam(b) })),
    [boekingen.data],
  )

  if (boekingen.isLoading || facturen.isLoading || betalingen.isLoading || aangiften.isLoading) return <Laden />
  const fout = boekingen.error || facturen.error || betalingen.error || aangiften.error
  if (fout) return <Fout fout={fout} />

  const jaren = [...new Set([...fin.map((b) => jaarVan(b.aankomst)), jaarVan(vandaag())])].sort((a, b) => b - a)

  return (
    <>
      <Paginakop wenkbrauw="Administratie" titel={`Financieel ${jaar}`}>
        <select className="w-28" value={jaar} onChange={(e) => zet("jaar", e.target.value)} aria-label="Jaar">
          {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </Paginakop>
      <div className="mb-6 flex gap-1 border-b border-lijn">
        {([["overzicht", "Overzicht"], ["facturen", "Facturen"], ["toeristenbelasting", "Toeristenbelasting"], ["parkkosten", "Park- en schoonmaakkosten PLD"]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => zet("tab", k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-goud text-inkt" : "border-transparent text-zacht hover:text-inkt"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "overzicht" && <Overzicht jaar={jaar} boekingen={fin} />}
      {tab === "facturen" && <FacturenLijst jaar={jaar} />}
      {tab === "toeristenbelasting" && <Toeristenbelasting jaar={jaar} boekingen={fin} aangiften={aangiften.data ?? []} />}
      {tab === "parkkosten" && <Parkkosten jaar={jaar} boekingen={boekingen.data ?? []} />}
    </>
  )
}

function Overzicht({ jaar, boekingen }: { jaar: number; boekingen: FinBoeking[] }) {
  const facturen = useFacturen().data ?? []
  const betalingen = useBetalingen().data ?? []
  const o = financieelOverzicht(jaar, boekingen, facturen, betalingen)
  const kolommen: [string, (v: typeof o.totaal.verdeling) => Cent][] = [
    ["Huur", (v) => v.huur],
    ["Schoonmaak", (v) => v.schoonmaak],
    ["Parkkosten", (v) => v.parkkosten],
    ["Extra's", (v) => v.extra + v.overig],
    ["Toeristenbel.", (v) => v.toeristenbelasting],
  ]

  function exporteer() {
    downloadCsv(`financieel-${jaar}.csv`, [
      ["Huurder", "Aankomst", "Vertrek", "Facturen", ...kolommen.map(([k]) => k), "Gefactureerd", "Ontvangen", "Openstaand"],
      ...o.rijen.map((r) => [
        r.boeking.naam, r.boeking.aankomst, r.boeking.vertrek, r.facturen.join(" "),
        ...kolommen.map(([, f]) => csvBedrag(f(r.verdeling))), csvBedrag(r.gefactureerd), csvBedrag(r.ontvangen), csvBedrag(r.openstaand),
      ]),
      ["Totaal", "", "", "", ...kolommen.map(([, f]) => csvBedrag(f(o.totaal.verdeling))), csvBedrag(o.totaal.gefactureerd), csvBedrag(o.totaal.ontvangen), csvBedrag(o.totaal.openstaand)],
    ])
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kaart><div className="text-xs text-zacht">Gefactureerd</div><div className="font-serif text-3xl text-inkt">{formatEuro(o.totaal.gefactureerd)}</div></Kaart>
        <Kaart><div className="text-xs text-zacht">Ontvangen</div><div className="font-serif text-3xl text-olijf-donker">{formatEuro(o.totaal.ontvangen)}</div></Kaart>
        <Kaart><div className="text-xs text-zacht">Openstaand</div><div className={`font-serif text-3xl ${o.totaal.openstaand > 0 ? "text-oranje" : "text-inkt"}`}>{formatEuro(o.totaal.openstaand)}</div></Kaart>
      </div>
      <Kaart titel="Per verblijf" actie={<button type="button" className="knop-klein" onClick={exporteer}>Exporteer CSV</button>}>
        <p className="mb-3 text-sm text-zacht">Verblijven met aankomst in {jaar}, op basis van de geldige facturen (geannuleerde tellen niet mee) en geregistreerde betalingen. De toeristenbelasting staat apart voor de afdracht.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-lijn text-xs uppercase tracking-wider text-zacht">
              <tr>
                <th className="py-2 pr-3 font-semibold">Huurder</th>
                <th className="py-2 pr-3 font-semibold">Verblijf</th>
                {kolommen.map(([k]) => <th key={k} className="py-2 pr-3 text-right font-semibold">{k}</th>)}
                <th className="py-2 pr-3 text-right font-semibold">Gefactureerd</th>
                <th className="py-2 pr-3 text-right font-semibold">Ontvangen</th>
                <th className="py-2 text-right font-semibold">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lijn tabular-nums">
              {o.rijen.map((r) => (
                <tr key={r.boeking.id}>
                  <td className="py-2 pr-3"><Link to={`/boekingen/${r.boeking.id}`}>{r.boeking.naam}</Link><div className="text-xs text-zacht">{r.facturen.join(", ")}</div></td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatLang(r.boeking.aankomst)}</td>
                  {kolommen.map(([k, f]) => <td key={k} className="py-2 pr-3 text-right">{formatEuro(f(r.verdeling))}</td>)}
                  <td className="py-2 pr-3 text-right">{formatEuro(r.gefactureerd)}</td>
                  <td className="py-2 pr-3 text-right">{formatEuro(r.ontvangen)}</td>
                  <td className={`py-2 text-right ${r.openstaand > 0 ? "text-oranje" : ""}`}>{formatEuro(r.openstaand)}</td>
                </tr>
              ))}
              {o.rijen.length === 0 && <tr><td colSpan={10} className="py-4 text-zacht">Nog geen facturen of betalingen voor {jaar}.</td></tr>}
            </tbody>
            <tfoot className="border-t-2 border-inkt/50 font-semibold tabular-nums text-inkt">
              <tr>
                <td className="py-2 pr-3" colSpan={2}>Totaal</td>
                {kolommen.map(([k, f]) => <td key={k} className="py-2 pr-3 text-right">{formatEuro(f(o.totaal.verdeling))}</td>)}
                <td className="py-2 pr-3 text-right">{formatEuro(o.totaal.gefactureerd)}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(o.totaal.ontvangen)}</td>
                <td className="py-2 text-right">{formatEuro(o.totaal.openstaand)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Kaart>
    </>
  )
}

function FacturenLijst({ jaar }: { jaar: number }) {
  const facturen = useFacturen().data ?? []
  const betalingen = useBetalingen().data ?? []
  const boekingen = useBoekingen().data ?? []
  const nu = vandaag()
  const lijst = facturen.filter((f) => f.nummer && jaarVan(f.factuurdatum) === jaar).sort((a, b) => a.nummer.localeCompare(b.nummer))
  const concepten = facturen.filter((f) => !f.nummer)
  const naam = (id: string) => { const b = boekingen.find((x) => x.id === id); return b ? boekingNaam(b) : "?" }

  function exporteer() {
    downloadCsv(`facturen-${jaar}.csv`, [
      ["Factuurnummer", "Soort", "Factuurdatum", "Huurder", "Totaal", "Status", "Verstuurd"],
      ...lijst.map((f) => {
        const vanBoeking = facturen.filter((x) => x.boeking === f.boeking)
        const betaald = betalingen.filter((p) => p.boeking === f.boeking).reduce((t, p) => t + p.bedrag_cent, 0)
        return [f.nummer, f.soort, f.factuurdatum, naam(f.boeking), csvBedrag(f.totaal_cent), betaalstatus(f, vanBoeking, betaald, nu), f.verstuurd_op.slice(0, 10)]
      }),
    ])
  }

  return (
    <Kaart titel={`Facturen ${jaar}`} actie={<button type="button" className="knop-klein" onClick={exporteer}>Exporteer CSV</button>}>
      {concepten.length > 0 && <p className="mb-3 text-sm text-oranje">{concepten.length} concept(en) nog niet definitief.</p>}
      <ul className="divide-y divide-lijn">
        {lijst.map((f) => {
          const vanBoeking = facturen.filter((x) => x.boeking === f.boeking)
          const betaald = betalingen.filter((p) => p.boeking === f.boeking).reduce((t, p) => t + p.bedrag_cent, 0)
          return (
            <li key={f.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link to={`/boekingen/${f.boeking}`} className="text-inkt">{f.nummer}</Link>
                <span className="ml-2 text-sm text-zacht">{naam(f.boeking)} · {formatLang(f.factuurdatum)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`tabular-nums ${f.geannuleerd_op ? "text-zacht line-through" : ""}`}>{formatEuro(f.totaal_cent)}</span>
                <StatusFactuur status={betaalstatus(f, vanBoeking, betaald, nu)} />
                {f.pdf && <button type="button" className="knop-klein" onClick={async () => window.open(await pdfUrl(f), "_blank", "noopener")}>PDF</button>}
              </div>
            </li>
          )
        })}
        {lijst.length === 0 && <li className="py-3 text-sm text-zacht">Geen definitieve facturen in {jaar}.</li>}
      </ul>
    </Kaart>
  )
}

function Toeristenbelasting({ jaar, boekingen, aangiften }: { jaar: number; boekingen: FinBoeking[]; aangiften: TbAangifte[] }) {
  const facturen = useFacturen().data ?? []
  const rijen = tbOverzicht(jaar, boekingen, facturen)
  const maanden = aangiften.filter((a) => a.periode.startsWith(`${jaar}-`))

  function exporteer() {
    downloadCsv(`toeristenbelasting-${jaar}.csv`, [
      ["Huurder", "Aankomst", "Vertrek", "Geïnd via factuur", "Aangegeven", "Aangegeven op", "Verschil", "Maand aangifte", "Referentie", "Afgedragen op"],
      ...rijen.map((r) => {
        const m = aangiften.find((a) => a.id === r.boeking.tb_aangifte)
        return [r.boeking.naam, r.boeking.aankomst, r.boeking.vertrek, csvBedrag(r.geind), csvBedrag(r.aangegeven), r.boeking.tb_aangegeven_op, csvBedrag(r.verschil), m?.periode ?? "", m?.referentie ?? "", m?.afgedragen_op ?? ""]
      }),
    ])
  }

  const tot = rijen.reduce((t, r) => ({ geind: t.geind + r.geind, aangegeven: t.aangegeven + (r.aangegeven ?? 0) }), { geind: 0, aangegeven: 0 })

  return (
    <div className="flex flex-col gap-6">
      <Kaart titel="Per verhuur" actie={<button type="button" className="knop-klein" onClick={exporteer}>Exporteer CSV</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-lijn text-xs uppercase tracking-wider text-zacht">
              <tr>
                <th className="py-2 pr-3 font-semibold">Huurder</th>
                <th className="py-2 pr-3 font-semibold">Verblijf</th>
                <th className="py-2 pr-3 text-right font-semibold">Geïnd</th>
                <th className="py-2 pr-3 text-right font-semibold">Aangegeven</th>
                <th className="py-2 text-right font-semibold">Verschil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lijn tabular-nums">
              {rijen.map((r) => (
                <tr key={r.boeking.id}>
                  <td className="py-2 pr-3"><Link to={`/boekingen/${r.boeking.id}`}>{r.boeking.naam}</Link></td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatLang(r.boeking.aankomst)} – {formatLang(r.boeking.vertrek)}</td>
                  <td className="py-2 pr-3 text-right">{formatEuro(r.geind)}</td>
                  <td className="py-2 pr-3 text-right">{r.aangegeven === null ? <span className="text-zacht">nog niet</span> : formatEuro(r.aangegeven)}</td>
                  <td className={`py-2 text-right ${r.verschil ? "text-oranje" : ""}`}>{r.verschil === null ? "" : formatEuro(r.verschil)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-inkt/50 font-semibold tabular-nums text-inkt">
              <tr>
                <td className="py-2 pr-3" colSpan={2}>Totaal</td>
                <td className="py-2 pr-3 text-right">{formatEuro(tot.geind)}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(tot.aangegeven)}</td>
                <td className="py-2 text-right">{formatEuro(tot.aangegeven - tot.geind)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Kaart>

      <Kaart titel="Maandaangiften en afdracht">
        <p className="mb-3 text-sm text-zacht">Per maand: wanneer de aangifte is ingediend en, als jullie apart worden aangeslagen, wanneer en hoeveel is afgedragen.</p>
        {maanden.length === 0 ? (
          <p className="text-sm text-zacht">Nog geen aangiften voor {jaar}. Een aangifte registreer je bij de boeking (stap "Toeristenbelasting aangeven").</p>
        ) : (
          <div className="flex flex-col gap-3">
            {maanden.map((m) => <MaandRij key={m.id} aangifte={m} boekingen={boekingen} />)}
          </div>
        )}
      </Kaart>
    </div>
  )
}

function MaandRij({ aangifte: m, boekingen }: { aangifte: TbAangifte; boekingen: FinBoeking[] }) {
  const opslaan = useOpslaan<TbAangifte>("tb_aangiften", [sleutels.tbAangiften])
  const qc = useQueryClient()
  const [fout, setFout] = useState<unknown>(null)
  const [afgedragenOp, setAfgedragenOp] = useState(m.afgedragen_op)
  const [afgedragen, setAfgedragen] = useState<Cent | null>(m.afgedragen_op ? m.afgedragen_cent : null)
  const [referentie, setReferentie] = useState(m.referentie)
  const gekoppeld = boekingen.filter((b) => b.tb_aangifte === m.id)
  const aangegeven = gekoppeld.reduce((t, b) => t + (b.tb_aangegeven_cent || 0), 0)
  const [j, mnd] = m.periode.split("-").map(Number)
  return (
    <div className="border border-lijn bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium text-inkt">{maandNaam(mnd)} {j}</div>
        <div className="text-sm text-zacht">
          Ingediend {m.ingediend_op ? formatLang(m.ingediend_op) : "—"} · aangegeven {formatEuro(aangegeven)} · {gekoppeld.length} {gekoppeld.length === 1 ? "verblijf" : "verblijven"}
          {m.bewijs?.length ? (
            <>
              {" · "}
              <button type="button" className="underline" onClick={async () => {
                const token = await pb.files.getToken()
                for (const f of m.bewijs) window.open(pb.files.getURL(m, f, { token }), "_blank", "noopener")
              }}>bewijs ({m.bewijs.length})</button>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Veld label="Referentie"><input value={referentie} onChange={(e) => setReferentie(e.target.value)} /></Veld>
        <Veld label="Afgedragen op"><input type="date" value={afgedragenOp} onChange={(e) => setAfgedragenOp(e.target.value)} /></Veld>
        <Veld label="Afgedragen bedrag"><BedragVeld waarde={afgedragen} onChange={setAfgedragen} /></Veld>
        <button
          type="button"
          className="knop"
          disabled={opslaan.isPending}
          onClick={() => opslaan.mutate({ id: m.id, data: { referentie, afgedragen_op: afgedragenOp, afgedragen_cent: afgedragen ?? 0, aangegeven_cent: aangegeven } })}
        >
          Opslaan
        </button>
      </div>
      {afgedragen !== null && afgedragenOp && afgedragen !== aangegeven && (
        <p className="mt-2 text-xs text-oranje">Afgedragen bedrag wijkt {formatEuro(afgedragen - aangegeven)} af van het aangegeven bedrag.</p>
      )}
      {gekoppeld.length === 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zacht">
          Bij deze maand hoort geen verblijf (meer).
          <button
            type="button"
            className="underline"
            onClick={async () => {
              if (!window.confirm(`Maandaangifte ${maandNaam(mnd)} ${j} verwijderen, met de bewijsstukken? Dit kan niet ongedaan worden gemaakt.`)) return
              try {
                await pb.collection("tb_aangiften").delete(m.id)
                await qc.invalidateQueries({ queryKey: sleutels.tbAangiften })
              } catch (err) {
                setFout(err)
              }
            }}
          >
            Verwijderen
          </button>
        </div>
      )}
      {fout ? <div className="mt-2"><Fout fout={fout} /></div> : null}
      {opslaan.error ? <div className="mt-2"><Fout fout={opslaan.error} /></div> : null}
      {opslaan.isSuccess && <p className="mt-2 text-xs text-olijf-donker">Opgeslagen.</p>}
    </div>
  )
}

function Parkkosten({ jaar, boekingen }: { jaar: number; boekingen: Boeking[] }) {
  const lijst = boekingen.map((b) => ({ ...b, naam: boekingNaam(b) }))
  const rijen = parkkostenOverzicht(jaar, lijst)
  const tot = rijen.reduce(
    (t, r) => ({ gefactureerd: t.gefactureerd + r.gefactureerd, betaald: t.betaald + (r.betaald ?? 0) }),
    { gefactureerd: 0, betaald: 0 },
  )
  const open = rijen.filter((r) => r.betaald === null).length

  function exporteer() {
    downloadCsv(`park-en-schoonmaakkosten-pld-${jaar}.csv`, [
      ["Huurder", "Aankomst", "Vertrek", "Gefactureerd aan huurder (parkkosten + schoonmaak)", "Betaald aan PLD", "Betaald op", "Verschil", "Factuur PLD in Drive"],
      ...rijen.map((r) => [
        r.boeking.naam, r.boeking.aankomst, r.boeking.vertrek, csvBedrag(r.gefactureerd), r.betaald === null ? "" : csvBedrag(r.betaald),
        r.boeking.parkkosten_betaald_op, r.verschil === null ? "" : csvBedrag(r.verschil), r.boeking.parkkosten_drive_link,
      ]),
    ])
  }

  return (
    <Kaart titel={`Park- en schoonmaakkosten PLD ${jaar}`} actie={<button type="button" className="knop-klein" onClick={exporteer}>Exporteer CSV</button>}>
      <p className="mb-3 text-sm text-zacht">Gefactureerd = parkkosten + eindschoonmaak; beide rekenen we af via de factuur van PLD.</p>
      {open > 0 && <p className="mb-3 text-sm text-zacht">{open} {open === 1 ? "verblijf" : "verblijven"} nog niet afgerekend met PLD.</p>}
      {rijen.length === 0 ? (
        <p className="text-sm text-zacht">Geen parkkosten in {jaar}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-lijn text-xs uppercase tracking-wider text-zacht">
              <tr>
                <th className="py-2 pr-3 font-semibold">Huurder</th>
                <th className="py-2 pr-3 font-semibold">Verblijf</th>
                <th className="py-2 pr-3 text-right font-semibold">Gefactureerd</th>
                <th className="py-2 pr-3 text-right font-semibold">Betaald aan PLD</th>
                <th className="py-2 pr-3 text-right font-semibold">Verschil</th>
                <th className="py-2 font-semibold">Factuur PLD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lijn tabular-nums">
              {rijen.map((r) => (
                <tr key={r.boeking.id}>
                  <td className="py-2 pr-3"><Link to={`/boekingen/${r.boeking.id}`}>{r.boeking.naam}</Link></td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatLang(r.boeking.aankomst)} – {formatLang(r.boeking.vertrek)}</td>
                  <td className="py-2 pr-3 text-right">{formatEuro(r.gefactureerd)}</td>
                  <td className="py-2 pr-3 text-right">
                    {r.betaald === null ? <span className="text-zacht">nog niet</span> : (
                      <>
                        {formatEuro(r.betaald)}
                        <div className="text-xs text-zacht">{formatLang(r.boeking.parkkosten_betaald_op)}</div>
                      </>
                    )}
                  </td>
                  <td className={`py-2 pr-3 text-right ${r.verschil ? "text-oranje" : ""}`}>{r.verschil === null ? "" : formatEuro(r.verschil)}</td>
                  <td className="py-2">
                    <span className="flex flex-wrap gap-2">
                      {r.boeking.parkkosten_factuur && (
                        <button type="button" className="knop-klein" onClick={() => openParkkostenFactuur(r.boeking)}>Bekijken</button>
                      )}
                      {r.boeking.parkkosten_drive_link && (
                        <a href={r.boeking.parkkosten_drive_link} target="_blank" rel="noopener noreferrer" className="knop-klein">In Drive ↗</a>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-inkt/50 font-semibold tabular-nums text-inkt">
              <tr>
                <td className="py-2 pr-3" colSpan={2}>Totaal</td>
                <td className="py-2 pr-3 text-right">{formatEuro(tot.gefactureerd)}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(tot.betaald)}</td>
                <td className="py-2 pr-3" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Kaart>
  )
}
