import { useEffect, useState } from "react"
import { pb } from "../lib/pb"
import type { Boeking, Instellingen, TbTariefRecord } from "../lib/types"
import { aantalNachten, tbRichtbedrag } from "../lib/boeking"
import { tbPeriode } from "../domein/actielijst"
import { formatKort, formatLang, vandaag } from "../domein/datum"
import { formatBedrag, formatEuro, type Cent } from "../domein/geld"
import type { TbBerekening } from "../domein/toeristenbelasting"
import { driveBeschikbaar, zetInDrive } from "../lib/drive"
import { SCOPES, zorgVoorGoogle } from "../lib/gmail"
import { tbMap, veiligeNaam } from "../domein/bestandsnamen"
import { huurderNaam } from "../lib/types"
import { BedragVeld, Dialoog, Fout, KopieerKnop, Melding, Veld } from "./ui"

// De berekening en de aangifte doen we altijd zelf in het portaal van
// Grand Pic Saint-Loup. Deze schermen zetten alleen de gegevens klaar, openen
// het portaal en leggen de uitkomst vast. Er is géén koppeling met het portaal.

function Invulhulp({ boeking, volwassenen, kinderen }: { boeking: Boeking; volwassenen: number; kinderen: number }) {
  const nachten = aantalNachten(boeking)
  const verblijf = boeking.huur_cent + boeking.parkkosten_cent
  const personen = volwassenen + kinderen
  const rijen: [string, string][] = [
    ["Aankomst", formatKort(boeking.aankomst)],
    ["Vertrek", formatKort(boeking.vertrek)],
    ["Aantal nachten", String(nachten)],
    ["Volwassenen (belastingplichtig)", String(volwassenen)],
    ["Minderjarigen (vrijgesteld)", String(kinderen)],
    ["Huurprijs totaal (incl. parkkosten)", formatBedrag(verblijf)],
    ["Huurprijs per nacht", nachten ? formatBedrag(Math.round(verblijf / nachten)) : ""],
    ["Prijs per persoon per nacht", nachten && personen ? formatBedrag(Math.round(verblijf / nachten / personen)) : ""],
  ]
  return (
    <table className="mb-4 w-full text-sm">
      <tbody className="divide-y divide-lijn">
        {rijen.map(([label, waarde]) => (
          <tr key={label}>
            <td className="py-2 pr-2 text-zacht">{label}</td>
            <td className="py-2 pr-2 font-medium tabular-nums text-inkt">{waarde}</td>
            <td className="py-2 text-right">{waarde && <KopieerKnop waarde={waarde} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PortaalKnop({ url }: { url: string }) {
  return (
    <a href={url || "https://grandpicsaintloup.taxesejour.fr"} target="_blank" rel="noopener noreferrer" className="knop-rand mb-4 w-full">
      Open portaal ↗
    </a>
  )
}

export function TbBerekenDialoog({
  open, boeking, inst, richt, onSluiten, onOpslaan,
}: {
  open: boolean
  boeking: Boeking
  inst: Instellingen
  richt: TbBerekening | null
  onSluiten: () => void
  onOpslaan: (cent: Cent) => Promise<void>
}) {
  const [bedrag, setBedrag] = useState<Cent | null>(boeking.tb_portaal_op ? boeking.tb_portaal_cent : null)
  const [bezig, setBezig] = useState(false)
  return (
    <Dialoog open={open} titel="Toeristenbelasting berekenen" onSluiten={onSluiten}>
      <p className="mb-3 text-sm">
        Log in op het portaal, vul de huurperiode in als simulatie en neem het berekende bedrag hieronder over. Dat bedrag komt op de factuur.
      </p>
      <Invulhulp boeking={boeking} volwassenen={boeking.volwassenen} kinderen={boeking.kinderen} />
      <PortaalKnop url={inst.tb_portaal_url} />
      <Veld label="Bedrag volgens het portaal">
        <BedragVeld waarde={bedrag} onChange={setBedrag} />
      </Veld>
      {richt && (
        <p className="mt-2 text-xs text-zacht">
          Richtberekening: {formatEuro(richt.tariefPerPersoonPerNachtCent)} p.p.p.n. × {boeking.volwassenen} × {aantalNachten(boeking)} = {formatEuro(richt.totaalCent)}
          {richt.afgetopt ? " (afgetopt op het plafond)" : ""}
        </p>
      )}
      {bedrag !== null && richt && bedrag !== richt.totaalCent && (
        <div className="mt-3">
          <Melding soort="waarschuwing">
            Wijkt {formatEuro(Math.abs(bedrag - richt.totaalCent))} af van de richtberekening. Controleer de invoer in het portaal; het portaalbedrag gaat voor.
          </Melding>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="knop-rand" onClick={onSluiten}>Terug</button>
        <button
          type="button"
          className="knop"
          disabled={bedrag === null || bezig}
          onClick={async () => {
            setBezig(true)
            await onOpslaan(bedrag!)
            setBezig(false)
          }}
        >
          Bedrag vastleggen
        </button>
      </div>
    </Dialoog>
  )
}

interface MaandAangifte {
  id: string
  periode: string
  ingediend_op: string
  referentie: string
  bewijs: string[]
}

export function TbAangifteDialoog({
  open, boeking, inst, tarieven, onSluiten, onOpgeslagen,
}: {
  open: boolean
  boeking: Boeking
  inst: Instellingen
  tarieven: TbTariefRecord[]
  onSluiten: () => void
  onOpgeslagen: () => Promise<void>
}) {
  const periode = tbPeriode(boeking.vertrek)
  const [volwassenen, setVolwassenen] = useState(boeking.tb_definitief_volwassenen || boeking.volwassenen)
  const [kinderen, setKinderen] = useState(boeking.tb_aangegeven_op ? boeking.tb_definitief_kinderen : boeking.kinderen)
  const [bedrag, setBedrag] = useState<Cent | null>(boeking.tb_aangegeven_op ? boeking.tb_aangegeven_cent : null)
  const [datum, setDatum] = useState(boeking.tb_aangegeven_op || vandaag())
  const [referentie, setReferentie] = useState("")
  const [bestanden, setBestanden] = useState<File[]>([])
  const [maand, setMaand] = useState<MaandAangifte | null>(null)
  const [fout, setFout] = useState<unknown>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    if (!open) return
    pb.collection("tb_aangiften")
      .getFirstListItem<MaandAangifte>(pb.filter("periode = {:p}", { p: periode }))
      .then((m) => { setMaand(m); setReferentie(m.referentie) })
      .catch(() => setMaand(null))
  }, [open, periode])

  const richt = tbRichtbedrag(boeking, tarieven, { volwassenen, kinderen })
  const gefactureerd = boeking.tb_portaal_op ? boeking.tb_portaal_cent : null
  const vertrokken = boeking.vertrek <= vandaag()

  async function opslaan() {
    if (bedrag === null) return
    // Voor de kopie van de bewijsstukken in Drive (binnen de klik; mag mislukken).
    const google = inst.drive_kopie && bestanden.length > 0 ? zorgVoorGoogle(inst.afzender_email, SCOPES.drive).catch(() => {}) : Promise.resolve()
    setBezig(true)
    setFout(null)
    try {
      await google
      const fd = new FormData()
      fd.append("periode", periode)
      if (!maand?.ingediend_op) fd.append("ingediend_op", datum)
      if (referentie) fd.append("referentie", referentie)
      for (const f of bestanden) fd.append("bewijs+", f)
      const m = maand
        ? await pb.collection("tb_aangiften").update<MaandAangifte>(maand.id, fd)
        : await pb.collection("tb_aangiften").create<MaandAangifte>(fd)
      await pb.collection("boekingen").update(boeking.id, {
        tb_aangifte: m.id,
        tb_definitief_volwassenen: volwassenen,
        tb_definitief_kinderen: kinderen,
        tb_aangegeven_cent: bedrag,
        tb_aangegeven_op: datum,
      })
      // Kopie van de bewijsstukken in Google Drive (mag mislukken; het origineel staat in de database).
      if (inst.drive_kopie && driveBeschikbaar()) {
        for (const f of bestanden) {
          try {
            await zetInDrive(tbMap(inst.drive_map, periode), veiligeNaam(`${periode} ${huurderNaam(boeking.expand?.huurder)} - ${f.name}`), f, f.type || "application/octet-stream")
          } catch {
            // Niet blokkerend.
          }
        }
      }
      await onOpgeslagen()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialoog open={open} titel="Aangifte toeristenbelasting" onSluiten={onSluiten}>
      <p className="mb-3 text-sm">
        Aangifte over <strong>{periode}</strong> (verblijf {formatLang(boeking.aankomst)} – {formatLang(boeking.vertrek)}), uiterlijk de {inst.tb_aangifte_dag}e van de maand erna.
        Controleer of het aantal personen nog klopt.
      </p>
      {!vertrokken && <div className="mb-3"><Melding soort="waarschuwing">De huurder is nog niet vertrokken.</Melding></div>}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Veld label="Volwassenen (definitief)"><input type="number" min={0} value={volwassenen} onChange={(e) => setVolwassenen(Number(e.target.value))} /></Veld>
        <Veld label="Minderjarigen (definitief)"><input type="number" min={0} value={kinderen} onChange={(e) => setKinderen(Number(e.target.value))} /></Veld>
      </div>
      <Invulhulp boeking={boeking} volwassenen={volwassenen} kinderen={kinderen} />
      <PortaalKnop url={inst.tb_portaal_url} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Aangegeven bedrag"><BedragVeld waarde={bedrag} onChange={setBedrag} /></Veld>
        <Veld label="Datum van indiening"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
        <Veld label="Referentie / aangiftenummer (maand)" className="sm:col-span-2"><input value={referentie} onChange={(e) => setReferentie(e.target.value)} /></Veld>
        <Veld label="Bewijsstuk (PDF of screenshot)" className="sm:col-span-2" hint={maand?.bewijs?.length ? `Al ${maand.bewijs.length} bestand(en) bij deze maand.` : undefined}>
          <input type="file" accept="application/pdf,image/*" multiple onChange={(e) => setBestanden([...(e.target.files ?? [])])} />
        </Veld>
      </div>
      {richt && <p className="mt-2 text-xs text-zacht">Richtberekening met deze aantallen: {formatEuro(richt.totaalCent)}.</p>}
      {bedrag !== null && gefactureerd !== null && bedrag !== gefactureerd && (
        <div className="mt-3">
          <Melding soort="waarschuwing">
            Het aangegeven bedrag ({formatEuro(bedrag)}) wijkt af van wat de huurder op de factuur betaalde ({formatEuro(gefactureerd)}): verschil {formatEuro(bedrag - gefactureerd)}.
          </Melding>
        </div>
      )}
      {fout ? <div className="mt-3"><Fout fout={fout} /></div> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="knop-rand" onClick={onSluiten}>Terug</button>
        <button type="button" className="knop" disabled={bedrag === null || bezig || !datum} onClick={opslaan}>Aangifte vastleggen</button>
      </div>
    </Dialoog>
  )
}
