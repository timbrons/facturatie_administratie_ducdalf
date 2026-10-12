// Datums zonder tijd worden overal als tekst "JJJJ-MM-DD" doorgegeven.
// Rekenen gebeurt met UTC-dagnummers, zodat zomertijd en tijdzones geen
// rol spelen.

export type IsoDatum = string

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
]
const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"]

const DAG_MS = 24 * 60 * 60 * 1000

export function isIsoDatum(s: unknown): s is IsoDatum {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [j, m, d] = delen(s)
  const dt = new Date(Date.UTC(j, m - 1, d))
  return dt.getUTCFullYear() === j && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function delen(s: IsoDatum): [number, number, number] {
  const [j, m, d] = s.slice(0, 10).split("-").map(Number)
  return [j, m, d]
}

function naarUtc(s: IsoDatum): number {
  const [j, m, d] = delen(s)
  return Date.UTC(j, m - 1, d)
}

function vanUtc(ms: number): IsoDatum {
  return new Date(ms).toISOString().slice(0, 10)
}

export function datumVan(j: number, m: number, d: number): IsoDatum {
  return vanUtc(Date.UTC(j, m - 1, d))
}

/** Datum van vandaag in de lokale tijdzone van de browser. */
export function vandaag(nu: Date = new Date()): IsoDatum {
  return datumVan(nu.getFullYear(), nu.getMonth() + 1, nu.getDate())
}

export function plusDagen(s: IsoDatum, dagen: number): IsoDatum {
  return vanUtc(naarUtc(s) + dagen * DAG_MS)
}

/** Tel maanden op; valt de dag buiten de maand, dan de laatste dag van die maand. */
export function plusMaanden(s: IsoDatum, maanden: number): IsoDatum {
  const [j, m, d] = delen(s)
  const doel = new Date(Date.UTC(j, m - 1 + maanden, 1))
  const laatste = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate()
  return datumVan(doel.getUTCFullYear(), doel.getUTCMonth() + 1, Math.min(d, laatste))
}

/** Aantal dagen van `van` tot `tot` (positief als `tot` later is). */
export function dagenTussen(van: IsoDatum, tot: IsoDatum): number {
  return Math.round((naarUtc(tot) - naarUtc(van)) / DAG_MS)
}

export function jaarVan(s: IsoDatum): number {
  return delen(s)[0]
}

export function maandVan(s: IsoDatum): number {
  return delen(s)[1]
}

export function weekdag(s: IsoDatum): number {
  return new Date(naarUtc(s)).getUTCDay()
}

/** Alle nachten van een verblijf: de datums van aankomst t/m de dag vóór vertrek. */
export function nachten(aankomst: IsoDatum, vertrek: IsoDatum): IsoDatum[] {
  const n = dagenTussen(aankomst, vertrek)
  const uit: IsoDatum[] = []
  for (let i = 0; i < n; i++) uit.push(plusDagen(aankomst, i))
  return uit
}

/** "17 oktober 2026" */
export function formatLang(s: IsoDatum | null | undefined): string {
  if (!s || !isIsoDatum(s.slice(0, 10))) return ""
  const [j, m, d] = delen(s)
  return `${d} ${MAANDEN[m - 1]} ${j}`
}

/** "za 17 okt 2026" */
export function formatMiddel(s: IsoDatum | null | undefined): string {
  if (!s || !isIsoDatum(s.slice(0, 10))) return ""
  const [j, m, d] = delen(s)
  return `${DAGEN[weekdag(s)].slice(0, 2)} ${d} ${MAANDEN_KORT[m - 1]} ${j}`
}

/** "27-6-2026" (zoals in de betaaltekst op de factuur) */
export function formatKort(s: IsoDatum | null | undefined): string {
  if (!s || !isIsoDatum(s.slice(0, 10))) return ""
  const [j, m, d] = delen(s)
  return `${d}-${m}-${j}`
}

export function maandNaam(maand: number): string {
  return MAANDEN[maand - 1]
}

export function dagNaam(dag: number): string {
  return DAGEN[dag]
}

/** Tijdstempel van PocketBase ("2026-10-12 10:55:27.714Z") als "12 oktober 2026, 12:55". */
export function formatTijdstip(ts: string | null | undefined): string {
  if (!ts) return ""
  const d = new Date(ts.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return ""
  const uur = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}, ${uur}:${min}`
}
