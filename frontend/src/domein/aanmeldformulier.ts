import { isIsoDatum } from "./datum"

// Het eigen aanmeldformulier: de invoer, de controle in de browser (dezelfde
// regels als op de server, backend/pb_hooks/aanmelden.js) en wat er naar de
// server gaat. Veldnamen zoals op het oude formulier, zodat maakAanmelding()
// ze ook leest.

export const MAX_PERSONEN = 6

export interface Meereiziger { naam: string; geboortedatum: string; geboorteplaats: string }

export interface Formulier {
  aankomstdatum: string
  vertrekdatum: string
  aantal_personen: string
  aanhef: string
  voornaam: string
  achternaam: string
  adres: string
  postcode: string
  plaats: string
  telefoon_vast: string
  telefoon_mobiel: string
  email: string
  kenteken_auto: string
  nummer_paspoort: string
  geboortedatum: string
  geboorteplaats: string
  noodcontact_naam: string
  noodcontact_telefoon_vast: string
  noodcontact_telefoon_mobiel: string
  noodcontact_email: string
  opmerkingen: string
  extra_personen: Meereiziger[]
}

export const LEEG_FORMULIER: Formulier = {
  aankomstdatum: "", vertrekdatum: "", aantal_personen: "", aanhef: "", voornaam: "", achternaam: "",
  adres: "", postcode: "", plaats: "", telefoon_vast: "", telefoon_mobiel: "", email: "", kenteken_auto: "",
  nummer_paspoort: "", geboortedatum: "", geboorteplaats: "", noodcontact_naam: "", noodcontact_telefoon_vast: "",
  noodcontact_telefoon_mobiel: "", noodcontact_email: "", opmerkingen: "", extra_personen: [],
}

export type Fouten = Record<string, string>

const VERPLICHT: Partial<Record<keyof Formulier, string>> = {
  aankomstdatum: "Vul de aankomstdatum in.",
  vertrekdatum: "Vul de vertrekdatum in.",
  aantal_personen: "Kies het aantal personen.",
  aanhef: "Maak een keuze.",
  voornaam: "Vul je voornaam in.",
  achternaam: "Vul je achternaam in.",
  adres: "Vul je adres in.",
  postcode: "Vul je postcode in.",
  plaats: "Vul je woonplaats in.",
  telefoon_mobiel: "Vul je mobiele nummer in.",
  email: "Vul je e-mailadres in.",
  geboortedatum: "Vul je geboortedatum in.",
  geboorteplaats: "Vul je geboorteplaats in.",
  noodcontact_naam: "Vul de naam van het noodcontact in.",
  noodcontact_telefoon_mobiel: "Vul het mobiele nummer van het noodcontact in.",
  noodcontact_email: "Vul het e-mailadres van het noodcontact in.",
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/** Aantal meereizenden (de invuller niet meegerekend) bij een gekozen aantal personen. */
export function aantalMeereizenden(aantal: string): number {
  const n = Number(aantal)
  return Number.isInteger(n) && n >= 1 && n <= MAX_PERSONEN ? n - 1 : 0
}

/** Past de lijst meereizenden aan het aantal personen aan (ingevulde gegevens blijven bewaard). */
export function pasMeereizendenAan(lijst: Meereiziger[], aantal: string): Meereiziger[] {
  const n = aantalMeereizenden(aantal)
  const uit = lijst.slice(0, n)
  while (uit.length < n) uit.push({ naam: "", geboortedatum: "", geboorteplaats: "" })
  return uit
}

export function controleer(f: Formulier, vandaag: string): Fouten {
  const fouten: Fouten = {}
  for (const [veld, melding] of Object.entries(VERPLICHT)) {
    if (!String(f[veld as keyof Formulier] ?? "").trim()) fouten[veld] = melding!
  }
  for (const veld of ["aankomstdatum", "vertrekdatum", "geboortedatum"] as const) {
    if (f[veld] && !isIsoDatum(f[veld])) fouten[veld] = "Geen geldige datum."
  }
  if (!fouten.aankomstdatum && !fouten.vertrekdatum && f.aankomstdatum && f.vertrekdatum && f.vertrekdatum <= f.aankomstdatum) {
    fouten.vertrekdatum = "De vertrekdatum moet na de aankomstdatum liggen."
  }
  if (f.geboortedatum && !fouten.geboortedatum && f.geboortedatum > vandaag) fouten.geboortedatum = "Deze datum ligt in de toekomst."
  if (f.email && !isEmail(f.email)) fouten.email = "Geen geldig e-mailadres."
  if (f.noodcontact_email && !isEmail(f.noodcontact_email)) fouten.noodcontact_email = "Geen geldig e-mailadres."
  if (f.aantal_personen && aantalMeereizenden(f.aantal_personen) === 0 && f.aantal_personen !== "1") {
    fouten.aantal_personen = `Kies 1 tot en met ${MAX_PERSONEN} personen.`
  }
  f.extra_personen.forEach((p, i) => {
    const pre = `extra_persoon_${i + 1}_`
    if (!p.naam.trim()) fouten[pre + "naam"] = "Vul de naam in."
    if (!p.geboortedatum) fouten[pre + "geboortedatum"] = "Vul de geboortedatum in."
    else if (!isIsoDatum(p.geboortedatum) || p.geboortedatum > vandaag) fouten[pre + "geboortedatum"] = "Geen geldige geboortedatum."
  })
  return fouten
}

/** Wat er naar de server gaat. */
export function alsVerzending(f: Formulier, boekingscode: string, invultijd: number, website: string) {
  const uit: Record<string, unknown> = {}
  for (const [k, w] of Object.entries(f)) if (k !== "extra_personen") uit[k] = typeof w === "string" ? w.trim() : w
  uit.extra_personen = f.extra_personen.map((p) => ({ naam: p.naam.trim(), geboortedatum: p.geboortedatum, geboorteplaats: p.geboorteplaats.trim() }))
  uit.boekingscode = boekingscode
  uit.invultijd = invultijd
  uit.website = website
  return uit
}
