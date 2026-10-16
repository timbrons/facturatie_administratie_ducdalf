import { dagenTussen, datumVan, isIsoDatum, plusDagen, plusMaanden, type IsoDatum } from "./datum"
import { parseEuro, percentageVan, type Cent } from "./geld"
import { normaliseerFactuurnummer } from "./factuurnummer"
import type { Factuurregel } from "./factuur"

// Import van de bestaande administratie (Google Sheet als CSV). Verwachte
// kolommen (zoals in de huidige sheet): Factuurnr, Naam, E-mail,
// Aankomstdatum, Vertrekdatum, Nachten, Personen, Volwassenen, Prijs per
// nacht, Linnenpakket 1 persoon, Linnenpakket 2 personen, Kosten
// linnenpakketten, Parkkosten, Schoonmaakkosten, Toeristenbelasting,
// Totaalprijs, Opmerkingen, Betaalstatus, Datum en tijd aanvraag.

export interface ImportRij {
  regel: number
  factuurnummer: string
  naam: string
  voornaam: string
  achternaam: string
  email: string
  aankomst: IsoDatum
  vertrek: IsoDatum
  nachten: number
  volwassenen: number
  kinderen: number
  huurCent: Cent
  parkkostenCent: Cent
  schoonmaakCent: Cent
  linnen1: number
  linnen2: number
  linnenCent: Cent
  tbCent: Cent
  totaalCent: Cent
  opmerkingen: string
  betaalstatus: "betaald" | "aanbetaling" | "open"
  aanvraagdatum: IsoDatum | null
  waarschuwingen: string[]
  fouten: string[]
}

const KOLOMMEN: Record<string, string[]> = {
  factuurnummer: ["factuurnr", "factuurnummer"],
  naam: ["naam"],
  email: ["e-mail", "email"],
  aankomst: ["aankomstdatum", "aankomst"],
  vertrek: ["vertrekdatum", "vertrek"],
  nachten: ["nachten"],
  personen: ["personen"],
  volwassenen: ["volwassenen"],
  prijsPerNacht: ["prijs per nacht"],
  linnen1: ["linnenpakket 1 persoon"],
  linnen2: ["linnenpakket 2 personen"],
  linnenKosten: ["kosten linnenpakketten"],
  parkkosten: ["parkkosten"],
  schoonmaak: ["schoonmaakkosten", "schoonmaak"],
  tb: ["toeristenbelasting"],
  totaal: ["totaalprijs", "totaal"],
  opmerkingen: ["opmerkingen"],
  betaalstatus: ["betaalstatus"],
  aanvraag: ["datum en tijd aanvraag", "datum aanvraag"],
}

/** Datum in vele notaties: 2026-10-17, 17-10-2026, 17/10/2026, 17-10-26. */
export function leesDatum(s: string): IsoDatum | null {
  const t = s.trim().slice(0, 10)
  if (isIsoDatum(t)) return t
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s.trim())
  if (!m) return null
  const jaar = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = datumVan(jaar, Number(m[2]), Number(m[1]))
  return isIsoDatum(d) && Number(d.slice(8)) === Number(m[1]) ? d : null
}

function leesGetal(s: string | undefined): number {
  if (!s || !s.trim()) return 0
  const c = parseEuro(s)
  return c === null ? NaN : c / 100
}

function leesBedrag(s: string | undefined): Cent {
  if (!s || !s.trim()) return 0
  const c = parseEuro(s)
  return c === null ? NaN : c
}

function splitsNaam(naam: string): { voornaam: string; achternaam: string } {
  const delen = naam.trim().split(/\s+/)
  if (delen.length <= 1) return { voornaam: "", achternaam: naam.trim() }
  return { voornaam: delen[0], achternaam: delen.slice(1).join(" ") }
}

export function leesAdministratie(rijen: string[][], vandaag: IsoDatum): ImportRij[] {
  if (rijen.length === 0) return []
  const kop = rijen[0].map((k) => k.trim().toLowerCase())
  const idx: Record<string, number> = {}
  for (const [sleutel, namen] of Object.entries(KOLOMMEN)) {
    idx[sleutel] = kop.findIndex((k) => namen.includes(k))
  }
  const v = (rij: string[], sleutel: string) => (idx[sleutel] >= 0 ? (rij[idx[sleutel]] ?? "").trim() : "")

  const uit: ImportRij[] = []
  rijen.slice(1).forEach((rij, i) => {
    const naam = v(rij, "naam")
    const factuurRuw = v(rij, "factuurnummer")
    if (!naam && !factuurRuw) return
    const fouten: string[] = []
    const waarschuwingen: string[] = []

    const factuurnummer = normaliseerFactuurnummer(factuurRuw) ?? ""
    if (!factuurnummer) fouten.push(`Ongeldig factuurnummer "${factuurRuw}"`)
    else if (factuurnummer !== factuurRuw) waarschuwingen.push(`Factuurnummer "${factuurRuw}" gelezen als ${factuurnummer}`)

    const aankomst = leesDatum(v(rij, "aankomst"))
    const vertrek = leesDatum(v(rij, "vertrek"))
    if (!aankomst || !vertrek || vertrek <= aankomst) fouten.push("Ongeldige aankomst- of vertrekdatum")
    const nachten = aankomst && vertrek ? dagenTussen(aankomst, vertrek) : 0
    const nachtenKolom = leesGetal(v(rij, "nachten"))
    if (nachtenKolom && nachten && nachtenKolom !== nachten) waarschuwingen.push(`Kolom Nachten (${nachtenKolom}) wijkt af van de datums (${nachten})`)

    const personen = leesGetal(v(rij, "personen")) || 0
    const volwassenen = leesGetal(v(rij, "volwassenen")) || personen
    const kinderen = Math.max(0, personen - volwassenen)

    const prijsPerNacht = leesBedrag(v(rij, "prijsPerNacht"))
    const huurCent = Math.round(prijsPerNacht * nachten)
    const parkkostenCent = leesBedrag(v(rij, "parkkosten"))
    const schoonmaakCent = leesBedrag(v(rij, "schoonmaak"))
    const linnen1 = leesGetal(v(rij, "linnen1")) || 0
    const linnen2 = leesGetal(v(rij, "linnen2")) || 0
    const linnenCent = leesBedrag(v(rij, "linnenKosten"))
    const tbCent = leesBedrag(v(rij, "tb"))
    const totaalCent = leesBedrag(v(rij, "totaal"))
    for (const [label, waarde] of [["prijs per nacht", prijsPerNacht], ["parkkosten", parkkostenCent], ["schoonmaak", schoonmaakCent], ["toeristenbelasting", tbCent], ["totaal", totaalCent]] as const) {
      if (Number.isNaN(waarde)) fouten.push(`Ongeldig bedrag bij ${label}`)
    }
    const som = huurCent + parkkostenCent + schoonmaakCent + linnenCent + tbCent
    if (!fouten.length && totaalCent && som !== totaalCent) {
      waarschuwingen.push(`Totaal in het bestand (${(totaalCent / 100).toFixed(2)}) wijkt af van de som van de posten (${(som / 100).toFixed(2)})`)
    }

    const statusRuw = v(rij, "betaalstatus").toLowerCase()
    const betaalstatus: ImportRij["betaalstatus"] = statusRuw.startsWith("betaald")
      ? "betaald"
      : statusRuw.includes("aanbetaling")
        ? "aanbetaling"
        : "open"

    const aanvraagdatum = leesDatum(v(rij, "aanvraag"))
    if (vertrek && vertrek < vandaag && betaalstatus !== "betaald") waarschuwingen.push("Verblijf is voorbij maar niet als betaald gemarkeerd")

    uit.push({
      regel: i + 2,
      factuurnummer,
      naam,
      ...splitsNaam(naam),
      email: v(rij, "email"),
      aankomst: aankomst ?? "",
      vertrek: vertrek ?? "",
      nachten,
      volwassenen,
      kinderen,
      huurCent: Number.isNaN(huurCent) ? 0 : huurCent,
      parkkostenCent: Number.isNaN(parkkostenCent) ? 0 : parkkostenCent,
      schoonmaakCent: Number.isNaN(schoonmaakCent) ? 0 : schoonmaakCent,
      linnen1,
      linnen2,
      linnenCent: Number.isNaN(linnenCent) ? 0 : linnenCent,
      tbCent: Number.isNaN(tbCent) ? 0 : tbCent,
      totaalCent: Number.isNaN(totaalCent) ? 0 : totaalCent,
      opmerkingen: v(rij, "opmerkingen") === "nvt" ? "" : v(rij, "opmerkingen"),
      betaalstatus,
      aanvraagdatum,
      waarschuwingen,
      fouten,
    })
  })
  return uit
}

/** Factuurregels zoals ze in de oude administratie stonden. */
export function importRegels(r: ImportRij): Factuurregel[] {
  const regels: Factuurregel[] = [
    { soort: "huur", omschrijving: "Huur", nachten: r.nachten, bedrag_cent: r.huurCent },
    { soort: "schoonmaak", omschrijving: "Eindschoonmaak", bedrag_cent: r.schoonmaakCent },
  ]
  if (r.parkkostenCent) regels.push({ soort: "parkkosten", omschrijving: "Parkkosten", bedrag_cent: r.parkkostenCent })
  if (r.linnenCent) {
    const delen = [r.linnen1 ? `${r.linnen1}× 1 persoon` : "", r.linnen2 ? `${r.linnen2}× 2 personen` : ""].filter(Boolean).join(", ")
    regels.push({ soort: "extra", omschrijving: `Linnenpakketten${delen ? ` (${delen})` : ""}`, bedrag_cent: r.linnenCent })
  }
  regels.push({ soort: "toeristenbelasting", omschrijving: "Toeristenbelasting", nachten: r.nachten, personen: r.volwassenen, bedrag_cent: r.tbCent })
  return regels
}

export interface ImportPlan {
  status: string
  betaalwijze: "ineens" | "aanbetaling"
  factuurdatum: IsoDatum
  aanbetalingCent: Cent
  aanbetalingVervaldatum: IsoDatum | null
  restVervaldatum: IsoDatum
  betalingen: { soort: "aanbetaling" | "volledig"; bedragCent: Cent; datum: IsoDatum }[]
  afgerond: boolean
}

/**
 * Hoe een regel uit de oude administratie in de nieuwe workflow landt.
 * Afgelopen verblijven kunnen als afgerond worden gemarkeerd (aangifte al gedaan).
 */
export function importPlan(r: ImportRij, vandaag: IsoDatum, opties: { verledenAfronden: boolean; aanbetalingPct: number; termijnMaanden: number; restWeken: number }): ImportPlan {
  const factuurdatum = r.aanvraagdatum && r.aanvraagdatum <= vandaag ? r.aanvraagdatum : (r.aankomst < vandaag ? r.aankomst : vandaag)
  const betaalwijze = r.betaalstatus === "betaald" && r.vertrek < vandaag ? "ineens" : "aanbetaling"
  const aanbetalingCent = betaalwijze === "aanbetaling" ? percentageVan(r.totaalCent, opties.aanbetalingPct) : 0
  const restVervaldatum = plusDagen(r.aankomst, -7 * opties.restWeken)
  const betalingen: ImportPlan["betalingen"] = []
  if (r.betaalstatus === "betaald") betalingen.push({ soort: "volledig", bedragCent: r.totaalCent, datum: restVervaldatum < vandaag ? restVervaldatum : vandaag })
  else if (r.betaalstatus === "aanbetaling") betalingen.push({ soort: "aanbetaling", bedragCent: aanbetalingCent, datum: factuurdatum })

  const voorbij = r.vertrek < vandaag
  const afgerond = voorbij && opties.verledenAfronden && r.betaalstatus === "betaald"
  const status = afgerond
    ? "afgerond"
    : voorbij
      ? "verblijf"
      : r.betaalstatus === "betaald"
        ? "volledig_betaald"
        : r.betaalstatus === "aanbetaling"
          ? "aanbetaling_ontvangen"
          : "factuur_verstuurd"
  return {
    status,
    betaalwijze,
    factuurdatum,
    aanbetalingCent,
    aanbetalingVervaldatum: betaalwijze === "aanbetaling" ? plusMaanden(factuurdatum, opties.termijnMaanden) : null,
    restVervaldatum,
    betalingen,
    afgerond,
  }
}
