import PocketBase, { ClientResponseError } from "pocketbase"
import { config } from "./config"

export const pb = new PocketBase(config.apiUrl)
// Meerdere gelijktijdige verzoeken naar dezelfde collectie niet automatisch annuleren.
pb.autoCancellation(false)

/** Is de fout een verbindingsprobleem (server/NAS niet bereikbaar)? */
export function isVerbindingsfout(err: unknown): boolean {
  return err instanceof ClientResponseError && err.status === 0 && !err.isAbort
}

/** Leesbare Nederlandse foutmelding voor een fout van PocketBase. */
export function foutmelding(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return "De server is niet bereikbaar. Je wijzigingen zijn niet opgeslagen; probeer het zo opnieuw."
    if (err.status === 401) return "Je sessie is verlopen. Log opnieuw in."
    if (err.status === 403) return err.response?.message || "Je hebt geen toegang tot deze actie."
    if (err.status === 404) return "Niet gevonden."
    const velden = err.response?.data as Record<string, { message: string }> | undefined
    if (velden && Object.keys(velden).length > 0) {
      return Object.entries(velden).map(([veld, f]) => `${veld}: ${f.message}`).join("; ")
    }
    return err.response?.message || err.message
  }
  return err instanceof Error ? err.message : String(err)
}
