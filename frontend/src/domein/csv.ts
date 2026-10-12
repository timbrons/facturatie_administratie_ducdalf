// Eenvoudige CSV-lezer en -schrijver (RFC 4180), met ; of , als scheidingsteken.

export function leesCsv(tekst: string): string[][] {
  const s = tekst.replace(/^﻿/, "")
  const eersteRegel = s.split(/\r?\n/, 1)[0] ?? ""
  const telling = [";", ",", "\t"].map((t) => [t, eersteRegel.split(t).length - 1] as const)
  const scheiding = telling.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const rijen: string[][] = []
  let rij: string[] = []
  let veld = ""
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { veld += '"'; i++ } else inQuotes = false
      } else veld += c
    } else if (c === '"') inQuotes = true
    else if (c === scheiding) { rij.push(veld); veld = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++
      rij.push(veld); rijen.push(rij); rij = []; veld = ""
    } else veld += c
  }
  if (veld !== "" || rij.length > 0) { rij.push(veld); rijen.push(rij) }
  return rijen.filter((r) => r.some((v) => v.trim() !== ""))
}

/** CSV met ; als scheidingsteken (opent direct goed in Nederlandse Excel). */
export function schrijfCsv(rijen: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? "" : String(v)
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return "﻿" + rijen.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n"
}

/** Bedrag voor in een CSV: 1081,00 (zonder euroteken en duizendtallen). */
export function csvBedrag(cent: number | null | undefined): string {
  if (cent === null || cent === undefined) return ""
  const neg = cent < 0
  const a = Math.abs(cent)
  return `${neg ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`
}
