import { pb } from "./pb"
import { heeftRecht, SCOPES } from "./gmail"
import { kopieNaarDrive } from "./facturen"
import type { Factuur, Instellingen } from "./types"

// Automatische kopie van facturen in Google Drive: elke definitieve factuur
// met een PDF die nog niet in Drive staat, gaat er vanzelf heen. Draait op de
// achtergrond zodra er een Google-sleutel is (vaste koppeling op de NAS), en
// na acties die een nieuwe PDF opleveren. Mislukt er iets, dan volgt een
// nieuwe poging bij de volgende keer.

let bezig: Promise<number> | null = null

export function synchroniseerDrive(): Promise<number> {
  bezig ??= uitvoeren().finally(() => { bezig = null })
  return bezig
}

async function uitvoeren(): Promise<number> {
  if (!heeftRecht(SCOPES.drive)) return 0
  const inst = await pb.collection("instellingen").getFirstListItem<Instellingen>("")
  if (!inst.drive_kopie) return 0
  const lijst = await pb.collection("facturen").getFullList<Factuur>({ filter: 'nummer != "" && pdf != "" && drive_id = ""', sort: "nummer" })
  let gekopieerd = 0
  for (const f of lijst) {
    try {
      // Opnieuw ophalen: misschien heeft iemand anders hem net gekopieerd.
      const vers = await pb.collection("facturen").getOne<Factuur>(f.id)
      if (vers.drive_id) continue
      await kopieNaarDrive(vers, inst)
      gekopieerd++
    } catch (err) {
      console.warn(`Kopie van factuur ${f.nummer} naar Google Drive mislukt`, err)
    }
  }
  return gekopieerd
}
