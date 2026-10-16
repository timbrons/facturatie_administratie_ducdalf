import { useState } from "react"
import { pb } from "../lib/pb"
import type { Boeking } from "../lib/types"
import { formatEuro, type Cent } from "../domein/geld"
import { vandaag } from "../domein/datum"
import { BedragVeld, Dialoog, Fout, Melding, Veld } from "./ui"

/** Adres om de factuur van PLD te bekijken (beschermd bestand: met token). */
export async function parkkostenFactuurUrl(b: Boeking): Promise<string> {
  const token = await pb.files.getToken()
  return pb.files.getURL(b, b.parkkosten_factuur, { token })
}

/**
 * Stap "Parkkosten betalen": vastleggen wat er werkelijk aan Parc le Duc is
 * betaald, wanneer, en de factuur van PLD toevoegen.
 */
export function ParkkostenDialoog({ open, boeking: b, onSluiten, onOpgeslagen }: {
  open: boolean
  boeking: Boeking
  onSluiten: () => void
  /** Na opslaan (de aanroeper zet zo nodig de status door) */
  onOpgeslagen: () => Promise<void>
}) {
  const [bedrag, setBedrag] = useState<Cent | null>(b.parkkosten_betaald_op ? b.parkkosten_betaald_cent : b.parkkosten_cent || null)
  const [datum, setDatum] = useState(b.parkkosten_betaald_op || vandaag())
  const [bestand, setBestand] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)

  async function opslaan() {
    if (bedrag === null) return
    setBezig(true)
    setFout(null)
    try {
      const fd = new FormData()
      fd.append("parkkosten_betaald_cent", String(bedrag))
      fd.append("parkkosten_betaald_op", datum)
      if (bestand) fd.append("parkkosten_factuur", bestand)
      await pb.collection("boekingen").update(b.id, fd)
      await onOpgeslagen()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialoog open={open} titel="Parkkosten betalen" onSluiten={onSluiten}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Leg vast wat er werkelijk aan Parc le Duc is betaald en voeg de factuur van PLD toe. Aan de huurder is{" "}
          {formatEuro(b.parkkosten_cent)} aan parkkosten gefactureerd.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Betaald aan PLD"><BedragVeld waarde={bedrag} onChange={setBedrag} /></Veld>
          <Veld label="Datum van betaling"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
          <Veld
            label="Factuur van PLD (PDF of foto)"
            className="sm:col-span-2"
            hint={b.parkkosten_factuur ? "Er is al een factuur toegevoegd; een nieuw bestand vervangt die." : undefined}
          >
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setBestand(e.target.files?.[0] ?? null)} />
          </Veld>
        </div>
        {b.parkkosten_factuur && (
          <button
            type="button"
            className="self-start text-xs underline"
            onClick={async () => {
              const venster = window.open("", "_blank")
              const url = await parkkostenFactuurUrl(b).catch(() => null)
              if (venster && url) venster.location.href = url
              else venster?.close()
            }}
          >
            Huidige factuur van PLD bekijken
          </button>
        )}
        {bedrag !== null && bedrag !== b.parkkosten_cent && (
          <Melding soort="info">
            Verschil met wat de huurder betaalt: {formatEuro(b.parkkosten_cent - bedrag)}.
          </Melding>
        )}
        {fout ? <Fout fout={fout} /> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="knop-rand" onClick={onSluiten}>Annuleren</button>
          <button type="button" className="knop" disabled={bezig || bedrag === null || !datum} onClick={opslaan}>
            {bezig ? "Bezig…" : "Opslaan"}
          </button>
        </div>
      </div>
    </Dialoog>
  )
}
