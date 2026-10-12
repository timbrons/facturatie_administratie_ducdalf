import { useEffect, useId, useState, type ReactNode } from "react"
import { foutmelding } from "../lib/pb"
import { formatBedrag, parseEuro, type Cent } from "../domein/geld"

export function Paginakop({ wenkbrauw, titel, children }: { wenkbrauw?: string; titel: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {wenkbrauw && <div className="wenkbrauw mb-2">{wenkbrauw}</div>}
        <h1>{titel}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Kaart({ titel, actie, children, className = "" }: { titel?: ReactNode; actie?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`kaart ${className}`}>
      {(titel || actie) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titel && <h2 className="text-xl">{titel}</h2>}
          {actie}
        </div>
      )}
      {children}
    </section>
  )
}

export function Veld({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs text-zacht">{hint}</span>}
    </label>
  )
}

export function Melding({ soort = "info", children }: { soort?: "info" | "waarschuwing" | "fout" | "succes"; children: ReactNode }) {
  const stijl = {
    info: "border-olijf bg-zand text-inkt",
    waarschuwing: "border-oranje bg-oranje-zacht text-inkt",
    fout: "border-rood bg-rood-zacht text-inkt",
    succes: "border-olijf bg-groen-zacht text-inkt",
  }[soort]
  return <div role={soort === "fout" ? "alert" : "status"} className={`border-l-2 px-4 py-3 text-sm ${stijl}`}>{children}</div>
}

export function Fout({ fout }: { fout: unknown }) {
  if (!fout) return null
  return <Melding soort="fout">{foutmelding(fout)}</Melding>
}

export function Laden({ tekst = "Laden…" }: { tekst?: string }) {
  return <div className="py-10 text-center text-zacht">{tekst}</div>
}

export function Label({ kleur = "zand", children }: { kleur?: "zand" | "goud" | "olijf" | "rood" | "oranje" | "grijs"; children: ReactNode }) {
  const stijl = {
    zand: "bg-zand text-inkt",
    goud: "bg-goud text-white",
    olijf: "bg-groen-zacht text-olijf-donker",
    rood: "bg-rood-zacht text-rood",
    oranje: "bg-oranje-zacht text-oranje",
    grijs: "bg-lijn/60 text-zacht",
  }[kleur]
  return <span className={`inline-block whitespace-nowrap px-2 py-0.5 text-xs font-medium ${stijl}`}>{children}</span>
}

/** Invoerveld voor een bedrag in euro's; geeft centen terug (of null als leeg). */
export function BedragVeld({
  waarde, onChange, placeholder, id,
}: { waarde: Cent | null; onChange: (cent: Cent | null) => void; placeholder?: string; id?: string }) {
  const [tekst, setTekst] = useState(waarde === null ? "" : formatBedrag(waarde))
  const [ongeldig, setOngeldig] = useState(false)
  useEffect(() => {
    // Alleen overnemen van buitenaf als de waarde echt anders is dan wat er staat.
    const huidig = parseEuro(tekst)
    if (huidig !== waarde) setTekst(waarde === null ? "" : formatBedrag(waarde))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waarde])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zacht">€</span>
      <input
        id={id}
        inputMode="decimal"
        className={`pl-7 ${ongeldig ? "border-rood" : ""}`}
        value={tekst}
        placeholder={placeholder}
        onChange={(e) => {
          setTekst(e.target.value)
          if (e.target.value.trim() === "") {
            setOngeldig(false)
            onChange(null)
            return
          }
          const c = parseEuro(e.target.value)
          setOngeldig(c === null)
          if (c !== null) onChange(c)
        }}
        onBlur={() => {
          const c = parseEuro(tekst)
          if (c !== null) setTekst(formatBedrag(c))
        }}
      />
    </div>
  )
}

export function KopieerKnop({ waarde, label = "Kopieer" }: { waarde: string; label?: string }) {
  const [gekopieerd, setGekopieerd] = useState(false)
  return (
    <button
      type="button"
      className="knop-klein"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(waarde)
          setGekopieerd(true)
          window.setTimeout(() => setGekopieerd(false), 1500)
        } catch {
          window.prompt("Kopieer deze waarde:", waarde)
        }
      }}
    >
      {gekopieerd ? "✓ Gekopieerd" : label}
    </button>
  )
}

export function Dialoog({ open, titel, onSluiten, children }: { open: boolean; titel: string; onSluiten: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSluiten()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [open, onSluiten])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-inkt/40 p-0 sm:items-center sm:p-4" onClick={onSluiten}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="max-h-[92vh] w-full overflow-y-auto bg-creme p-5 shadow-xl sm:max-w-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id}>{titel}</h2>
          <button type="button" className="text-2xl leading-none text-zacht" onClick={onSluiten} aria-label="Sluiten">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Gegeven({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col py-1 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-sm text-zacht">{label}</dt>
      <dd className="text-inkt">{children || <span className="text-zacht">—</span>}</dd>
    </div>
  )
}
