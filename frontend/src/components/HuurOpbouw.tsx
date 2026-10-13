import { formatEuro } from "../domein/geld"
import type { huurOpbouw } from "../domein/prijs"

/** De huur per seizoen, ingesprongen onder de huurregel (binnen een <dl>). */
export function HuurOpbouw({ regels, berekend }: { regels: ReturnType<typeof huurOpbouw>; berekend?: boolean }) {
  if (regels.length === 0) return null
  return (
    <>
      {berekend && <div className="pl-3 text-xs text-zacht"><dt>Berekend:</dt></div>}
      {regels.map((r) => (
        <div key={`${r.naam}|${r.prijsPerNachtCent}`} className="flex justify-between gap-3 pl-3 text-xs text-zacht">
          <dt>{r.nachten} {r.nachten === 1 ? "nacht" : "nachten"} {r.naam} à {formatEuro(r.prijsPerNachtCent)}</dt>
          <dd className="tabular-nums">{formatEuro(r.bedragCent)}</dd>
        </div>
      ))}
    </>
  )
}
