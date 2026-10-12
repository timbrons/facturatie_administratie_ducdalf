import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { useFacturen, useHuurders, useInstellingen } from "../lib/data"
import type { Huurder } from "../lib/types"
import { leesCsv } from "../domein/csv"
import { importPlan, importRegels, leesAdministratie, type ImportRij } from "../domein/importeren"
import { formatKort, formatLang, vandaag } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import { Fout, Kaart, Laden, Melding, Paginakop } from "../components/ui"

// Import van de bestaande administratie (Google Sheet → Bestand → Downloaden →
// Door komma's gescheiden waarden). Eerst een voorbeeld, daarna pas opslaan.

export function Importeren() {
  const inst = useInstellingen()
  const facturen = useFacturen()
  const huurders = useHuurders()
  const qc = useQueryClient()
  const [rijen, setRijen] = useState<ImportRij[] | null>(null)
  const [bestandsnaam, setBestandsnaam] = useState("")
  const [verledenAfronden, setVerledenAfronden] = useState(true)
  const [voortgang, setVoortgang] = useState<string[]>([])
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const nu = vandaag()

  const bestaand = useMemo(() => new Set((facturen.data ?? []).map((f) => f.nummer).filter(Boolean)), [facturen.data])

  if (inst.isLoading || facturen.isLoading || huurders.isLoading) return <Laden />
  if (inst.error) return <Fout fout={inst.error} />
  const i = inst.data!
  const opties = { verledenAfronden, aanbetalingPct: i.aanbetaling_pct, termijnMaanden: i.aanbetaling_termijn_maanden, restWeken: i.rest_weken_voor_aankomst }

  const teImporteren = (rijen ?? []).filter((r) => r.fouten.length === 0 && !bestaand.has(r.factuurnummer))

  async function lees(file: File | undefined) {
    if (!file) return
    setKlaar(false)
    setVoortgang([])
    setFout(null)
    setBestandsnaam(file.name)
    try {
      const tekst = await file.text()
      setRijen(leesAdministratie(leesCsv(tekst), nu))
    } catch (err) {
      setFout(err)
    }
  }

  async function importeer() {
    setBezig(true)
    setFout(null)
    const log: string[] = []
    const bekend = new Map<string, Huurder>()
    for (const h of huurders.data ?? []) if (h.email) bekend.set(h.email.toLowerCase(), h)
    try {
      for (const r of teImporteren) {
        const plan = importPlan(r, nu, opties)
        let huurder = r.email ? bekend.get(r.email.toLowerCase()) : undefined
        if (!huurder) {
          huurder = await pb.collection("huurders").create<Huurder>({
            voornaam: r.voornaam, achternaam: r.achternaam, email: r.email, land: "Nederland", taal: "nl",
            notities: "Overgenomen uit de oude administratie.",
          })
          if (r.email) bekend.set(r.email.toLowerCase(), huurder)
        }
        const extras = [
          r.linnen1 ? { naam: "Linnenpakket 1 persoon", aantal: r.linnen1, prijs_cent: 1600, eenheid: "per_stuk" } : null,
          r.linnen2 ? { naam: "Linnenpakket 2 personen", aantal: r.linnen2, prijs_cent: 2500, eenheid: "per_stuk" } : null,
        ].filter(Boolean)
        const boeking = await pb.collection("boekingen").create({
          huurder: huurder.id,
          aankomst: r.aankomst,
          vertrek: r.vertrek,
          volwassenen: r.volwassenen,
          kinderen: r.kinderen,
          status: plan.status,
          taal: "nl",
          bron: "",
          betaalwijze: plan.betaalwijze,
          aanbetaling_pct: plan.betaalwijze === "aanbetaling" ? i.aanbetaling_pct : 0,
          huur_cent: r.huurCent,
          huur_berekend_cent: r.huurCent,
          huur_handmatig: true,
          parkkosten_cent: r.parkkostenCent,
          schoonmaak_cent: r.schoonmaakCent,
          extras,
          tb_berekend_cent: r.tbCent,
          tb_portaal_cent: r.tbCent,
          tb_portaal_op: `${plan.factuurdatum} 12:00:00.000Z`,
          aanbetaling_vervaldatum: plan.aanbetalingVervaldatum ?? "",
          rest_vervaldatum: plan.restVervaldatum,
          tb_aangegeven_cent: plan.afgerond ? r.tbCent : 0,
          tb_aangegeven_op: plan.afgerond ? r.vertrek : "",
          tb_definitief_volwassenen: plan.afgerond ? r.volwassenen : 0,
          tb_definitief_kinderen: plan.afgerond ? r.kinderen : 0,
          notities: [r.opmerkingen, `Geïmporteerd uit ${bestandsnaam} (regel ${r.regel}).`].filter(Boolean).join("\n"),
          geimporteerd: true,
        })
        const regels = importRegels(r)
        const factuur = await pb.collection("facturen").create({
          boeking: boeking.id,
          nummer: r.factuurnummer,
          soort: "factuur",
          factuurdatum: plan.factuurdatum,
          regels,
          totaal_cent: r.totaalCent,
          aanbetaling_cent: plan.aanbetalingCent,
          aanbetaling_vervaldatum: plan.aanbetalingVervaldatum ?? "",
          rest_vervaldatum: plan.restVervaldatum,
          gegevens: {
            huurder: { naam: r.naam, adres: "", postcodePlaats: "" },
            afzender: { naam: i.afzender_naam, adresregels: i.afzender_adres.split(/\r?\n/).filter(Boolean), telefoon: i.afzender_telefoon, email: i.afzender_email },
            accommodatie: i.accommodatie_naam,
            bank: { tnv: i.bank_tnv, iban: i.bank_iban },
            aankomst: r.aankomst,
            vertrek: r.vertrek,
            betaaltekst: "",
          },
          geimporteerd: true,
        })
        for (const p of plan.betalingen) {
          await pb.collection("betalingen").create({
            boeking: boeking.id, factuur: factuur.id, datum: p.datum, bedrag_cent: p.bedragCent, soort: p.soort,
            opmerking: "Overgenomen uit de oude administratie (datum geschat).", geimporteerd: true,
          })
        }
        log.push(`${r.factuurnummer} – ${r.naam}: geïmporteerd`)
        setVoortgang([...log])
      }
      setKlaar(true)
      await qc.invalidateQueries()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <Paginakop wenkbrauw="Beheer" titel="Bestaande administratie importeren">
        <Link to="/instellingen" className="knop-rand">Terug</Link>
      </Paginakop>
      <div className="flex flex-col gap-6">
        <Kaart titel="1. Bestand kiezen">
          <p className="mb-3 text-sm">
            Open de Google Sheet en kies <strong>Bestand → Downloaden → Door komma's gescheiden waarden (.csv)</strong>. Kies dat bestand hieronder.
            Er wordt nog niets opgeslagen.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => lees(e.target.files?.[0])} />
          <p className="mt-3 text-xs text-zacht">
            Verwachte kolommen: Factuurnr, Naam, E-mail, Aankomstdatum, Vertrekdatum, Personen, Volwassenen, Prijs per nacht, Linnenpakket 1/2 personen,
            Kosten linnenpakketten, Parkkosten, Schoonmaakkosten, Toeristenbelasting, Totaalprijs, Opmerkingen, Betaalstatus.
          </p>
        </Kaart>

        {fout ? <Fout fout={fout} /> : null}

        {rijen && (
          <Kaart titel="2. Voorbeeld controleren">
            <label className="mb-4 flex items-center gap-2 text-inkt">
              <input type="checkbox" checked={verledenAfronden} onChange={(e) => setVerledenAfronden(e.target.checked)} />
              Afgelopen, betaalde verblijven als afgerond markeren (aangifte toeristenbelasting al gedaan)
            </label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="border-b border-lijn text-xs uppercase tracking-wider text-zacht">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Factuur</th>
                    <th className="py-2 pr-3 font-semibold">Huurder</th>
                    <th className="py-2 pr-3 font-semibold">Verblijf</th>
                    <th className="py-2 pr-3 font-semibold">Pers.</th>
                    <th className="py-2 pr-3 text-right font-semibold">Totaal</th>
                    <th className="py-2 pr-3 font-semibold">Betaald</th>
                    <th className="py-2 pr-3 font-semibold">Wordt</th>
                    <th className="py-2 font-semibold">Opmerkingen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lijn">
                  {rijen.map((r) => {
                    const dubbel = bestaand.has(r.factuurnummer)
                    const plan = r.fouten.length ? null : importPlan(r, nu, opties)
                    return (
                      <tr key={r.regel} className={r.fouten.length ? "bg-rood-zacht" : dubbel ? "bg-lijn/40 text-zacht" : ""}>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.factuurnummer || "?"}</td>
                        <td className="py-2 pr-3">{r.naam}<div className="text-xs text-zacht">{r.email}</div></td>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatKort(r.aankomst)} – {formatKort(r.vertrek)}<div className="text-xs text-zacht">{r.nachten} nachten</div></td>
                        <td className="py-2 pr-3">{r.volwassenen}{r.kinderen ? ` + ${r.kinderen}` : ""}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatEuro(r.totaalCent)}</td>
                        <td className="py-2 pr-3">{r.betaalstatus}</td>
                        <td className="py-2 pr-3">{dubbel ? "bestaat al – overslaan" : plan ? plan.status.replace(/_/g, " ") : "—"}</td>
                        <td className="py-2 text-xs">
                          {[...r.fouten.map((f) => `✖ ${f}`), ...r.waarschuwingen.map((w) => `⚠ ${w}`)].map((t, j) => <div key={j}>{t}</div>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Melding soort="info">
                {teImporteren.length} regel(s) worden geïmporteerd als huurder, boeking, (vergrendelde) factuur met het oude nummer en eventuele betaling.
                De factuurnummering schuift automatisch door tot het hoogste nummer. Regels met een fout of een bestaand factuurnummer worden overgeslagen.
                Datums van betalingen zijn niet bekend en worden geschat.
              </Melding>
              {!klaar && (
                <div>
                  <button type="button" className="knop" disabled={bezig || teImporteren.length === 0} onClick={importeer}>
                    {bezig ? "Bezig met importeren…" : `${teImporteren.length} regel(s) importeren`}
                  </button>
                </div>
              )}
              {voortgang.length > 0 && (
                <ul className="text-sm">{voortgang.map((v, j) => <li key={j}>✓ {v}</li>)}</ul>
              )}
              {klaar && <Melding soort="succes">Import klaar op {formatLang(nu)}. Controleer de boekingen en vul ontbrekende adresgegevens aan bij de huurders.</Melding>}
            </div>
          </Kaart>
        )}
      </div>
    </>
  )
}
