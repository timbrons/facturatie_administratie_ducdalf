import type { Cent } from "./geld"

// Uitgaven die we zelf betalen: de afdracht toeristenbelasting aan Grand Pic
// Saint-Loup en het Starlink-abonnement (per maand actief of gepauzeerd).

export interface UitgaveRegel {
  id?: string
  soort: string
  datum: string
  periode: string
  bedrag_cent: Cent
  status?: string
}

/** Het jaar waarin een uitgave valt: de afschrijfdatum, anders de periode. */
export function jaarVanUitgave(u: Pick<UitgaveRegel, "datum" | "periode">): number {
  return Number((u.datum || u.periode).slice(0, 4))
}

export interface StarlinkMaand<T extends UitgaveRegel = UitgaveRegel> {
  periode: string
  maand: number
  uitgave: T | null
}

/** De twaalf maanden van een jaar met de vastgelegde Starlink-betaling (of null). */
export function starlinkJaar<T extends UitgaveRegel>(jaar: number, uitgaven: T[]): StarlinkMaand<T>[] {
  return Array.from({ length: 12 }, (_, i) => {
    const periode = `${jaar}-${String(i + 1).padStart(2, "0")}`
    return { periode, maand: i + 1, uitgave: uitgaven.find((u) => u.soort === "starlink" && u.periode === periode) ?? null }
  })
}

/** Standaardbedrag voor een Starlink-maand bij deze status. */
export function starlinkBedrag(status: string, inst: { starlink_actief_cent?: Cent | null; starlink_pauze_cent?: Cent | null }): Cent {
  if (status === "actief") return inst.starlink_actief_cent ?? 3500
  if (status === "gepauzeerd") return inst.starlink_pauze_cent ?? 1000
  return 0
}

/** Totaal per soort in een jaar. */
export function totaalUitgaven(jaar: number, uitgaven: UitgaveRegel[], soort: string): Cent {
  return uitgaven.filter((u) => u.soort === soort && jaarVanUitgave(u) === jaar).reduce((t, u) => t + u.bedrag_cent, 0)
}
