import { Label } from "./ui"
import { labelVoor, type WorkflowStap } from "../domein/workflow"

export function StatusLabel({ status, stappen, optie }: { status: string; stappen: WorkflowStap[]; optie?: boolean }) {
  const kleur =
    status === "geannuleerd" ? "grijs"
      : status === "afgerond" ? "olijf"
        : ["aanvraag", "in_afstemming"].includes(status) ? "zand"
          : status === "verblijf" ? "goud"
            : "olijf"
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Label kleur={kleur}>{labelVoor(stappen, status)}</Label>
      {optie && <Label kleur="oranje">Optie</Label>}
    </span>
  )
}
