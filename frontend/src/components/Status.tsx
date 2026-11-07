import { Label } from "./ui"
import { labelVoor, type WorkflowStap } from "../domein/workflow"
import { nuTeDoen, type ActieBoeking } from "../domein/actielijst"
import { vandaag } from "../domein/datum"

/**
 * Waar een boeking nu staat: wat er te doen is of waarop we wachten (bijv.
 * "Wachten op de aanbetaling"), niet het label van de laatst afgeronde stap.
 * Die staat in de tooltip.
 */
export function StatusLabel({ boeking: b, stappen }: { boeking: Omit<ActieBoeking, "naam"> & { optie?: boolean }; stappen: WorkflowStap[] }) {
  const afgerond = labelVoor(stappen, b.status)
  const klaar = b.status === "geannuleerd" || b.status === "afgerond"
  const nu = klaar ? null : nuTeDoen(stappen, { ...b, naam: "" }, vandaag())
  const kleur = b.status === "geannuleerd" ? "grijs" : klaar ? "olijf" : nu?.wachten ? "zand" : "goud"
  return (
    <span className="inline-flex flex-wrap gap-1" title={klaar ? undefined : `Laatst afgerond: ${afgerond}`}>
      <Label kleur={kleur}>{nu?.titel ?? afgerond}</Label>
      {b.optie && <Label kleur="oranje">Optie</Label>}
    </span>
  )
}
