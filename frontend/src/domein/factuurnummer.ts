// Factuurnummers: JJJJ-NNN, doorlopend per jaar (bijv. 2026-004).

export function formatFactuurnummer(jaar: number, volgnummer: number): string {
  return `${jaar}-${String(volgnummer).padStart(3, "0")}`
}

/** Leest ook afwijkende notaties uit de oude administratie, zoals "2026 - 002". */
export function parseFactuurnummer(s: string): { jaar: number; volgnummer: number } | null {
  const m = /^\s*(\d{4})\s*-\s*(\d{1,6})\s*$/.exec(s)
  if (!m) return null
  return { jaar: Number(m[1]), volgnummer: Number(m[2]) }
}

export function normaliseerFactuurnummer(s: string): string | null {
  const p = parseFactuurnummer(s)
  return p ? formatFactuurnummer(p.jaar, p.volgnummer) : null
}

/** Volgend nummer, gegeven het laatst uitgegeven volgnummer in dat jaar (0 = nog geen). */
export function volgendFactuurnummer(jaar: number, laatste: number): string {
  return formatFactuurnummer(jaar, laatste + 1)
}
