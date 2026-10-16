import type { ReactNode } from "react"
import { useBetalingen, useFacturen, useMaillog } from "../lib/data"
import type { Boeking, Statuswijziging } from "../lib/types"
import type { Aanmelding } from "../domein/aanmelding"
import { formatLang, formatTijdstip } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import type { WorkflowStap } from "../domein/workflow"
import { AanmeldingGegevens } from "./AanmeldingKaart"
import { Gegeven, Kaart } from "./ui"

const SOORT_BETALING: Record<string, string> = {
  aanbetaling: "Aanbetaling",
  rest: "Restbedrag",
  volledig: "Volledig bedrag",
  terugbetaling: "Terugbetaling",
  overig: "Overig",
}

/**
 * Wat er bij een (afgeronde) workflowstap is gebeurd: wanneer en door wie,
 * de mails die de stap zetten, en per stap de bijbehorende gegevens
 * (het ontvangen aanmeldformulier, de factuur, de betalingen, ...).
 */
export function StapDetail({ boeking: b, stap, nummer, historie, bronnen, onSluiten }: {
  boeking: Boeking
  stap: WorkflowStap
  nummer: number
  historie: Statuswijziging[]
  bronnen: Record<string, string>
  onSluiten: () => void
}) {
  const maillog = useMaillog()
  const facturen = useFacturen()
  const betalingen = useBetalingen()

  const momenten = historie.filter((h) => h.naar === stap.sleutel)
  const mails = (maillog.data ?? []).filter((m) => m.boeking === b.id && m.status_na === stap.sleutel)

  let inhoud: ReactNode = null
  switch (stap.sleutel) {
    case "aanvraag":
      inhoud = (
        <dl className="text-sm">
          <Gegeven label="Binnengekomen">{formatTijdstip(b.created)}</Gegeven>
          <Gegeven label="Bron">{bronnen[b.bron] ?? b.bron}</Gegeven>
          <Gegeven label="Periode">{`${formatLang(b.aankomst)} – ${formatLang(b.vertrek)}`}</Gegeven>
          <Gegeven label="Personen">{`${b.volwassenen} volwassene(n)${b.kinderen ? `, ${b.kinderen} kind(eren)` : ""}`}</Gegeven>
        </dl>
      )
      break
    case "aanmeldformulier_ontvangen": {
      const a = b.aanmelding as (Aanmelding & { ontvangen?: string }) | null
      inhoud = a ? (
        <>
          <p className="mb-2 text-xs text-zacht">Formulier ontvangen {formatTijdstip(a.ontvangen ?? b.aanmelding_op)}</p>
          <AanmeldingGegevens aanmelding={a} />
        </>
      ) : (
        <p className="text-sm text-zacht">Er is geen ingevuld formulier aan deze boeking gekoppeld.</p>
      )
      break
    }
    case "tb_berekend":
      inhoud = (
        <dl className="text-sm">
          <Gegeven label="Simulatie portaal">{b.tb_portaal_op ? `${formatEuro(b.tb_portaal_cent)} (vastgelegd ${formatTijdstip(b.tb_portaal_op)})` : ""}</Gegeven>
        </dl>
      )
      break
    case "factuur_verstuurd": {
      const lijst = (facturen.data ?? []).filter((f) => f.boeking === b.id && f.nummer)
      inhoud = lijst.length === 0 ? (
        <p className="text-sm text-zacht">Geen definitieve factuur gevonden.</p>
      ) : (
        <ul className="divide-y divide-lijn border-t border-lijn text-sm">
          {lijst.map((f) => (
            <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="text-inkt">
                {f.soort === "credit" ? "Creditfactuur" : "Factuur"} {f.nummer}
                {f.geannuleerd_op && <span className="ml-2 text-xs text-zacht">geannuleerd</span>}
              </span>
              <span className="text-xs text-zacht">
                {formatLang(f.factuurdatum)} · {formatEuro(f.totaal_cent)}
                {f.verstuurd_op ? ` · verstuurd ${formatTijdstip(f.verstuurd_op)}` : " · nog niet verstuurd"}
              </span>
            </li>
          ))}
        </ul>
      )
      break
    }
    case "aanbetaling_ontvangen":
    case "volledig_betaald": {
      const lijst = (betalingen.data ?? []).filter((p) => p.boeking === b.id).sort((x, y) => x.datum.localeCompare(y.datum))
      inhoud = lijst.length === 0 ? (
        <p className="text-sm text-zacht">Geen betalingen geregistreerd.</p>
      ) : (
        <ul className="divide-y divide-lijn border-t border-lijn text-sm">
          {lijst.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="text-inkt">{SOORT_BETALING[p.soort] ?? p.soort}{p.opmerking ? ` – ${p.opmerking}` : ""}</span>
              <span className="tabular-nums text-xs text-zacht">{formatLang(p.datum)} · {formatEuro(p.bedrag_cent)}</span>
            </li>
          ))}
        </ul>
      )
      break
    }
    case "verblijf":
      inhoud = (
        <dl className="text-sm">
          <Gegeven label="Periode">{`${formatLang(b.aankomst)} – ${formatLang(b.vertrek)}`}</Gegeven>
          <Gegeven label="Kenteken">{b.kenteken}</Gegeven>
        </dl>
      )
      break
    case "tb_aangegeven":
      inhoud = (
        <dl className="text-sm">
          <Gegeven label="Aangegeven">{b.tb_aangegeven_op ? `${formatEuro(b.tb_aangegeven_cent)} op ${formatLang(b.tb_aangegeven_op)}` : ""}</Gegeven>
          <Gegeven label="Personen">
            {b.tb_aangegeven_op ? `${b.tb_definitief_volwassenen} volwassene(n), ${b.tb_definitief_kinderen} minderjarige(n)` : ""}
          </Gegeven>
        </dl>
      )
      break
  }

  return (
    <Kaart
      className="mb-6"
      titel={`Stap ${nummer}: ${stap.label}`}
      actie={<button type="button" className="knop-klein" onClick={onSluiten}>Sluiten</button>}
    >
      {stap.omschrijving && <p className="mb-4 text-sm text-tekst">{stap.omschrijving}</p>}

      <div className="flex flex-col gap-5">
        <section>
          <div className="wenkbrauw mb-2">Wanneer</div>
          {momenten.length === 0 ? (
            <p className="text-sm text-zacht">Niet apart vastgelegd; de boeking is in één keer verder gezet.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {momenten.map((h) => (
                <li key={h.id} className="border-l-2 border-goud pl-3">
                  <div className="text-inkt">{formatTijdstip(h.created)}{h.door ? ` · ${h.door}` : ""}</div>
                  {h.opmerking && <div className="text-xs">{h.opmerking}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>

        {inhoud && (
          <section>
            <div className="wenkbrauw mb-2">Gegevens</div>
            {inhoud}
          </section>
        )}

        {mails.length > 0 && (
          <section>
            <div className="wenkbrauw mb-2">Verstuurde e-mail</div>
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
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Kaart>
  )
}
