// Nette, veilige bestandsnamen voor kopieën in Google Drive en de export.

export function veiligeNaam(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

/** "2026-006 Jansen.pdf" of "2026-007 Jansen (credit).pdf" */
export function factuurBestandsnaam(nummer: string, achternaam: string, credit = false): string {
  const naam = veiligeNaam(achternaam)
  return `${nummer}${naam ? ` ${naam}` : ""}${credit ? " (credit)" : ""}.pdf`
}

/** Mappad in Drive voor een factuur: [hoofdmap, "Facturen", jaar] */
export function factuurMap(hoofdmap: string, nummer: string): string[] {
  return [veiligeNaam(hoofdmap) || "Duc'dalf verhuurbeheer", "Facturen", nummer.slice(0, 4)]
}

/** Mappad in Drive voor facturen van Parc le Duc: [hoofdmap, "Parkkosten PLD", jaar] */
export function parkkostenMap(hoofdmap: string, aankomst: string): string[] {
  return [veiligeNaam(hoofdmap) || "Duc'dalf verhuurbeheer", "Parkkosten PLD", aankomst.slice(0, 4)]
}

/** "2026-09-13 Jansen - parkkosten PLD.pdf" (vaste naam per boeking: een nieuwe factuur vervangt de oude) */
export function parkkostenBestandsnaam(aankomst: string, achternaam: string, origineel: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(origineel)?.[1]?.toLowerCase() ?? "pdf"
  const naam = veiligeNaam(achternaam)
  return `${aankomst}${naam ? ` ${naam}` : ""} - parkkosten PLD.${ext}`
}

export function tbMap(hoofdmap: string, periode: string): string[] {
  return [veiligeNaam(hoofdmap) || "Duc'dalf verhuurbeheer", "Toeristenbelasting", periode.slice(0, 4)]
}
