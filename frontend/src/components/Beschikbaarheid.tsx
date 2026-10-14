import { useState } from "react"
import { dagenTussen, datumVan, jaarVan, maandNaam, maandVan, plusDagen, plusMaanden, vandaag, weekdag, type IsoDatum } from "../domein/datum"
import { minNachtenVanaf, nachtBezet, periodeVrij, type Periode, type Regels } from "../domein/boekingsformulier"

// Kalender voor het boekingsformulier: bezette nachten zijn niet te kiezen.
// Eerste klik = aankomst, tweede klik = vertrek.

interface Props {
  bezet: Periode[]
  regels: Regels
  aankomst: string
  vertrek: string
  kies: (aankomst: string, vertrek: string) => void
}

const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"]

export function Beschikbaarheid({ bezet, regels, aankomst, vertrek, kies }: Props) {
  const nu = vandaag()
  const [start, setStart] = useState(() => datumVan(jaarVan(aankomst || nu), maandVan(aankomst || nu), 1))
  const eersteMaand = datumVan(jaarVan(nu), maandVan(nu), 1)
  const laatsteMaand = plusMaanden(eersteMaand, 23)
  const kiestVertrek = !!aankomst && !vertrek

  function klik(d: IsoDatum) {
    if (kiestVertrek && d > aankomst) {
      if (periodeVrij(aankomst, d, bezet)) return kies(aankomst, d)
    }
    if (!nachtBezet(d, bezet) && d >= nu) kies(d, "")
  }

  function status(d: IsoDatum) {
    const verleden = d < nu
    const bezetteNacht = nachtBezet(d, bezet)
    const gekozen = !!aankomst && (d === aankomst || (!!vertrek && d > aankomst && d <= vertrek))
    // Als vertrekdag kiesbaar: na de aankomst, en alle nachten ertussen vrij.
    const alsVertrek = kiestVertrek && d > aankomst && periodeVrij(aankomst, d, bezet)
    const kiesbaar = !verleden && (alsVertrek || !bezetteNacht)
    const teKort = alsVertrek && dagenTussen(aankomst, d) < minNachtenVanaf(aankomst, regels)
    return { verleden, bezetteNacht, gekozen, kiesbaar, teKort }
  }

  const maanden = [start, plusMaanden(start, 1)]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button type="button" className="knop-klein" disabled={start <= eersteMaand} onClick={() => setStart(plusMaanden(start, -1))} aria-label="Vorige maand">←</button>
        <span className="text-sm text-zacht">
          {kiestVertrek ? "Kies je vertrekdatum" : aankomst && vertrek ? "Klik opnieuw om andere data te kiezen" : "Kies je aankomstdatum"}
        </span>
        <button type="button" className="knop-klein" disabled={start >= laatsteMaand} onClick={() => setStart(plusMaanden(start, 1))} aria-label="Volgende maand">→</button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {maanden.map((m, i) => (
          <div key={m} className={i === 1 ? "hidden sm:block" : ""}>
            <div className="mb-2 text-center font-serif text-lg text-inkt">{maandNaam(maandVan(m))} {jaarVan(m)}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-zacht">
              {DAGEN.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: (weekdag(m) + 6) % 7 }, (_, j) => <div key={`l${j}`} />)}
              {Array.from({ length: dagenTussen(m, plusMaanden(m, 1)) }, (_, j) => {
                const d = plusDagen(m, j)
                const s = status(d)
                const kleur = s.gekozen
                  ? "bg-goud text-white"
                  : s.verleden
                    ? "text-lijn"
                    : s.bezetteNacht && !s.kiesbaar
                      ? "bg-zand-donker/70 text-zacht line-through"
                      : s.teKort
                        ? "bg-white text-zacht"
                        : "bg-white text-inkt hover:bg-zand"
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!s.kiesbaar}
                    onClick={() => klik(d)}
                    title={s.teKort ? `Minimaal ${minNachtenVanaf(aankomst, regels)} nachten` : undefined}
                    className={`aspect-square text-sm transition-colors disabled:cursor-default ${kleur}`}
                  >
                    {j + 1}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zacht">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 border border-lijn bg-white" /> Beschikbaar</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-zand-donker/70" /> Bezet</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-goud" /> Jouw keuze</span>
      </div>
    </div>
  )
}
