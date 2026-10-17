// Beantwoorden en doorsturen van een mail: onderwerp, citaat en geadresseerden.

import { formatTijdstip } from "./datum"

/** "Vraag" → "Re: Vraag" (geen dubbel "Re:"). */
export function antwoordOnderwerp(onderwerp: string): string {
  const s = onderwerp.trim()
  return /^(re|antw|aw)\s*:/i.test(s) ? s : `Re: ${s}`
}

/** "Vraag" → "Fwd: Vraag" (geen dubbel "Fwd:"). */
export function doorstuurOnderwerp(onderwerp: string): string {
  const s = onderwerp.trim()
  return /^(fwd?|fw|doorst)\s*:/i.test(s) ? s : `Fwd: ${s}`
}

export interface Origineel {
  van: string
  aan: string
  onderwerp: string
  /** ISO-tijdstip of PocketBase-tijdstip */
  tijd: string
  /** Volledige tekst van de oorspronkelijke mail */
  tekst: string
}

/** Lege regels om in te typen, met daaronder de oorspronkelijke mail als citaat. */
export function antwoordTekst(o: Origineel): string {
  const geciteerd = o.tekst.trim().split(/\r?\n/).map((r) => (r ? `> ${r}` : ">")).join("\n")
  return `\n\n\nOp ${formatTijdstip(o.tijd)} schreef ${o.van}:\n${geciteerd}\n`
}

/** Lege regels om in te typen, met daaronder de doorgestuurde mail. */
export function doorstuurTekst(o: Origineel): string {
  return [
    "",
    "",
    "",
    "---------- Doorgestuurd bericht ----------",
    `Van: ${o.van}`,
    `Datum: ${formatTijdstip(o.tijd)}`,
    `Onderwerp: ${o.onderwerp}`,
    `Aan: ${o.aan}`,
    "",
    o.tekst.trim(),
    "",
  ].join("\n")
}
