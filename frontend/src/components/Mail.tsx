import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { sleutels, useBetalingen, useFacturen, useMaillog, useSjablonen } from "../lib/data"
import { gmailBeschikbaar, SCOPES, useGmailGekoppeld, zorgVoorGoogle } from "../lib/gmail"
import { actueleFactuur, beschikbareBijlagen, kiesSjabloon, variabelenVoor, verstuurMail, type BijlageKeuze } from "../lib/mail"
import type { Boeking, Instellingen } from "../lib/types"
import { combineer, vulIn } from "../domein/sjablonen"
import { formatTijdstip } from "../domein/datum"
import type { WorkflowStap } from "../domein/workflow"
import { Dialoog, Fout, Kaart, Melding, Veld } from "./ui"

/**
 * Status van de Google-koppeling. Koppelen gebeurt vanzelf bij de eerste actie
 * die Google nodig heeft (zie zorgVoorGoogle), dus er is geen knop meer.
 */
export function GmailKnop({ klein = false }: { inst?: Instellingen; klein?: boolean }) {
  const gekoppeld = useGmailGekoppeld()
  if (!gmailBeschikbaar() || !gekoppeld) return null
  return <span className={`${klein ? "text-xs" : "text-sm"} text-olijf-donker`}>✓ Google gekoppeld</span>
}

export function MailKaart({ boeking: b, inst, stappen, open, sleutels: startSleutels, onOpen, onSluiten }: {
  boeking: Boeking
  inst: Instellingen
  stappen: WorkflowStap[]
  open: boolean
  sleutels: string[]
  onOpen: (sleutels: string[]) => void
  onSluiten: () => void
}) {
  const log = useMaillog()
  const sjablonen = useSjablonen()
  const mails = (log.data ?? []).filter((m) => m.boeking === b.id)
  const snel = (sjablonen.data ?? []).filter((s) => s.taal === "nl")
  return (
    <Kaart titel="E-mails" actie={<GmailKnop inst={inst} klein />}>
      {!gmailBeschikbaar() && (
        <div className="mb-3"><Melding soort="info">Versturen via Gmail is nog niet ingesteld (VITE_GOOGLE_CLIENT_ID ontbreekt). Zie docs/google-inloggen-en-gmail.md.</Melding></div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="knop" onClick={() => onOpen([])}>E-mail opstellen</button>
        {snel.map((s) => (
          <button key={s.id} type="button" className="knop-klein" onClick={() => onOpen([s.sleutel])}>{s.naam}</button>
        ))}
      </div>
      {mails.length === 0 ? (
        <p className="text-sm text-zacht">Nog geen e-mails verstuurd vanuit het systeem.</p>
      ) : (
        <ul className="divide-y divide-lijn border-t border-lijn">
          {mails.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <details>
                <summary className="cursor-pointer">
                  <span className="text-inkt">{m.onderwerp}</span>
                  <span className="ml-2 text-xs text-zacht">{formatTijdstip(m.created)} · aan {m.aan}</span>
                </summary>
                <div className="mt-2 border-l-2 border-lijn pl-3">
                  {(m.bijlagen ?? []).length > 0 && <div className="mb-1 text-xs text-zacht">Bijlagen: {(m.bijlagen ?? []).join(", ")}</div>}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-tekst">{m.tekst}</pre>
                  <div className="mt-1 text-xs text-zacht">Gmail-thread: {m.gmail_thread_id || "—"}</div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {open && <MailDialoog boeking={b} inst={inst} stappen={stappen} startSleutels={startSleutels} onSluiten={onSluiten} />}
    </Kaart>
  )
}

function MailDialoog({ boeking: b, inst, stappen, startSleutels, onSluiten }: {
  boeking: Boeking
  inst: Instellingen
  stappen: WorkflowStap[]
  startSleutels: string[]
  onSluiten: () => void
}) {
  const qc = useQueryClient()
  const sjablonen = useSjablonen().data ?? []
  const facturen = useFacturen().data ?? []
  const betalingen = useBetalingen().data ?? []
  const log = useMaillog().data ?? []
  const gekoppeld = useGmailGekoppeld()
  const taal = b.taal || b.expand?.huurder?.taal || "nl"
  const factuur = actueleFactuur(b, facturen)
  const beschikbaar = beschikbareBijlagen(inst, factuur)
  const variabelen = useMemo(() => variabelenVoor(b, inst, facturen, betalingen), [b, inst, facturen, betalingen])

  const [gekozen, setGekozen] = useState<string[]>(startSleutels)
  const [aan, setAan] = useState(b.expand?.huurder?.email ?? "")
  const [onderwerp, setOnderwerp] = useState("")
  const [tekst, setTekst] = useState("")
  const [bijlagen, setBijlagen] = useState<BijlageKeuze[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<unknown>(null)
  const [klaar, setKlaar] = useState(false)

  // Opbouw uit de gekozen sjablonen. Meerdere sjablonen worden gecombineerd:
  // één aanhef en afsluiting, de middenstukken onder elkaar.
  useEffect(() => {
    const s = gekozen.map((k) => kiesSjabloon(sjablonen, k, taal)).filter((x): x is NonNullable<typeof x> => !!x)
    if (s.length === 0) return
    // Onderwerp van het eerste gekozen sjabloon (aan te passen in de preview).
    setOnderwerp(vulIn(s[0].onderwerp, variabelen).tekst)
    const teksten = s.map((x) => vulIn(x.tekst, variabelen).tekst)
    setTekst(s.length === 1 ? teksten[0] : combineer(teksten))
    const wil = new Set(s.flatMap((x) => x.bijlagen ?? []))
    setBijlagen(beschikbaar.filter((bk) => wil.has(bk.soort)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gekozen.join(","), sjablonen.length])

  const ontbrekend = [...new Set([...vulIn(onderwerp, {}).ontbrekend, ...vulIn(tekst, {}).ontbrekend])]
  const gewensteBijlagen = new Set(gekozen.flatMap((k) => kiesSjabloon(sjablonen, k, taal)?.bijlagen ?? []))
  const missendeBijlagen = [...gewensteBijlagen].filter((s) => !beschikbaar.some((bk) => bk.soort === s))

  async function verstuur() {
    setBezig(true)
    setFout(null)
    try {
      // Eerst (binnen de klik) zorgen voor een geldige Google-koppeling.
      await zorgVoorGoogle(inst.afzender_email, SCOPES.verzenden)
      await verstuurMail({ boeking: b, inst, stappen, factuur, eerdere: log, aan, onderwerp, tekst, bijlagen, sjablonen: gekozen })
      await Promise.all([
        qc.invalidateQueries({ queryKey: sleutels.maillog }),
        qc.invalidateQueries({ queryKey: sleutels.boekingen }),
        qc.invalidateQueries({ queryKey: sleutels.facturen }),
        qc.invalidateQueries({ queryKey: sleutels.historie(b.id) }),
      ])
      setKlaar(true)
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialoog open titel="E-mail opstellen" onSluiten={onSluiten}>
      {klaar ? (
        <>
          <Melding soort="succes">De e-mail is verstuurd vanuit Gmail en staat in het maillog van deze boeking. Je vindt hem ook in Gmail onder "Verzonden".</Melding>
          <div className="mt-4 flex justify-end"><button type="button" className="knop" onClick={onSluiten}>Sluiten</button></div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-sm text-zacht">Sjablonen (combineren mag)</div>
            <div className="flex flex-wrap gap-2">
              {[...new Set(sjablonen.map((s) => s.sleutel))].map((k) => {
                const s = kiesSjabloon(sjablonen, k, taal)!
                const aanUit = gekozen.includes(k)
                return (
                  <button
                    key={k}
                    type="button"
                    className={`border px-2.5 py-1 text-xs ${aanUit ? "border-goud bg-goud text-white" : "border-lijn bg-white text-inkt"}`}
                    onClick={() => setGekozen(aanUit ? gekozen.filter((x) => x !== k) : [...gekozen, k])}
                  >
                    {s.naam}
                  </button>
                )
              })}
            </div>
          </div>
          <Veld label="Aan"><input type="email" value={aan} onChange={(e) => setAan(e.target.value)} /></Veld>
          <Veld label="Onderwerp"><input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} /></Veld>
          <Veld label="Tekst"><textarea rows={12} value={tekst} onChange={(e) => setTekst(e.target.value)} /></Veld>
          <div>
            <div className="mb-1 text-sm text-zacht">Bijlagen</div>
            {beschikbaar.length === 0 && <div className="text-xs text-zacht">Geen bijlagen beschikbaar.</div>}
            {beschikbaar.map((bk) => (
              <label key={bk.soort} className="flex items-center gap-2 text-sm text-inkt">
                <input
                  type="checkbox"
                  checked={bijlagen.some((x) => x.soort === bk.soort)}
                  onChange={(e) => setBijlagen(e.target.checked ? [...bijlagen, bk] : bijlagen.filter((x) => x.soort !== bk.soort))}
                />
                {bk.bestandsnaam}
              </label>
            ))}
          </div>
          {ontbrekend.length > 0 && (
            <Melding soort="waarschuwing">Nog niet ingevuld: {ontbrekend.map((o) => `{${o}}`).join(", ")}. Pas de tekst aan of vul de gegevens eerst aan.</Melding>
          )}
          {missendeBijlagen.includes("factuur") && (
            <Melding soort="waarschuwing">Er is nog geen definitieve factuur met PDF. Maak die eerst bij Facturen (Definitief maken).</Melding>
          )}
          {missendeBijlagen.includes("brochure") && (
            <Melding soort="waarschuwing">Er is nog geen brochure geüpload. <Link to="/instellingen">Upload hem bij Instellingen</Link>.</Melding>
          )}
          {!gekoppeld && (
            <p className="text-xs text-zacht">Bij Versturen koppelt de app zo nodig eerst met Google (er verschijnt kort een venster van Google).</p>
          )}
          {fout ? <Fout fout={fout} /> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="knop-rand" onClick={onSluiten}>Annuleren</button>
            <button
              type="button"
              className="knop"
              disabled={bezig || !aan || !onderwerp.trim() || !tekst.trim()}
              onClick={verstuur}
            >
              {bezig ? "Versturen…" : "Versturen"}
            </button>
          </div>
        </div>
      )}
    </Dialoog>
  )
}
