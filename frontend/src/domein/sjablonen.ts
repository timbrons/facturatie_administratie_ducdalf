// Variabelen in e-mailsjablonen, zoals {voornaam} of {vervaldatum_rest}.

export const VARIABELEN: { naam: string; omschrijving: string }[] = [
  { naam: "voornaam", omschrijving: "Voornaam van de huurder" },
  { naam: "achternaam", omschrijving: "Achternaam van de huurder" },
  { naam: "naam", omschrijving: "Volledige naam van de huurder" },
  { naam: "aankomst", omschrijving: "Aankomstdatum, bijv. 17 oktober 2026" },
  { naam: "vertrek", omschrijving: "Vertrekdatum" },
  { naam: "nachten", omschrijving: "Aantal nachten" },
  { naam: "personen", omschrijving: "Aantal personen" },
  { naam: "kenteken", omschrijving: "Kenteken van de auto" },
  { naam: "factuurnummer", omschrijving: "Nummer van de laatste definitieve factuur" },
  { naam: "bedrag_totaal", omschrijving: "Totaalbedrag van de factuur" },
  { naam: "bedrag_aanbetaling", omschrijving: "Bedrag van de aanbetaling" },
  { naam: "vervaldatum_aanbetaling", omschrijving: "Uiterste datum aanbetaling" },
  { naam: "bedrag_rest", omschrijving: "Bedrag van de restbetaling" },
  { naam: "vervaldatum_rest", omschrijving: "Uiterste datum restbetaling" },
  { naam: "bedrag_open", omschrijving: "Nog openstaand bedrag" },
  { naam: "betaalinstructie", omschrijving: "Betaaltekst zoals op de factuur" },
  { naam: "iban", omschrijving: "IBAN uit de instellingen" },
  { naam: "rekeninghouder", omschrijving: "Ten name van" },
  { naam: "link_aanmeldformulier", omschrijving: "Link naar het aanmeldformulier (met boekingscode)" },
  { naam: "afzender", omschrijving: "Afzender, bijv. Familie Brons" },
]

export type Variabelen = Record<string, string>

/** Vult {variabelen} in. Onbekende of lege variabelen worden apart teruggegeven. */
export function vulIn(tekst: string, waarden: Variabelen): { tekst: string; ontbrekend: string[] } {
  const ontbrekend = new Set<string>()
  const uit = tekst.replace(/\{([a-z_]+)\}/g, (heel, naam: string) => {
    const w = waarden[naam]
    if (w === undefined || w === "") {
      ontbrekend.add(naam)
      return heel
    }
    return w
  })
  return { tekst: uit, ontbrekend: [...ontbrekend] }
}

/** Link naar het aanmeldformulier met de boekingscode, zodat de inzending te koppelen is. */
export function aanmeldLink(basis: string, code: string): string {
  if (!basis) return ""
  const url = basis.replace(/^http:\/\//, "https://")
  return `${url}${url.includes("?") ? "&" : "?"}boeking=${encodeURIComponent(code)}`
}

/** Welke workflowstap hoort bij het versturen van een sjabloon. */
export const STAP_NA_SJABLOON: Record<string, string> = {
  aanmeldformulier: "aanmeldformulier_verstuurd",
  brochure: "brochure_verstuurd",
  factuur: "factuur_verstuurd",
}

/**
 * Combineert meerdere ingevulde sjabloonteksten tot één mail: de aanhef van
 * de eerste, de middenstukken van allemaal en de afsluiting van de laatste.
 */
export function combineer(teksten: string[]): string {
  if (teksten.length === 1) return teksten[0]
  const delen = teksten.map((t) => t.split(/\n{2,}/))
  const aanhef = delen[0][0]
  const slot = delen[delen.length - 1].slice(-1)[0]
  const midden = delen.flatMap((d) => d.slice(1, -1))
  return [aanhef, ...midden, slot].join("\n\n")
}
