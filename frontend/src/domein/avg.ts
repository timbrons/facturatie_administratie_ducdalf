import { plusMaanden, type IsoDatum } from "./datum"

// AVG: persoonsgegevens van huurders niet langer bewaren dan nodig. Facturen
// en betalingen blijven bewaard (fiscale bewaarplicht); de factuur-PDF's en
// hun vastgelegde gegevens worden niet aangepast.

export interface AvgHuurder { id: string; geanonimiseerd_op: string }
export interface AvgBoeking { huurder: string; vertrek: IsoDatum; status: string }

/** Grensdatum: verblijven met vertrek vóór deze datum vallen buiten de bewaartermijn. */
export function bewaargrens(vandaag: IsoDatum, jaren: number): IsoDatum {
  return plusMaanden(vandaag, -12 * jaren)
}

/**
 * Huurders die geanonimiseerd mogen worden: nog niet geanonimiseerd, en het
 * laatste (niet-geannuleerde of geannuleerde) verblijf ligt vóór de bewaargrens.
 * Huurders zonder enig verblijf vallen er niet onder (die beoordeel je zelf).
 */
export function teAnonimiseren(huurders: AvgHuurder[], boekingen: AvgBoeking[], vandaag: IsoDatum, jaren: number): string[] {
  const grens = bewaargrens(vandaag, jaren)
  return huurders
    .filter((h) => !h.geanonimiseerd_op)
    .filter((h) => {
      const eigen = boekingen.filter((b) => b.huurder === h.id)
      return eigen.length > 0 && eigen.every((b) => b.vertrek < grens)
    })
    .map((h) => h.id)
}

/** Velden van een huurder na anonimiseren. */
export const GEANONIMISEERDE_HUURDER = {
  aanhef: "",
  voornaam: "Geanonimiseerd",
  achternaam: "",
  email: "",
  telefoon_mobiel: "",
  telefoon_vast: "",
  adres: "",
  postcode: "",
  plaats: "",
  kenteken: "",
  notities: "",
}
