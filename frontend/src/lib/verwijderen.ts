import { pb } from "./pb"
import { googleFetch, SCOPES, zorgVoorGoogle } from "./gmail"
import type { Factuur } from "./types"

export interface VerwijderResultaat {
  boekingen: number
  facturen: number
  betalingen: number
  mails: number
  /** Maandaangiften toeristenbelasting zonder overgebleven verblijf */
  aangiften: number
  /** Factuurnummers die weer vrijkomen (de nummerreeks is teruggezet) */
  teruggezet: string[]
  /** Kopieën in Google Drive die niet konden worden verwijderd */
  driveOver: string[]
}

/**
 * Verwijdert een huurder met alles wat erbij hoort. Eerst de kopieën in
 * Google Drive (de app mag alleen haar eigen bestanden verwijderen), daarna
 * in één transactie op de server: boekingen, facturen, betalingen,
 * statushistorie en maillog.
 */
export async function verwijderHuurder(huurderId: string, facturen: Factuur[], afzender?: string): Promise<VerwijderResultaat> {
  const driveOver: string[] = []
  const inDrive = facturen.filter((f) => f.drive_id)
  if (inDrive.length > 0) {
    try {
      await zorgVoorGoogle(afzender, SCOPES.drive)
      for (const f of inDrive) {
        const res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.drive_id)}`, { method: "DELETE" }).catch(() => null)
        if (!res || (!res.ok && res.status !== 404)) driveOver.push(f.drive_link || f.nummer)
      }
    } catch {
      driveOver.push(...inDrive.map((f) => f.drive_link || f.nummer))
    }
  }
  const r = await pb.send<Omit<VerwijderResultaat, "driveOver">>(`/api/ducdalf/huurders/${huurderId}/verwijderen`, { method: "POST" })
  return { ...r, driveOver }
}

/**
 * Verwijdert één (nooit verstuurde) factuur. Eerst de kopie in Google Drive,
 * dan de factuur zelf op de server; die controleert of het mag (geen
 * betalingen, laatste nummer van het jaar). Geeft de Drive-link terug als de
 * kopie niet kon worden verwijderd.
 */
export async function verwijderFactuur(f: Factuur, afzender?: string): Promise<{ driveOver: string | null }> {
  let driveOver: string | null = null
  if (f.drive_id) {
    try {
      await zorgVoorGoogle(afzender, SCOPES.drive)
      const res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.drive_id)}`, { method: "DELETE" }).catch(() => null)
      if (!res || (!res.ok && res.status !== 404)) driveOver = f.drive_link || f.nummer
    } catch {
      driveOver = f.drive_link || f.nummer
    }
  }
  await pb.send(`/api/ducdalf/facturen/${f.id}/verwijderen`, { method: "POST" })
  return { driveOver }
}
