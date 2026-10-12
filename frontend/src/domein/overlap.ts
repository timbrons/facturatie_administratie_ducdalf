import type { IsoDatum } from "./datum"

export interface Periode {
  id: string
  aankomst: IsoDatum
  vertrek: IsoDatum
}

/**
 * Twee verblijven overlappen als ze minstens één nacht delen. Wisselen op
 * dezelfde dag (vertrek = aankomst van de volgende) is géén overlap.
 */
export function overlapt(a: Pick<Periode, "aankomst" | "vertrek">, b: Pick<Periode, "aankomst" | "vertrek">): boolean {
  return a.aankomst < b.vertrek && b.aankomst < a.vertrek
}

export function overlappendeBoekingen<T extends Periode>(nieuw: Pick<Periode, "aankomst" | "vertrek"> & { id?: string }, boekingen: T[]): T[] {
  return boekingen.filter((b) => b.id !== nieuw.id && overlapt(nieuw, b))
}

/** Alle paren die overlappen. */
export function alleOverlappen<T extends Periode>(boekingen: T[]): [T, T][] {
  const paren: [T, T][] = []
  const s = [...boekingen].sort((a, b) => (a.aankomst < b.aankomst ? -1 : 1))
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length && s[j].aankomst < s[i].vertrek; j++) {
      if (overlapt(s[i], s[j])) paren.push([s[i], s[j]])
    }
  }
  return paren
}
