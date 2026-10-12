// Bedragen zijn altijd gehele centen (number, geen floats met euro's).

export type Cent = number

const GROEP = /\B(?=(\d{3})+(?!\d))/g

/** 108100 → "€ 1.081,00" */
export function formatEuro(cent: Cent | null | undefined): string {
  if (cent === null || cent === undefined || Number.isNaN(cent)) return ""
  const negatief = cent < 0
  const abs = Math.abs(Math.round(cent))
  const euros = Math.floor(abs / 100).toString().replace(GROEP, ".")
  const centen = String(abs % 100).padStart(2, "0")
  return `${negatief ? "− " : ""}€ ${euros},${centen}`
}

/** 108100 → "1.081,00" (zonder euroteken, voor invoervelden) */
export function formatBedrag(cent: Cent | null | undefined): string {
  return formatEuro(cent).replace("€ ", "")
}

/**
 * Leest een bedrag zoals een gebruiker het intypt: "1.081,00", "1081",
 * "€ 64,5", "27.00". Geeft null bij ongeldige invoer.
 */
export function parseEuro(invoer: string): Cent | null {
  let s = invoer.replace(/[€\s]/g, "").replace("−", "-")
  const negatief = s.startsWith("-")
  if (negatief) s = s.slice(1)
  let geheel = s
  let decimalen = ""
  if (s.includes(",")) {
    // Nederlandse notatie: komma is het decimaalteken, punten zijn duizendtallen.
    const i = s.lastIndexOf(",")
    geheel = s.slice(0, i).replace(/\./g, "")
    decimalen = s.slice(i + 1)
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // "27.00" of "64.5": punt als decimaalteken.
    ;[geheel, decimalen] = s.split(".")
  } else {
    geheel = s.replace(/\./g, "")
  }
  if (!/^\d+$/.test(geheel || "0") || !/^\d{0,2}$/.test(decimalen)) return null
  if (geheel === "" && decimalen === "") return null
  const cent = Number(geheel || "0") * 100 + Number(decimalen.padEnd(2, "0"))
  return negatief ? -cent : cent
}

/** Afronden op hele centen, half naar boven (zoals ROUND in Excel bij positieve bedragen). */
export function rondAf(teller: number, noemer: number): Cent {
  if (noemer <= 0) throw new Error("Noemer moet positief zijn")
  const negatief = teller < 0
  const t = Math.abs(teller)
  const r = Math.floor((2 * t + noemer) / (2 * noemer))
  return negatief ? -r : r
}

/** Percentage van een bedrag, afgerond op centen. */
export function percentageVan(cent: Cent, procent: number): Cent {
  return rondAf(cent * procent, 100)
}
