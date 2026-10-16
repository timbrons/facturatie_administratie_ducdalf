import { pb } from "./pb"
import { zetInDrive } from "./drive"
import { huurderNaam, type Boeking, type Instellingen } from "./types"
import { parkkostenBestandsnaam, parkkostenMap } from "../domein/bestandsnamen"

// De factuur van Parc le Duc (parkkosten) bij een boeking: bekijken en een
// kopie in Google Drive (map "Parkkosten PLD/<jaar>").

/** Adres om de factuur van PLD te bekijken (beschermd bestand: met token). */
export async function parkkostenFactuurUrl(b: Pick<Boeking, "id" | "collectionId" | "collectionName" | "parkkosten_factuur">): Promise<string> {
  const token = await pb.files.getToken()
  return pb.files.getURL(b as unknown as Boeking, b.parkkosten_factuur, { token })
}

/** Opent de factuur van PLD in een nieuw tabblad (venster meteen openen, binnen de klik). */
export async function openParkkostenFactuur(b: Pick<Boeking, "id" | "collectionId" | "collectionName" | "parkkosten_factuur">): Promise<void> {
  const venster = window.open("", "_blank")
  const url = await parkkostenFactuurUrl(b).catch(() => null)
  if (venster && url) venster.location.href = url
  else venster?.close()
}

/** Zet de factuur van PLD in Google Drive en onthoudt de link bij de boeking. */
export async function kopieParkkostenNaarDrive(b: Boeking, inst: Instellingen): Promise<void> {
  if (!b.parkkosten_factuur) return
  const inhoud = await (await fetch(await parkkostenFactuurUrl(b))).blob()
  const naam = parkkostenBestandsnaam(b.aankomst, b.expand?.huurder?.achternaam || huurderNaam(b.expand?.huurder), b.parkkosten_factuur)
  const bestand = await zetInDrive(parkkostenMap(inst.drive_map, b.aankomst), naam, inhoud, inhoud.type || "application/pdf")
  await pb.collection("boekingen").update(b.id, { parkkosten_drive_id: bestand.id, parkkosten_drive_link: bestand.webViewLink })
}
