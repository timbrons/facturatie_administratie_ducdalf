import { Label } from "./ui"
import { labelVoor, type WorkflowStap } from "../domein/workflow"
import { nuTeDoen, type ActieBoeking } from "../domein/actielijst"
import { vandaag } from "../domein/datum"

type StatusBoeking = Omit<ActieBoeking, "naam"> & { optie?: boolean }

/**
 * Waar een boeking nu staat: wat er te doen is of waarop we wachten (bijv.
 * "Wachten op de aanbetaling"), niet het label van de laatst afgeronde stap.
 */
export function huidigeStatus(b: StatusBoeking, stappen: WorkflowStap[]): { tekst: string; soort: "wachten" | "actie" | "klaar"; afgerond: string } {
  const afgerond = labelVoor(stappen, b.status)
  if (b.status === "geannuleerd" || b.status === "afgerond") return { tekst: afgerond, soort: "klaar", afgerond }
  const nu = nuTeDoen(stappen, { ...b, naam: "" }, vandaag())
  if (!nu) return { tekst: afgerond, soort: "klaar", afgerond }
  return { tekst: nu.titel, soort: nu.wachten ? "wachten" : "actie", afgerond }
}

/** Label met de huidige status; de laatst afgeronde stap staat in de tooltip. */
export function StatusLabel({ boeking: b, stappen }: { boeking: StatusBoeking; stappen: WorkflowStap[] }) {
  const h = huidigeStatus(b, stappen)
  const kleur = b.status === "geannuleerd" ? "grijs" : h.soort === "klaar" ? "olijf" : h.soort === "wachten" ? "zand" : "goud"
  return (
    <span className="inline-flex flex-wrap gap-1" title={h.soort === "klaar" ? undefined : `Laatst afgerond: ${h.afgerond}`}>
      <Label kleur={kleur}>{h.tekst}</Label>
      {b.optie && <Label kleur="oranje">Optie</Label>}
    </span>
  )
}
