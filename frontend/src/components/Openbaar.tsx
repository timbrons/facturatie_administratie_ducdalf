import type { ReactNode } from "react"
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
