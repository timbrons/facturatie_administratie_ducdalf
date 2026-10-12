import { googleFetch, heeftRecht, SCOPES } from "./gmail"

// Kopieën in Google Drive (scope drive.file: de app ziet en beheert alleen de
// mappen en bestanden die hij zelf heeft aangemaakt).

const MAP = "application/vnd.google-apps.folder"
const mapCache = new Map<string, string>()

export function driveBeschikbaar(): boolean {
  return heeftRecht(SCOPES.drive)
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

async function zoekOfMaakMap(naam: string, ouder: string): Promise<string> {
  const sleutel = `${ouder}/${naam}`
  const bekend = mapCache.get(sleutel)
  if (bekend) return bekend
  const q = `name = '${escape(naam)}' and mimeType = '${MAP}' and '${ouder}' in parents and trashed = false`
  const res = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)
  const data = await res.json()
  let id: string | undefined = data.files?.[0]?.id
  if (!id) {
    const maak = await googleFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: naam, mimeType: MAP, parents: [ouder] }),
    })
    if (!maak.ok) throw new Error(`Map "${naam}" kon niet worden aangemaakt in Google Drive.`)
    id = (await maak.json()).id as string
  }
  mapCache.set(sleutel, id)
  return id
}

/** Zoekt of maakt het pad (bijv. ["Duc'dalf verhuurbeheer", "Facturen", "2026"]) en geeft het map-ID. */
export async function mapVoor(pad: string[]): Promise<string> {
  let ouder = "root"
  for (const naam of pad) ouder = await zoekOfMaakMap(naam, ouder)
  return ouder
}

export interface DriveBestand { id: string; webViewLink: string }

/** Zet een bestand in Drive. Bestaat er al een bestand met dezelfde naam in die map, dan wordt dat bijgewerkt. */
export async function zetInDrive(pad: string[], naam: string, inhoud: Blob, mimeType = "application/pdf"): Promise<DriveBestand> {
  const map = await mapVoor(pad)
  const q = `name = '${escape(naam)}' and '${map}' in parents and trashed = false`
  const bestaand = await (await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`)).json()
  const id: string | undefined = bestaand.files?.[0]?.id

  const grens = `ducdalf${Math.random().toString(36).slice(2)}`
  const meta = id ? { name: naam } : { name: naam, parents: [map] }
  const body = new Blob([
    `--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${grens}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    inhoud,
    `\r\n--${grens}--`,
  ])
  const url = id
    ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&fields=id,webViewLink`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink"
  const res = await googleFetch(url, { method: id ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${grens}` }, body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Uploaden naar Google Drive mislukt: ${data?.error?.message ?? res.statusText}`)
  }
  return res.json()
}
