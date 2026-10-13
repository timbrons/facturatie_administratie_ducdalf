import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useBetalingen, useFacturen } from "../lib/data"
import type { Betaling, Boeking, Instellingen } from "../lib/types"
import { factuurBezwaar, annuleerFactuur, maakConcept, maakDefinitief, markeerVerstuurd, nagemaaktePdf, pdfUrl, pdfVoor, statusNaBetaling, voegOrigineelToe } from "../lib/facturen"
import { synchroniseerDrive } from "../lib/driveSync"
import { SCOPES, zorgVoorGoogle } from "../lib/gmail"
import { totaalBoeking } from "../lib/boeking"
import { formatLang, formatTijdstip, vandaag } from "../domein/datum"
import { formatEuro, type Cent } from "../domein/geld"
import { betaalstatus, geldigeFacturen, openstaand, type Betaalstatus } from "../domein/factuur"
import type { WorkflowStap } from "../domein/workflow"
import { BedragVeld, Dialoog, Fout, Kaart, Label, Melding, Veld } from "./ui"

const STATUSKLEUR: Record<Betaalstatus, "zand" | "goud" | "olijf" | "rood" | "oranje" | "grijs"> = {
  concept: "grijs",
  open: "zand",
  "deels betaald": "oranje",
  betaald: "olijf",
  vervallen: "rood",
  geannuleerd: "grijs",
}

export function StatusFactuur({ status }: { status: Betaalstatus }) {
  return <Label kleur={STATUSKLEUR[status]}>{status}</Label>
}

function useVerversen(boekingId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: sleutels.facturen }),
      qc.invalidateQueries({ queryKey: sleutels.betalingen }),
      qc.invalidateQueries({ queryKey: sleutels.boekingen }),
      qc.invalidateQueries({ queryKey: sleutels.historie(boekingId) }),
    ])
}

async function openPdf(blobOfUrl: Blob | string) {
  const url = typeof blobOfUrl === "string" ? blobOfUrl : URL.createObjectURL(blobOfUrl)
  window.open(url, "_blank", "noopener")
}

export function FacturenKaart({ boeking: b, inst, stappen }: { boeking: Boeking; inst: Instellingen; stappen: WorkflowStap[] }) {
  const facturen = useFacturen()
  const betalingen = useBetalingen()
  const ververs = useVerversen(b.id)
  const [bezig, setBezig] = useState("")
  const [fout, setFout] = useState<unknown>(null)
  const [melding, setMelding] = useState("")

  const lijst = (facturen.data ?? []).filter((f) => f.boeking === b.id)
  const betaald = (betalingen.data ?? []).filter((p) => p.boeking === b.id).reduce((t, p) => t + p.bedrag_cent, 0)
  const nu = vandaag()
  const geldig = lijst.filter((f) => f.soort === "factuur" && f.nummer && betaalstatus(f, lijst, betaald, nu) !== "geannuleerd")
  const heeftConcept = lijst.some((f) => !f.nummer)
  const bezwaar = factuurBezwaar(b, inst)
  const magNieuw = !heeftConcept && geldig.length === 0 && b.status !== "geannuleerd"

  async function actie(naam: string, fn: () => Promise<unknown>) {
    setFout(null)
    setBezig(naam)
    try {
      await fn()
      await ververs()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig("")
    }
  }

  return (
    <Kaart titel="Facturen" className="scroll-mt-24">
      <div id="facturen" />
      {fout ? <div className="mb-3"><Fout fout={fout} /></div> : null}
      {melding && <div className="mb-3"><Melding soort="waarschuwing">{melding}</Melding></div>}
      {lijst.length === 0 && <p className="mb-3 text-sm text-zacht">Nog geen factuur.</p>}
      <ul className="mb-3 flex flex-col gap-3">
        {lijst.map((f) => {
          const status = betaalstatus(f, lijst, betaald, nu)
          return (
            <li key={f.id} className="border border-lijn bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-inkt">
                    {f.soort === "credit" ? "Creditfactuur" : "Factuur"} {f.nummer || "(concept)"}
                  </span>
                  <span className="ml-2 text-sm text-zacht">{formatLang(f.factuurdatum)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-inkt">{formatEuro(f.totaal_cent)}</span>
                  <StatusFactuur status={status} />
                </div>
              </div>
              {f.geimporteerd && <div className="mt-1 text-xs text-zacht">Overgenomen uit de oude administratie.</div>}
              {f.verstuurd_op && <div className="mt-1 text-xs text-zacht">Verstuurd op {formatTijdstip(f.verstuurd_op)}</div>}
              {f.nummer && !f.vergrendeld && (
                <div className="mt-2"><Melding soort="info">Definitief, nog niet verstuurd. Download de PDF, stuur hem naar de huurder en markeer hem daarna als verstuurd.</Melding></div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!f.nummer && (
                  <>
                    <button type="button" className="knop-klein" disabled={!!bezig} onClick={() => actie("voorbeeld", async () => openPdf(await pdfVoor(f, inst)))}>
                      {bezig === "voorbeeld" ? "Bezig…" : "Voorbeeld (PDF)"}
                    </button>
                    <button
                      type="button"
                      className="knop-klein"
                      disabled={!!bezig}
                      onClick={() => {
                        if (window.confirm("Factuur definitief maken? Hij krijgt dan een factuurnummer en kan niet meer worden gewijzigd.")) {
                          // Voor de kopie in Drive; lukt koppelen niet, dan gaat de factuur gewoon door.
                          const google = inst.drive_kopie ? zorgVoorGoogle(inst.afzender_email, SCOPES.drive).catch(() => {}) : Promise.resolve()
                          actie("definitief", async () => {
                            await google
                            const r = await maakDefinitief(f, b, inst)
                            setMelding(r.driveMelding ?? "")
                          })
                        }
                      }}
                    >
                      {bezig === "definitief" ? "Bezig…" : "Definitief maken"}
                    </button>
                  </>
                )}
                {f.pdf && (
                  <button type="button" className="knop-klein" onClick={() => actie("pdf", async () => openPdf(await pdfUrl(f)))}>PDF openen</button>
                )}
                {f.geimporteerd && !f.pdf && (
                  <>
                    <button
                      type="button"
                      className="knop-klein"
                      disabled={!!bezig}
                      title="Weergave op basis van de overgenomen gegevens; niet de oorspronkelijk verstuurde factuur"
                      onClick={() => actie("nagemaakt", async () => openPdf(await nagemaaktePdf(f, b, inst)))}
                    >
                      {bezig === "nagemaakt" ? "Bezig…" : "Bekijken (nagemaakt)"}
                    </button>
                    <label className={`knop-klein cursor-pointer ${bezig ? "pointer-events-none opacity-50" : ""}`}>
                      {bezig === "origineel" ? "Bezig…" : "Originele PDF toevoegen"}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const bestand = e.target.files?.[0]
                          e.target.value = ""
                          if (bestand) actie("origineel", async () => { await voegOrigineelToe(f, bestand); await synchroniseerDrive() })
                        }}
                      />
                    </label>
                  </>
                )}
                {f.drive_link && (
                  <a href={f.drive_link} target="_blank" rel="noopener noreferrer" className="knop-klein">In Drive ↗</a>
                )}
                {inst.drive_kopie && f.nummer && f.pdf && !f.drive_link && (
                  <span className="self-center text-xs text-zacht">Kopie in Drive volgt automatisch</span>
                )}
                {f.nummer && !f.vergrendeld && (
                  <button type="button" className="knop-klein" disabled={!!bezig} onClick={() => actie("verstuurd", () => markeerVerstuurd(f, b, stappen))}>
                    Markeer als verstuurd
                  </button>
                )}
                {f.soort === "factuur" && f.nummer && status !== "geannuleerd" && (
                  <button
                    type="button"
                    className="knop-klein"
                    disabled={!!bezig}
                    onClick={() => {
                      if (window.confirm(`Factuur ${f.nummer} annuleren? Hij blijft bewaard met zijn nummer, maar telt niet meer mee. Spreek een eventuele terugbetaling af met de huurder en registreer die als betaling met een negatief bedrag. Daarna kun je zo nodig een nieuwe factuur maken.`)) {
                        actie("annuleren", () => annuleerFactuur(f))
                      }
                    }}
                  >
                    Factuur annuleren
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {magNieuw && (
        bezwaar ? (
          <Melding soort="waarschuwing">{bezwaar}</Melding>
        ) : (
          <button type="button" className="knop" disabled={!!bezig} onClick={() => actie("concept", () => maakConcept(b, inst))}>
            {lijst.length ? "Nieuwe (gecorrigeerde) factuur" : "Factuur maken"}
          </button>
        )
      )}
      {heeftConcept && <p className="text-xs text-zacht">Een concept volgt automatisch de boeking: bij "Definitief maken" worden prijzen en datums opnieuw overgenomen.</p>}
    </Kaart>
  )
}

export function BetalingenKaart({ boeking: b, stappen, open, onSluiten, onOpen }: {
  boeking: Boeking
  stappen: WorkflowStap[]
  open: boolean
  onSluiten: () => void
  onOpen: () => void
}) {
  const facturen = useFacturen()
  const betalingen = useBetalingen()
  const ververs = useVerversen(b.id)
  const [fout, setFout] = useState<unknown>(null)
  const lijst = (betalingen.data ?? []).filter((p) => p.boeking === b.id)
  const fs = (facturen.data ?? []).filter((f) => f.boeking === b.id)
  const definitief = fs.filter((f) => f.nummer)
  const geldig = geldigeFacturen(definitief)
  const betaald = lijst.reduce((t, p) => t + p.bedrag_cent, 0)
  // Alleen geldige facturen tellen; zijn ze allemaal geannuleerd, dan staat er niets open.
  const gefactureerd = geldig.length ? geldig.reduce((t, f) => t + f.totaal_cent, 0) : definitief.length || b.status === "geannuleerd" ? 0 : null
  const saldo = gefactureerd === null ? totaalBoeking(b) - betaald : openstaand(definitief, betaald)
  const actueel = geldig.filter((f) => f.soort === "factuur").at(-1)

  const voorstel: { bedrag: Cent; soort: Betaling["soort"] } =
    b.betaalwijze === "aanbetaling" && actueel && betaald < actueel.aanbetaling_cent
      ? { bedrag: actueel.aanbetaling_cent - betaald, soort: "aanbetaling" }
      : { bedrag: Math.max(0, saldo), soort: betaald > 0 ? "rest" : "volledig" }

  return (
    <Kaart titel="Betalingen" actie={<button type="button" className="knop-klein" onClick={onOpen}>+ Betaling</button>}>
      <dl className="mb-3 text-sm">
        <div className="flex justify-between"><dt className="text-zacht">{gefactureerd === null ? "Te factureren (indicatie)" : "Gefactureerd"}</dt><dd className="tabular-nums">{formatEuro(gefactureerd ?? totaalBoeking(b))}</dd></div>
        <div className="flex justify-between"><dt className="text-zacht">Ontvangen</dt><dd className="tabular-nums">{formatEuro(betaald)}</dd></div>
        <div className="flex justify-between font-semibold text-inkt">
          <dt>{saldo < 0 ? "Terug te betalen" : "Openstaand"}</dt>
          <dd className="tabular-nums">{formatEuro(Math.abs(saldo))}</dd>
        </div>
      </dl>
      {b.betaalwijze === "aanbetaling" ? (
        <p className="mb-3 text-xs text-zacht">
          {b.aanbetaling_pct}% aanbetaling{actueel ? ` (${formatEuro(actueel.aanbetaling_cent)})` : ""} vóór {b.aanbetaling_vervaldatum ? formatLang(b.aanbetaling_vervaldatum) : "—"}, rest vóór {formatLang(b.rest_vervaldatum)}.
        </p>
      ) : (
        <p className="mb-3 text-xs text-zacht">Volledig bedrag vóór {formatLang(b.rest_vervaldatum)}.</p>
      )}
      {fout ? <div className="mb-3"><Fout fout={fout} /></div> : null}
      {lijst.length > 0 && (
        <ul className="divide-y divide-lijn border-t border-lijn text-sm">
          {lijst.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <div className="text-inkt">{formatLang(p.datum)} · {p.soort}</div>
                {p.opmerking && <div className="text-xs text-zacht">{p.opmerking}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap tabular-nums">{formatEuro(p.bedrag_cent)}</span>
                <button
                  type="button"
                  className="text-xs text-zacht underline"
                  onClick={async () => {
                    if (!window.confirm(`Betaling van ${formatEuro(p.bedrag_cent)} verwijderen?`)) return
                    try {
                      await pb.collection("betalingen").delete(p.id)
                      await ververs()
                    } catch (err) {
                      setFout(err)
                    }
                  }}
                >
                  verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <BetalingDialoog
        open={open}
        voorstel={voorstel}
        onSluiten={onSluiten}
        onOpslaan={async (data) => {
          const nieuw = await pb.collection("betalingen").create<Betaling>({ boeking: b.id, factuur: actueel?.id ?? "", ...data })
          const naar = statusNaBetaling(b, stappen, fs, [...lijst, nieuw])
          if (naar) await pb.collection("boekingen").update(b.id, { status: naar })
          await ververs()
          onSluiten()
        }}
      />
    </Kaart>
  )
}

function BetalingDialoog({ open, voorstel, onSluiten, onOpslaan }: {
  open: boolean
  voorstel: { bedrag: Cent; soort: Betaling["soort"] }
  onSluiten: () => void
  onOpslaan: (data: { datum: string; bedrag_cent: Cent; soort: Betaling["soort"]; opmerking: string }) => Promise<void>
}) {
  const [datum, setDatum] = useState(vandaag())
  const [bedrag, setBedrag] = useState<Cent | null>(null)
  const [soort, setSoort] = useState<Betaling["soort"] | "">("")
  const [opmerking, setOpmerking] = useState("")
  const [fout, setFout] = useState<unknown>(null)
  const [bezig, setBezig] = useState(false)
  const effBedrag = bedrag ?? voorstel.bedrag
  const effSoort = soort || voorstel.soort
  return (
    <Dialoog open={open} titel="Betaling registreren" onSluiten={onSluiten}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Veld label="Datum ontvangen"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></Veld>
        <Veld label="Bedrag"><BedragVeld waarde={effBedrag} onChange={setBedrag} /></Veld>
        <Veld label="Soort">
          <select value={effSoort} onChange={(e) => setSoort(e.target.value as Betaling["soort"])}>
            <option value="aanbetaling">Aanbetaling</option>
            <option value="rest">Restbetaling</option>
            <option value="volledig">Volledig bedrag</option>
            <option value="terugbetaling">Terugbetaling (negatief bedrag)</option>
            <option value="overig">Overig</option>
          </select>
        </Veld>
        <Veld label="Opmerking"><input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} /></Veld>
      </div>
      <p className="mt-2 text-xs text-zacht">Na het opslaan schuift de workflow automatisch door als de aanbetaling of het volledige bedrag binnen is.</p>
      {fout ? <div className="mt-3"><Fout fout={fout} /></div> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="knop-rand" onClick={onSluiten}>Terug</button>
        <button
          type="button"
          className="knop"
          disabled={bezig || !datum || !effBedrag}
          onClick={async () => {
            setBezig(true)
            setFout(null)
            try {
              await onOpslaan({ datum, bedrag_cent: effBedrag, soort: effSoort, opmerking })
              setBedrag(null); setSoort(""); setOpmerking("")
            } catch (err) {
              setFout(err)
            } finally {
              setBezig(false)
            }
          }}
        >
          Betaling opslaan
        </button>
      </div>
    </Dialoog>
  )
}
