import { isIsoDatum, type IsoDatum } from "./datum"
import { leesDatum } from "./importeren"

// Inzendingen van het aanmeldformulier (FormSubmit, template "table") lezen en
// aan de juiste boeking koppelen. Veldnamen zoals op
// vakantiehuis-ducdalf.nl/aanmelden/ (plus het verborgen veld "boekingscode").

export type Velden = Record<string, string>

function sleutel(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")
}

function decodeerEntiteiten(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function tekstVan(html: string): string {
  return decodeerEntiteiten(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim()
}

/** Leest de velden uit een FormSubmit-mail (HTML-tabel of platte tekst "veld: waarde"). */
export function leesVelden(inhoud: { html?: string; tekst?: string }): Velden {
  const velden: Velden = {}
  if (inhoud.html) {
    for (const rij of inhoud.html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cellen = (rij.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map(tekstVan)
      if (cellen.length >= 2 && cellen[0]) {
        const k = sleutel(cellen[0])
        if (k && !["name", "naam_veld", "field"].includes(k) && !(k === "naam" && cellen[cellen.length - 1].toLowerCase() === "waarde")) {
          velden[k] = cellen[cellen.length - 1]
        }
      }
    }
  }
  if (Object.keys(velden).length === 0 && inhoud.tekst) {
    for (const regel of inhoud.tekst.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z][\w \-]*?)\s*:\s*(.*)$/.exec(regel)
      if (m) velden[sleutel(m[1])] = m[2].trim()
    }
  }
  return velden
}

export interface Persoon { naam: string; geboortedatum: IsoDatum | null; geboorteplaats: string }

export interface Aanmelding {
  boekingscode: string
  aankomst: IsoDatum | null
  vertrek: IsoDatum | null
  aantalPersonen: number | null
  aanhef: string
  voornaam: string
  achternaam: string
  adres: string
  postcode: string
  plaats: string
  telefoonVast: string
  telefoonMobiel: string
  email: string
  kenteken: string
  paspoort: string
  geboortedatum: IsoDatum | null
  geboorteplaats: string
  extraPersonen: Persoon[]
  noodcontact: { naam: string; telefoonVast: string; telefoonMobiel: string; email: string }
  opmerkingen: string
}

const leeg = (s: string | undefined) => (s ?? "").trim().replace(/^-$/, "")

function datum(s: string | undefined): IsoDatum | null {
  const t = leeg(s)
  if (!t) return null
  return isIsoDatum(t) ? t : leesDatum(t)
}

export function maakAanmelding(v: Velden): Aanmelding {
  const extra: Persoon[] = []
  for (let i = 1; i <= 10; i++) {
    const naam = leeg(v[`extra_persoon_${i}_naam`])
    const gd = datum(v[`extra_persoon_${i}_geboortedatum`])
    const gp = leeg(v[`extra_persoon_${i}_geboorteplaats`])
    if (naam || gd || gp) extra.push({ naam, geboortedatum: gd, geboorteplaats: gp })
  }
  const aantal = Number(leeg(v.aantal_personen))
  return {
    boekingscode: leeg(v.boekingscode ?? v.boeking),
    aankomst: datum(v.aankomstdatum),
    vertrek: datum(v.vertrekdatum),
    aantalPersonen: Number.isFinite(aantal) && aantal > 0 ? aantal : null,
    aanhef: leeg(v.aanhef),
    voornaam: leeg(v.voornaam),
    achternaam: leeg(v.achternaam),
    adres: leeg(v.adres),
    postcode: leeg(v.postcode).toUpperCase(),
    plaats: leeg(v.plaats),
    telefoonVast: leeg(v.telefoon_vast),
    telefoonMobiel: leeg(v.telefoon_mobiel),
    email: leeg(v.email).toLowerCase(),
    kenteken: leeg(v.kenteken_auto ?? v.kenteken).toUpperCase(),
    paspoort: leeg(v.nummer_paspoort),
    geboortedatum: datum(v.geboortedatum),
    geboorteplaats: leeg(v.geboorteplaats),
    extraPersonen: extra,
    noodcontact: {
      naam: leeg(v.noodcontact_naam),
      telefoonVast: leeg(v.noodcontact_telefoon_vast),
      telefoonMobiel: leeg(v.noodcontact_telefoon_mobiel),
      email: leeg(v.noodcontact_email),
    },
    opmerkingen: leeg(v.opmerkingen),
  }
}

/** Leeftijd in hele jaren op een datum. */
export function leeftijdOp(geboortedatum: IsoDatum, op: IsoDatum): number {
  const [gj, gm, gd] = geboortedatum.split("-").map(Number)
  const [j, m, d] = op.split("-").map(Number)
  return j - gj - (m < gm || (m === gm && d < gd) ? 1 : 0)
}

/**
 * Volwassenen en minderjarigen (jonger dan 18 op de aankomstdatum) volgens het
 * formulier. De invuller telt als volwassene; personen zonder geboortedatum
 * tellen als volwassene en worden apart gemeld.
 */
export function telPersonen(a: Aanmelding, aankomst: IsoDatum, volwassenVanaf = 18): { volwassenen: number; kinderen: number; onbekend: number } {
  let volwassenen = 1
  let kinderen = 0
  let onbekend = 0
  for (const p of a.extraPersonen) {
    if (!p.geboortedatum) { volwassenen++; onbekend++ }
    else if (leeftijdOp(p.geboortedatum, aankomst) >= volwassenVanaf) volwassenen++
    else kinderen++
  }
  return { volwassenen, kinderen, onbekend }
}

export interface KoppelBoeking { id: string; code: string; aankomst: string; vertrek: string; email: string; status: string }

export interface Kandidaat { boekingId: string; score: number; reden: string }

/** Welke boeking hoort bij deze aanmelding? Beste eerst. */
export function zoekBoeking(a: Aanmelding, boekingen: KoppelBoeking[]): Kandidaat[] {
  const uit: Kandidaat[] = []
  for (const b of boekingen) {
    if (b.status === "geannuleerd") continue
    const zelfdeEmail = !!a.email && b.email.toLowerCase() === a.email
    const zelfdeAankomst = !!a.aankomst && a.aankomst === b.aankomst
    const zelfdeVertrek = !!a.vertrek && a.vertrek === b.vertrek
    if (a.boekingscode && a.boekingscode === b.code) uit.push({ boekingId: b.id, score: 100, reden: "boekingscode" })
    else if (zelfdeEmail && zelfdeAankomst) uit.push({ boekingId: b.id, score: 80, reden: "e-mailadres en aankomstdatum" })
    else if (zelfdeAankomst && zelfdeVertrek) uit.push({ boekingId: b.id, score: 60, reden: "aankomst- en vertrekdatum" })
    else if (zelfdeEmail) uit.push({ boekingId: b.id, score: 40, reden: "e-mailadres" })
  }
  return uit.sort((x, y) => y.score - x.score)
}
