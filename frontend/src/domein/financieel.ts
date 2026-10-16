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

export interface ParkBoeking extends FinBoeking {
  parkkosten_cent: Cent
  schoonmaak_cent: Cent
  parkkosten_betaald_cent: Cent
  parkkosten_betaald_op: string
}

export interface ParkRij<T extends ParkBoeking = ParkBoeking> {
  boeking: T
  gefactureerd: Cent
  /** null: nog niet betaald aan PLD */
  betaald: Cent | null
  /** gefactureerd − betaald (positief: we hielden over) */
  verschil: Cent | null
}

/**
 * Wat we bij PLD afrekenen en de huurder in rekening brachten: parkkosten
 * plus eindschoonmaak (die betalen we via dezelfde factuur van PLD).
 */
export function pldGefactureerd(b: { parkkosten_cent?: Cent | null; schoonmaak_cent?: Cent | null }): Cent {
  return (b.parkkosten_cent ?? 0) + (b.schoonmaak_cent ?? 0)
}

/** Parkkosten per verblijf in een jaar (op aankomst): wat de huurder betaalde en wat wij aan PLD betaalden. */
export function parkkostenOverzicht<T extends ParkBoeking>(jaar: number, boekingen: T[]): ParkRij<T>[] {
  return boekingen
    .filter((b) => b.status !== "geannuleerd" && b.aankomst.startsWith(`${jaar}-`))
    .filter((b) => pldGefactureerd(b) > 0 || !!b.parkkosten_betaald_op)
    .sort((a, b) => a.aankomst.localeCompare(b.aankomst))
    .map((b) => {
      const betaald = b.parkkosten_betaald_op ? b.parkkosten_betaald_cent : null
      const gefactureerd = pldGefactureerd(b)
      return { boeking: b, gefactureerd, betaald, verschil: betaald === null ? null : gefactureerd - betaald }
    })
}
