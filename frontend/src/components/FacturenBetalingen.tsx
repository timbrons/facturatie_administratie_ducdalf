import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { pb } from "../lib/pb"
import { sleutels, useBetalingen, useFacturen } from "../lib/data"
import type { Betaling, Boeking, Factuur, Instellingen } from "../lib/types"
import type { Factuurregel } from "../domein/factuur"
import { factuurBezwaar, annuleerFactuur, herstelConcept, pasConceptAan, standaardInhoud, maakConcept, maakDefinitief, markeerVerstuurd, nagemaaktePdf, pdfUrl, pdfVoor, statusNaBetaling, voegOrigineelToe } from "../lib/facturen"
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
  const [aanpassen, setAanpassen] = useState<Factuur | null>(null)

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
                    {f.soort === "factuur" && (
                      <button type="button" className="knop-klein" disabled={!!bezig} onClick={() => setAanpassen(f)}>Aanpassen</button>
                    )}
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
      {heeftConcept && (
        <p className="text-xs text-zacht">
          {lijst.some((f) => !f.nummer && f.aangepast)
            ? "Dit concept is met de hand aangepast: de regels, het adres en een zelf ingevulde betaaltekst blijven zoals ze zijn. Bij \"Definitief maken\" worden alleen de factuurdatum en de betaaltermijnen bijgewerkt."
            : "Een concept volgt automatisch de boeking: bij \"Definitief maken\" worden prijzen en datums opnieuw overgenomen. Met \"Aanpassen\" wijzig je regels, adres of betaaltekst."}
        </p>
      )}
      {aanpassen && <FactuurAanpassenDialoog factuur={aanpassen} boeking={b} inst={inst} onSluiten={() => setAanpassen(null)} />}
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

/**
 * Stap "Factuur versturen" vanaf de knop bij de huidige status: factuur maken
 * (concept → definitief, met PDF) en daarna meteen de mail opstellen. Een
 * bestaand concept wordt gebruikt; de mail gaat pas na een klik op Versturen.
 */
export function FactuurVersturenDialoog({ open, boeking: b, inst, viaMail, onSluiten, onKlaar }: {
  open: boolean
  boeking: Boeking
  inst: Instellingen
  /** Mailen via Gmail kan: na het maken meteen de mail opstellen */
  viaMail: boolean
  onSluiten: () => void
  /** De factuur is definitief (met PDF) */
  onKlaar: () => void
}) {
  const facturen = useFacturen()
  const ververs = useVerversen(b.id)
  const [bezig, setBezig] = useState("")
  const [fout, setFout] = useState<unknown>(null)
  const [melding, setMelding] = useState("")
  const lijst = (facturen.data ?? []).filter((f) => f.boeking === b.id)
  const concept = lijst.find((f) => f.soort === "factuur" && !f.nummer) ?? null
  const bezwaar = factuurBezwaar(b, inst)
  const [aanpassen, setAanpassen] = useState<Factuur | null>(null)
  const totaal = concept?.aangepast ? concept.totaal_cent : totaalBoeking(b)

  async function conceptOfNieuw() {
    return concept ?? (await maakConcept(b, inst))
  }

  async function stap(naam: string, fn: () => Promise<void>) {
    setFout(null)
    setBezig(naam)
    try {
      await fn()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig("")
    }
  }

  return (
    <Dialoog open={open} titel="Factuur versturen" onSluiten={onSluiten}>
      <div className="flex flex-col gap-3 text-sm">
        {bezwaar ? (
          <Melding soort="waarschuwing">{bezwaar}</Melding>
        ) : (
          <>
            <p>
              {concept?.aangepast ? "De app maakt de factuur zoals je hem hebt aangepast" : "De app maakt de factuur op basis van de boeking"} (totaal {formatEuro(totaal)})
              {viaMail ? " en opent daarna de mail met de factuur als bijlage. Je ziet de mail eerst, versturen gaat pas na jouw klik." : "."}
            </p>
            <p className="text-xs text-zacht">
              Bij "Factuur maken" krijgt de factuur een factuurnummer en kan hij niet meer worden gewijzigd. Wil je eerst kijken, open
              dan het voorbeeld. Met "Aanpassen" wijzig je regels, bedragen, het adres of de betaaltekst.
            </p>
          </>
        )}
        {melding && <Melding soort="waarschuwing">{melding}</Melding>}
        {fout ? <Fout fout={fout} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="knop-rand" onClick={onSluiten}>Annuleren</button>
          {!bezwaar && (
            <>
              <button
                type="button"
                className="knop-rand"
                disabled={!!bezig}
                onClick={() => stap("aanpassen", async () => {
                  const f = await conceptOfNieuw()
                  await ververs()
                  setAanpassen(f)
                })}
              >
                {bezig === "aanpassen" ? "Bezig…" : "Aanpassen"}
              </button>
              <button
                type="button"
                className="knop-rand"
                disabled={!!bezig}
                onClick={() => stap("voorbeeld", async () => {
                  const f = await conceptOfNieuw()
                  await ververs()
                  await openPdf(await pdfVoor(f, inst))
                })}
              >
                {bezig === "voorbeeld" ? "Bezig…" : "Voorbeeld (PDF)"}
              </button>
              <button
                type="button"
                className="knop"
                disabled={!!bezig}
                onClick={() => {
                  // Voor de kopie in Drive; lukt koppelen niet, dan gaat de factuur gewoon door.
                  const google = inst.drive_kopie ? zorgVoorGoogle(inst.afzender_email, SCOPES.drive).catch(() => {}) : Promise.resolve()
                  stap("maken", async () => {
                    await google
                    const r = await maakDefinitief(await conceptOfNieuw(), b, inst)
                    await ververs()
                    if (r.driveMelding) setMelding(r.driveMelding)
                    onKlaar()
                  })
                }}
              >
                {bezig === "maken" ? "Bezig…" : viaMail ? "Factuur maken en mail opstellen" : "Factuur maken"}
              </button>
            </>
          )}
        </div>
      </div>
      {aanpassen && <FactuurAanpassenDialoog factuur={aanpassen} boeking={b} inst={inst} onSluiten={() => setAanpassen(null)} />}
    </Dialoog>
  )
}

/**
 * Concept-factuur met de hand aanpassen: regels (omschrijving, nachten,
 * personen, bedrag), regels toevoegen of weghalen, het adres op de factuur en
 * de betaaltekst. Daarna volgt het concept de boeking niet meer automatisch.
 */
export function FactuurAanpassenDialoog({ factuur: f, boeking: b, inst, onSluiten }: {
  factuur: Factuur
  boeking: Boeking
  inst: Instellingen
  onSluiten: () => void
}) {
  const ververs = useVerversen(b.id)
  const start = f.regels && f.gegevens ? { regels: f.regels, gegevens: f.gegevens } : standaardInhoud(b, inst)
  const [regels, setRegels] = useState<Factuurregel[]>(start.regels ?? [])
  const [huurder, setHuurder] = useState(start.gegevens!.huurder)
  const [eigenTekst, setEigenTekst] = useState<string | null>(start.gegevens!.betaaltekstHandmatig ? start.gegevens!.betaaltekst : null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)

  const automatisch = standaardInhoud(b, inst, regels).gegevens.betaaltekst
  const totaal = regels.reduce((t, r) => t + r.bedrag_cent, 0)
  const zet = (i: number, w: Partial<Factuurregel>) => setRegels((oud) => oud.map((r, j) => (j === i ? { ...r, ...w } : r)))
  const getal = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s)) || 0))
  const geldig = regels.length > 0 && regels.every((r) => r.omschrijving.trim()) && totaal > 0

  async function bewaar(fn: () => Promise<unknown>) {
    setBezig(true)
    setFout(null)
    try {
      await fn()
      await ververs()
      onSluiten()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialoog open titel="Factuur aanpassen" onSluiten={onSluiten}>
      <div className="flex flex-col gap-4 text-sm">
        <section>
          <div className="wenkbrauw mb-2">Regels</div>
          <div className="flex flex-col gap-2">
            {regels.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_7rem_auto] items-end gap-2">
                <Veld label={i === 0 ? "Omschrijving" : ""}>
                  <input value={r.omschrijving} onChange={(e) => zet(i, { omschrijving: e.target.value })} />
                </Veld>
                <Veld label={i === 0 ? "Nachten" : ""}>
                  <input inputMode="numeric" value={r.nachten ?? ""} onChange={(e) => zet(i, { nachten: getal(e.target.value) })} />
                </Veld>
                <Veld label={i === 0 ? "Pers." : ""}>
                  <input inputMode="numeric" value={r.personen ?? ""} onChange={(e) => zet(i, { personen: getal(e.target.value) })} />
                </Veld>
                <Veld label={i === 0 ? "Bedrag" : ""}>
                  <BedragVeld waarde={r.bedrag_cent} onChange={(c) => zet(i, { bedrag_cent: c ?? 0 })} />
                </Veld>
                <button type="button" className="knop-klein mb-1" title="Regel weghalen" onClick={() => setRegels((oud) => oud.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              className="knop-klein"
              onClick={() => setRegels((oud) => [...oud, { soort: "overig", omschrijving: "", nachten: null, personen: null, bedrag_cent: 0 }])}
            >
              + Regel toevoegen
            </button>
            <span className="font-semibold text-inkt">Totaal {formatEuro(totaal)}</span>
          </div>
          <p className="mt-1 text-xs text-zacht">Een korting voer je in als regel met een negatief bedrag, bijv. -50,00.</p>
        </section>

        <section>
          <div className="wenkbrauw mb-2">Factuur aan</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Veld label="Naam"><input value={huurder.naam} onChange={(e) => setHuurder({ ...huurder, naam: e.target.value })} /></Veld>
            <Veld label="Adres"><input value={huurder.adres} onChange={(e) => setHuurder({ ...huurder, adres: e.target.value })} /></Veld>
            <Veld label="Postcode en plaats"><input value={huurder.postcodePlaats} onChange={(e) => setHuurder({ ...huurder, postcodePlaats: e.target.value })} /></Veld>
            <Veld label="Land"><input value={huurder.land ?? ""} onChange={(e) => setHuurder({ ...huurder, land: e.target.value })} /></Veld>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="wenkbrauw">Betaaltekst</span>
            {eigenTekst !== null && (
              <button type="button" className="text-xs underline" onClick={() => setEigenTekst(null)}>Automatisch laten berekenen</button>
            )}
          </div>
          <textarea rows={3} value={eigenTekst ?? automatisch} onChange={(e) => setEigenTekst(e.target.value)} />
          <p className="mt-1 text-xs text-zacht">
            {eigenTekst === null
              ? "Wordt automatisch berekend uit het totaal en de betaaltermijnen. Typ hier om hem zelf in te vullen."
              : "Zelf ingevuld: de tekst verandert niet meer mee met het totaal. Controleer de bedragen."}
          </p>
        </section>

        {fout ? <Fout fout={fout} /> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {f.aangepast && (
              <button
                type="button"
                className="knop-rand"
                disabled={bezig}
                onClick={() => {
                  if (window.confirm("Aanpassingen weggooien? De factuur volgt dan weer de gegevens van de boeking.")) {
                    bewaar(() => herstelConcept(f, b, inst))
                  }
                }}
              >
                Terug naar automatisch
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="knop-rand" onClick={onSluiten}>Annuleren</button>
            <button
              type="button"
              className="knop"
              disabled={bezig || !geldig}
              onClick={() => bewaar(() => pasConceptAan(f, b, inst, {
                regels: regels.map((r) => ({ ...r, omschrijving: r.omschrijving.trim() })),
                huurder,
                betaaltekst: eigenTekst,
              }))}
            >
              {bezig ? "Bezig…" : "Opslaan"}
            </button>
          </div>
        </div>
      </div>
    </Dialoog>
  )
}
