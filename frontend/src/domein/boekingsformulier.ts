import { dagenTussen, isIsoDatum, plusDagen, type IsoDatum } from "./datum"

// Het openbare boekingsformulier: beschikbaarheid, regels en controle in de
// browser. Dezelfde regels als op de server (backend/pb_hooks/boeken.js).

export interface Periode { aankomst: IsoDatum; vertrek: IsoDatum }

export interface Regels {
  min_nachten: number
  max_personen: number
  seizoenen: { van: IsoDatum; tot: IsoDatum; min_nachten: number }[]
}

export interface Aanvraag {
  aankomst: string
  vertrek: string
  volwassenen: string
  kinderen: string
  voornaam: string
  achternaam: string
  email: string
  telefoon: string
  opmerkingen: string
}

export const LEGE_AANVRAAG: Aanvraag = {
  aankomst: "", vertrek: "", volwassenen: "2", kinderen: "0", voornaam: "", achternaam: "", email: "", telefoon: "", opmerkingen: "",
}

/** Is de nacht die op deze datum begint bezet? (De vertrekdag zelf is vrij.) */
export function nachtBezet(datum: IsoDatum, bezet: Periode[]): boolean {
  return bezet.some((p) => p.aankomst <= datum && datum < p.vertrek)
}

/** Zijn alle nachten van aankomst tot vertrek vrij? */
export function periodeVrij(aankomst: IsoDatum, vertrek: IsoDatum, bezet: Periode[]): boolean {
  return !bezet.some((p) => aankomst < p.vertrek && p.aankomst < vertrek)
}

/** Minimum aantal nachten voor een periode: het hoogste van de algemene regel en de seizoenen. */
export function minNachten(aankomst: IsoDatum, vertrek: IsoDatum, regels: Regels): number {
  let min = regels.min_nachten || 0
  for (let d = aankomst; d < vertrek; d = plusDagen(d, 1)) {
    let seizoen: Regels["seizoenen"][number] | null = null
    for (const s of regels.seizoenen) if (s.van <= d && d <= s.tot && (!seizoen || s.van > seizoen.van)) seizoen = s
    if (seizoen && seizoen.min_nachten > min) min = seizoen.min_nachten
  }
  return min
}

/** Minimum aantal nachten vanaf een aankomstdatum (seizoen van de eerste nacht en algemene regel). */
export function minNachtenVanaf(aankomst: IsoDatum, regels: Regels): number {
  return minNachten(aankomst, plusDagen(aankomst, 1), regels)
}

export function controleer(a: Aanvraag, regels: Regels, bezet: Periode[], vandaag: IsoDatum): Record<string, string> {
  const f: Record<string, string> = {}
  if (!a.voornaam.trim()) f.voornaam = "Vul je voornaam in."
  if (!a.achternaam.trim()) f.achternaam = "Vul je achternaam in."
  if (!a.email.trim()) f.email = "Vul je e-mailadres in."
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) f.email = "Geen geldig e-mailadres."
  if (!isIsoDatum(a.aankomst)) f.aankomst = "Kies een aankomstdatum in de kalender."
  else if (a.aankomst < vandaag) f.aankomst = "De aankomstdatum ligt in het verleden."
  if (!isIsoDatum(a.vertrek)) f.vertrek = "Kies een vertrekdatum in de kalender."
  else if (!f.aankomst && a.vertrek <= a.aankomst) f.vertrek = "De vertrekdatum moet na de aankomstdatum liggen."
  if (!f.aankomst && !f.vertrek) {
    const min = minNachten(a.aankomst, a.vertrek, regels)
    if (dagenTussen(a.aankomst, a.vertrek) < min) f.vertrek = `In deze periode verhuren we minimaal ${min} nachten.`
    else if (!periodeVrij(a.aankomst, a.vertrek, bezet)) f.aankomst = "Het huis is in (een deel van) deze periode al bezet."
  }
  const volwassenen = Number(a.volwassenen)
  const kinderen = Number(a.kinderen || 0)
  if (!(volwassenen >= 1)) f.volwassenen = "Er reist minimaal één volwassene mee."
  else if (volwassenen + kinderen > regels.max_personen) f.volwassenen = `Het huis is geschikt voor maximaal ${regels.max_personen} personen.`
  return f
}
