import type { Cent } from "./geld"
import type { Factuurregel, RegelSoort } from "./factuur"

export interface FinFactuur {
  id: string
  boeking: string
  nummer: string
  factuurdatum: string
  totaal_cent: Cent
  regels: Factuurregel[] | null
  geannuleerd_op?: string
}

export interface FinBetaling {
  boeking: string
  datum: string
  bedrag_cent: Cent
}

export interface FinBoeking {
  id: string
  naam: string
  aankomst: string
  vertrek: string
  status: string
  tb_aangegeven_cent: Cent
  tb_aangegeven_op: string
  tb_aangifte: string
}

export type Verdeling = Record<RegelSoort, Cent>

const LEEG = (): Verdeling => ({ huur: 0, schoonmaak: 0, parkkosten: 0, extra: 0, toeristenbelasting: 0, overig: 0 })

export interface FinRij {
  boeking: FinBoeking
  facturen: string[]
  verdeling: Verdeling
  gefactureerd: Cent
  ontvangen: Cent
  openstaand: Cent
}

export interface FinOverzicht {
  rijen: FinRij[]
  totaal: { verdeling: Verdeling; gefactureerd: Cent; ontvangen: Cent; openstaand: Cent }
}

/**
 * Financieel overzicht van de verblijven met aankomst in `jaar`. Alleen
 * geldige facturen tellen (definitief en niet geannuleerd). Bij een geannuleerde
 * boeking zonder geldige factuur is "ontvangen" wat er (na een eventuele
 * terugbetaling) is gehouden, en staat er niets open.
 */
export function financieelOverzicht(jaar: number, boekingen: FinBoeking[], facturen: FinFactuur[], betalingen: FinBetaling[]): FinOverzicht {
  const rijen: FinRij[] = []
  const totaal = { verdeling: LEEG(), gefactureerd: 0, ontvangen: 0, openstaand: 0 }
  for (const b of boekingen) {
    if (Number(b.aankomst.slice(0, 4)) !== jaar) continue
    const fs = facturen.filter((f) => f.boeking === b.id && f.nummer && !f.geannuleerd_op)
    const bs = betalingen.filter((p) => p.boeking === b.id)
    if (fs.length === 0 && bs.length === 0) continue
    const verdeling = LEEG()
    for (const f of fs) for (const r of f.regels ?? []) verdeling[r.soort] = (verdeling[r.soort] ?? 0) + r.bedrag_cent
    const gefactureerd = fs.reduce((t, f) => t + f.totaal_cent, 0)
    const ontvangen = bs.reduce((t, p) => t + p.bedrag_cent, 0)
    const rij = { boeking: b, facturen: fs.map((f) => f.nummer), verdeling, gefactureerd, ontvangen, openstaand: fs.length ? gefactureerd - ontvangen : 0 }
    rijen.push(rij)
    for (const k of Object.keys(verdeling) as RegelSoort[]) totaal.verdeling[k] += verdeling[k]
    totaal.gefactureerd += gefactureerd
    totaal.ontvangen += ontvangen
    totaal.openstaand += rij.openstaand
  }
  rijen.sort((a, b) => a.boeking.aankomst.localeCompare(b.boeking.aankomst))
  return { rijen, totaal }
}

export interface TbRij {
  boeking: FinBoeking
  geind: Cent
  aangegeven: Cent | null
  verschil: Cent | null
}

/** Toeristenbelasting per verhuur: geïnd via de factuur, aangegeven in het portaal en het verschil. */
export function tbOverzicht(jaar: number, boekingen: FinBoeking[], facturen: FinFactuur[]): TbRij[] {
  return boekingen
    .filter((b) => Number(b.aankomst.slice(0, 4)) === jaar && b.status !== "geannuleerd")
    .map((b) => {
      const geind = facturen
        .filter((f) => f.boeking === b.id && f.nummer && !f.geannuleerd_op)
        .flatMap((f) => f.regels ?? [])
        .filter((r) => r.soort === "toeristenbelasting")
        .reduce((t, r) => t + r.bedrag_cent, 0)
      const aangegeven = b.tb_aangegeven_op ? b.tb_aangegeven_cent : null
      return { boeking: b, geind, aangegeven, verschil: aangegeven === null ? null : aangegeven - geind }
    })
    .sort((a, b) => a.boeking.aankomst.localeCompare(b.boeking.aankomst))
}
