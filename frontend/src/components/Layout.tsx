import { useState, type ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { pb } from "../lib/pb"
import { useServerBereikbaar } from "../lib/verbinding"

const MENU = [
  { naar: "/", label: "Overzicht" },
  { naar: "/boekingen", label: "Boekingen" },
  { naar: "/kalender", label: "Kalender" },
  { naar: "/huurders", label: "Huurders" },
  { naar: "/financieel", label: "Financieel" },
  { naar: "/prijzen", label: "Prijzen" },
  { naar: "/instellingen", label: "Instellingen" },
]

export function Merk({ licht = false }: { licht?: boolean }) {
  return (
    <span className={`font-serif text-[15px] font-medium uppercase tracking-[0.2em] ${licht ? "text-white" : "text-inkt"}`}>
      Duc’dalf <span className="mx-1 text-zacht">—</span> Languedoc
    </span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const bereikbaar = useServerBereikbaar()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-lijn bg-creme/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <NavLink to="/" className="no-underline"><Merk /></NavLink>
          <nav className="hidden items-center gap-6 lg:flex">
            {MENU.map((m) => (
              <NavLink
                key={m.naar}
                to={m.naar}
                end={m.naar === "/"}
                className={({ isActive }) => `text-sm no-underline ${isActive ? "text-inkt underline decoration-goud decoration-2 underline-offset-8" : "text-tekst hover:text-inkt"}`}
              >
                {m.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <NavLink to="/boekingen/nieuw" className="knop hidden sm:inline-flex">Nieuwe boeking</NavLink>
            <button
              type="button"
              className="p-2 lg:hidden"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <span className="block h-0.5 w-6 bg-inkt" />
              <span className="mt-1.5 block h-0.5 w-6 bg-inkt" />
              <span className="mt-1.5 block h-0.5 w-6 bg-inkt" />
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-lijn bg-creme px-4 py-2 lg:hidden">
            {[...MENU, { naar: "/boekingen/nieuw", label: "Nieuwe boeking" }].map((m) => (
              <NavLink
                key={m.naar}
                to={m.naar}
                end={m.naar === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `block py-2.5 no-underline ${isActive ? "text-inkt font-semibold" : "text-tekst"}`}
              >
                {m.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {!bereikbaar && (
        <div className="bg-rood px-4 py-2 text-center text-sm text-white" role="alert">
          De server is niet bereikbaar. Je ziet de laatst geladen gegevens; wijzigingen kunnen nu niet worden opgeslagen.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-lijn bg-zand">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-zacht sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Merk />
          <div className="flex items-center gap-4">
            <span>{pb.authStore.record?.email}</span>
            <button
              type="button"
              className="text-goud-tekst underline"
              onClick={() => {
                pb.authStore.clear()
                window.location.hash = "#/"
              }}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
