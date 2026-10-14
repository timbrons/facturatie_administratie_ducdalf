import { useState, type ReactNode } from "react"
import { Merk } from "./Layout"

// Gedeelde opmaak voor de openbare pagina's (aanmeldformulier,
// boekingsformulier): foto met titel, secties, velden en voettekst.

export const WEBSITE = "https://vakantiehuis-ducdalf.nl"
const FOTO = `${import.meta.env.BASE_URL}inloggen.jpg`

export function OpenbarePagina({ titel, breed = false, children }: { titel: string; breed?: boolean; children: ReactNode }) {
  const breedte = breed ? "max-w-5xl" : "max-w-3xl"
  return (
    <div className="min-h-screen bg-creme">
      <div className="relative h-56 sm:h-72">
        <img src={FOTO} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_45%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-inkt/50 via-inkt/10 to-inkt/40" />
        <div className="absolute left-5 top-5 sm:left-10 sm:top-8"><a href={WEBSITE} className="no-underline"><Merk licht /></a></div>
        <div className="absolute bottom-6 left-5 right-5 sm:bottom-8 sm:left-10">
          <h1 className="text-white">{titel}</h1>
        </div>
      </div>

      <main className={`mx-auto w-full ${breedte} px-5 py-10 sm:px-8`}>{children}</main>

      <footer className="border-t border-lijn bg-zand">
        <div className={`mx-auto flex ${breedte} flex-col gap-2 px-5 py-6 text-sm text-zacht sm:flex-row sm:justify-between sm:px-8`}>
          <Merk />
          <a href={WEBSITE} className="text-zacht">vakantiehuis-ducdalf.nl</a>
        </div>
      </footer>
    </div>
  )
}

export function Sectie({ titel, intro, children }: { titel: string; intro?: string; children: ReactNode }) {
  return (
    <section className="kaart flex flex-col gap-4">
      <div>
        <h2>{titel}</h2>
        {intro && <p className="mt-1 text-sm text-zacht">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

export function Veld({ label, verplicht, fout, hint, children }: { label: string; verplicht?: boolean; fout?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${fout ? "veld-fout" : ""}`}>
      <span className="text-sm text-tekst">
        {label}
        {verplicht && <span className="text-rood"> *</span>}
      </span>
      {children}
      {fout ? <span className="text-xs text-rood">{fout}</span> : hint ? <span className="text-xs text-zacht">{hint}</span> : null}
    </label>
  )
}

/** Verborgen veld dat robots wel en mensen niet invullen. */
export function Valkuil({ waarde, zet }: { waarde: string; zet: (w: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>Website <input tabIndex={-1} autoComplete="off" value={waarde} onChange={(e) => zet(e.target.value)} /></label>
    </div>
  )
}

/** Scrolt naar het eerste veld met een fout en zet de cursor erin. */
export function naarEersteFout(form: HTMLElement | null) {
  requestAnimationFrame(() => {
    const veld = form?.querySelector(".veld-fout")
    veld?.scrollIntoView({ behavior: "smooth", block: "center" })
    veld?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true })
  })
}

// --- Pagina in de stijl van de website (menu, titelbalk en voettekst zoals
// op vakantiehuis-ducdalf.nl), voor het boekingsformulier. -----------------

const MENU = [
  { label: "Home", href: `${WEBSITE}/` },
  { label: "Het huis", href: `${WEBSITE}/huis/` },
  { label: "De omgeving", href: `${WEBSITE}/#omgeving` },
  { label: "Parc le Duc", href: `${WEBSITE}/#park` },
  { label: "Boeken", href: "", actief: true },
  { label: "Contact", href: `${WEBSITE}/#contact` },
]

function WebsiteMerk() {
  return (
    <span className="font-serif text-[1.05rem] font-medium tracking-[0.14em] text-[#3E3628] whitespace-nowrap">
      DUC’DALF<span className="mx-[0.35em] font-light text-[#B49366]">—</span>LANGUEDOC
    </span>
  )
}

export function WebsitePagina({ eyebrow, titel, intro, children }: { eyebrow: string; titel: string; intro?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const container = "mx-auto w-full max-w-[1200px] px-[clamp(1.25rem,3.5vw,2.4rem)]"
  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#3E3628]">
      <nav className="sticky top-0 z-50 bg-[#FAF6EE]/95 shadow-[0_1px_0_rgba(62,54,40,0.08)] backdrop-blur">
        <div className="relative grid grid-cols-[1fr_auto] items-center gap-6 px-[clamp(1.25rem,3.5vw,2.4rem)] py-[1.1rem] lg:grid-cols-[1fr_auto_1fr]">
          <a href={`${WEBSITE}/`} className="no-underline"><WebsiteMerk /></a>
          <div
            className={`${open ? "flex" : "hidden"} absolute inset-x-0 top-full flex-col gap-2.5 border-t border-[rgba(62,54,40,0.08)] bg-[#FAF6EE] px-6 pb-6 pt-4 text-center shadow-lg lg:static lg:flex lg:flex-row lg:justify-center lg:gap-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
          >
            {MENU.map((m) => (
              <a
                key={m.label}
                href={m.href || "#/boeken"}
                onClick={() => setOpen(false)}
                className={`py-3 text-base font-medium text-[#3E3628] no-underline lg:py-1.5 lg:text-[0.88rem] ${m.actief ? "lg:border-b lg:border-[#3E3628]/60" : "opacity-85 hover:opacity-100"}`}
              >
                {m.label}
              </a>
            ))}
          </div>
          <div className="hidden lg:block" />
          <button
            type="button"
            className="flex h-11 w-11 flex-col items-center justify-center lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {[0, 1, 2].map((i) => <span key={i} className="my-[3.5px] block h-[1.5px] w-[26px] bg-[#3E3628]" />)}
          </button>
        </div>
      </nav>

      <section className="border-b border-[rgba(62,54,40,0.08)] bg-[#F1E7D3] pb-[clamp(2rem,4vw,3rem)] pt-[clamp(3rem,6vw,5rem)]">
        <div className={container}>
          <span className="mb-3 block text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-[#7C6440]">{eyebrow}</span>
          <h1 className="m-0 max-w-[22ch] text-[clamp(2rem,4.5vw,3.6rem)] leading-[1.05]">{titel}</h1>
          {intro && <p className="mt-4 max-w-[52ch] text-[1.05rem] text-[#6B5F4B]">{intro}</p>}
        </div>
      </section>

      <main className={`${container} py-[clamp(3rem,6vw,5rem)]`}>{children}</main>

      <footer className="border-t border-[rgba(62,54,40,0.08)] pb-10 pt-12">
        <div className={`${container} flex flex-wrap items-center justify-between gap-4 text-[0.82rem] tracking-[0.06em] text-[#6B5F4B]`}>
          <WebsiteMerk />
          <div>
            Vakantiehuis in Parc le Duc, Vacquières<span className="mx-[0.6em] opacity-50">·</span>
            <a href={`${WEBSITE}/privacy/`} className="text-inherit no-underline hover:text-[#7C6440]">Privacyverklaring</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
