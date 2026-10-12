import { pb } from "./pb"
import type { Boeking, MailLog } from "./types"
import { GEANONIMISEERDE_HUURDER } from "../domein/avg"

/**
 * Anonimiseert een huurder: contactgegevens, kenteken en het ingevulde
 * aanmeldformulier worden gewist, net als ontvanger en tekst in het maillog.
 * Facturen en betalingen blijven ongewijzigd (fiscale bewaarplicht).
 */
export async function anonimiseer(huurderId: string, boekingen: Boeking[], maillog: MailLog[]): Promise<void> {
  const eigen = boekingen.filter((b) => b.huurder === huurderId)
  for (const b of eigen) {
    await pb.collection("boekingen").update(b.id, { aanmelding: null, kenteken: "", notities: "" })
    for (const m of maillog.filter((x) => x.boeking === b.id && (x.aan || x.tekst))) {
      await pb.collection("mail_log").update(m.id, { aan: "", tekst: "" })
    }
  }
  await pb.collection("huurders").update(huurderId, { ...GEANONIMISEERDE_HUURDER, geanonimiseerd_op: new Date().toISOString() })
}
