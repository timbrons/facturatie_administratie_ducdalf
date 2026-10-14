import { useEffect, useRef, useState, type ReactNode } from "react"
import { ClientResponseError } from "pocketbase"
import { config } from "../lib/config"
import { pb } from "../lib/pb"
import { Merk } from "../components/Layout"
import { Melding } from "../components/ui"
import { formatLang, isIsoDatum, plusDagen, vandaag } from "../domein/datum"
import {
  alsVerzending, controleer, LEEG_FORMULIER, MAX_PERSONEN, pasMeereizendenAan,
  type Formulier, type Fouten, type Meereiziger,
} from "../domein/aanmeldformulier"

// Openbaar aanmeldformulier voor huurders (zonder inloggen). Te bereiken via
// <app>/aanmelden/ of <app>/#/aanmelden, met ?boeking=<code> uit de mail.

const WEBSITE = "https://vakantiehuis-ducdalf.nl"
const FOTO = `${import.meta.env.BASE_URL}inloggen.jpg`

interface Vooraf { aankomst: string; vertrek: string; personen: number; al_ontvangen: boolean }

function leesCode(): string {
  const zoek = window.location.hash.split("?")[1] ?? window.location.search.slice(1)
  return (new URLSearchParams(zoek).get("boeking") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40)
}

export function Aanmelden() {
  const [code] = useState(leesCode)
  const [f, setF] = useState<Formulier>(LEEG_FORMULIER)
  const [fouten, setFouten] = useState<Fouten>({})
  const [vooraf, setVooraf] = useState<Vooraf | null>(null)
  const [bezig, setBezig] = useState(false)
  const [algemeneFout, setAlgemeneFout] = useState("")
  const [klaar, setKlaar] = useState(false)
  const [website, setWebsite] = useState("")
  const geopend = useRef(Date.now())
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    document.title = "Aanmelden — Duc’dalf"
    if (!code) return
    pb.send<Vooraf>(`/api/ducdalf/aanmelden/${code}`, { requestKey: null })
      .then((v) => {
        setVooraf(v)
        setF((oud) => ({
          ...oud,
          aankomstdatum: oud.aankomstdatum || (isIsoDatum(v.aankomst) ? v.aankomst : ""),
          vertrekdatum: oud.vertrekdatum || (isIsoDatum(v.vertrek) ? v.vertrek : ""),
          aantal_personen: oud.aantal_personen || (v.personen >= 1 && v.personen <= MAX_PERSONEN ? String(v.personen) : ""),
          extra_personen: oud.aantal_personen ? oud.extra_personen : pasMeereizendenAan(oud.extra_personen, String(v.personen)),
        }))
      })
      .catch(() => setVooraf(null))
  }, [code])

  function zet<K extends keyof Formulier>(veld: K, waarde: Formulier[K]) {
    setF((oud) => {
      const nieuw = { ...oud, [veld]: waarde }
      if (veld === "aantal_personen") nieuw.extra_personen = pasMeereizendenAan(oud.extra_personen, String(waarde))
      return nieuw
    })
    if (fouten[veld as string]) setFouten(({ [veld as string]: _weg, ...rest }) => rest)
  }

  function zetPersoon(i: number, veld: keyof Meereiziger, waarde: string) {
    setF((oud) => ({ ...oud, extra_personen: oud.extra_personen.map((p, j) => (j === i ? { ...p, [veld]: waarde } : p)) }))
    const sleutel = `extra_persoon_${i + 1}_${veld}`
    if (fouten[sleutel]) setFouten(({ [sleutel]: _weg, ...rest }) => rest)
  }

  function toonFouten(nieuw: Fouten) {
    setFouten(nieuw)
    // Naar het eerste veld met een fout.
    requestAnimationFrame(() => {
      const veld = formRef.current?.querySelector(".veld-fout")
      veld?.scrollIntoView({ behavior: "smooth", block: "center" })
      veld?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true })
    })
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault()
    setAlgemeneFout("")
    const nieuw = controleer(f, vandaag())
    if (Object.keys(nieuw).length) {
      toonFouten(nieuw)
      return
    }
    setBezig(true)
    try {
      await pb.send("/api/ducdalf/aanmelden", {
        method: "POST",
        body: alsVerzending(f, code, Date.now() - geopend.current, website),
        requestKey: null,
      })
      setKlaar(true)
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 400 && err.response?.fouten) {
        toonFouten(err.response.fouten as Fouten)
        if (err.response.fouten.extra_personen) setAlgemeneFout(String(err.response.fouten.extra_personen))
      } else if (err instanceof ClientResponseError && err.status === 429) {
        setAlgemeneFout("Er zijn vanaf je verbinding te veel formulieren verstuurd. Probeer het over tien minuten opnieuw.")
      } else {
        setAlgemeneFout("Het versturen is niet gelukt. Controleer je internetverbinding en probeer het opnieuw. Lukt het niet, mail ons dan.")
      }
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="min-h-screen bg-creme">
      <div className="relative h-56 sm:h-72">
        <img src={FOTO} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_45%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-inkt/50 via-inkt/10 to-inkt/40" />
        <div className="absolute left-5 top-5 sm:left-10 sm:top-8"><Merk licht /></div>
        <div className="absolute bottom-6 left-5 right-5 sm:bottom-8 sm:left-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">Aanmeldformulier</div>
          <h1 className="mt-1 text-white">Welkom in Duc’dalf</h1>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        {klaar ? (
          <div className="kaart">
            <div className="wenkbrauw mb-3">Ontvangen</div>
            <h2 className="mb-3 text-3xl">Bedankt{f.voornaam ? `, ${f.voornaam}` : ""}!</h2>
            <p className="mb-6">
              We hebben je aanmelding goed ontvangen. We nemen contact met je op als er nog iets nodig is.
              We wensen je alvast een fijn verblijf in de Languedoc.
            </p>
            <a href={WEBSITE} className="knop">Naar de website</a>
          </div>
        ) : (
          <form ref={formRef} onSubmit={verstuur} noValidate className="flex flex-col gap-8">
            <div className="flex flex-col gap-3 text-tekst">
              <p>
                Fijn dat je ons huis wilt huren! Via dit formulier geef je de gegevens door die we voor jouw verblijf en de registratie
                bij Parc le Duc nodig hebben.
              </p>
              <p>Velden met een <span className="text-rood">*</span> zijn verplicht.</p>
            </div>

            {vooraf && !vooraf.al_ontvangen && (
              <Melding soort="info">
                Dit formulier hoort bij je verblijf van <strong>{formatLang(vooraf.aankomst)}</strong> tot <strong>{formatLang(vooraf.vertrek)}</strong>.
                De datums zijn alvast ingevuld.
              </Melding>
            )}
            {vooraf?.al_ontvangen && (
              <Melding soort="waarschuwing">
                We hebben voor dit verblijf al een aanmeldformulier ontvangen. Wil je iets wijzigen? Vul het formulier dan opnieuw in;
                wij verwerken de wijziging.
              </Melding>
            )}

            {/* Valkuil voor robots: mensen zien dit veld niet. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>

            <Sectie titel="Huurperiode">
              <div className="grid gap-4 sm:grid-cols-3">
                <Veld label="Aankomstdatum" verplicht fout={fouten.aankomstdatum}>
                  <input type="date" value={f.aankomstdatum} min={vandaag()} onChange={(e) => zet("aankomstdatum", e.target.value)} />
                </Veld>
                <Veld label="Vertrekdatum" verplicht fout={fouten.vertrekdatum}>
                  <input type="date" value={f.vertrekdatum} min={f.aankomstdatum ? plusDagen(f.aankomstdatum, 1) : vandaag()} onChange={(e) => zet("vertrekdatum", e.target.value)} />
                </Veld>
                <Veld label="Aantal personen" verplicht fout={fouten.aantal_personen} hint="Jezelf meegerekend">
                  <select value={f.aantal_personen} onChange={(e) => zet("aantal_personen", e.target.value)}>
                    <option value="">Kies…</option>
                    {Array.from({ length: MAX_PERSONEN }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
                  </select>
                </Veld>
              </div>
            </Sectie>

            <Sectie titel="Gegevens">
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
                <Veld label="Aanhef" verplicht fout={fouten.aanhef}>
                  <select value={f.aanhef} onChange={(e) => zet("aanhef", e.target.value)}>
                    <option value="">Kies…</option>
                    <option value="Dhr.">Dhr.</option>
                    <option value="Mevr.">Mevr.</option>
                  </select>
                </Veld>
                <Veld label="Voornaam" verplicht fout={fouten.voornaam}>
                  <input value={f.voornaam} autoComplete="given-name" onChange={(e) => zet("voornaam", e.target.value)} />
                </Veld>
                <Veld label="Achternaam" verplicht fout={fouten.achternaam}>
                  <input value={f.achternaam} autoComplete="family-name" onChange={(e) => zet("achternaam", e.target.value)} />
                </Veld>
              </div>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1.4fr]">
                <Veld label="Adres" verplicht fout={fouten.adres} hint="Straat en huisnummer">
                  <input value={f.adres} autoComplete="street-address" onChange={(e) => zet("adres", e.target.value)} />
                </Veld>
                <Veld label="Postcode" verplicht fout={fouten.postcode}>
                  <input value={f.postcode} autoComplete="postal-code" onChange={(e) => zet("postcode", e.target.value)} />
                </Veld>
                <Veld label="Woonplaats" verplicht fout={fouten.plaats}>
                  <input value={f.plaats} autoComplete="address-level2" onChange={(e) => zet("plaats", e.target.value)} />
                </Veld>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Veld label="E-mailadres" verplicht fout={fouten.email}>
                  <input type="email" value={f.email} autoComplete="email" onChange={(e) => zet("email", e.target.value)} />
                </Veld>
                <Veld label="Mobiel nummer" verplicht fout={fouten.telefoon_mobiel}>
                  <input type="tel" value={f.telefoon_mobiel} autoComplete="tel" onChange={(e) => zet("telefoon_mobiel", e.target.value)} />
                </Veld>
                <Veld label="Vast nummer" fout={fouten.telefoon_vast}>
                  <input type="tel" value={f.telefoon_vast} onChange={(e) => zet("telefoon_vast", e.target.value)} />
                </Veld>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Veld label="Geboortedatum" verplicht fout={fouten.geboortedatum}>
                  <input type="date" value={f.geboortedatum} max={vandaag()} autoComplete="bday" onChange={(e) => zet("geboortedatum", e.target.value)} />
                </Veld>
                <Veld label="Geboorteplaats" verplicht fout={fouten.geboorteplaats}>
                  <input value={f.geboorteplaats} onChange={(e) => zet("geboorteplaats", e.target.value)} />
                </Veld>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Veld label="Kenteken auto" fout={fouten.kenteken_auto}>
                  <input value={f.kenteken_auto} onChange={(e) => zet("kenteken_auto", e.target.value)} />
                </Veld>
                <Veld label="Nummer paspoort of ID-kaart" fout={fouten.nummer_paspoort}>
                  <input value={f.nummer_paspoort} onChange={(e) => zet("nummer_paspoort", e.target.value)} />
                </Veld>
              </div>
            </Sectie>

            {f.extra_personen.length > 0 && (
              <Sectie titel="Meereizende personen" intro="Vul voor iedereen die met je meereist de naam en geboortedatum in.">
                <div className="flex flex-col gap-4">
                  {f.extra_personen.map((p, i) => (
                    <div key={i} className="border-l-2 border-goud/50 pl-4">
                      <div className="mb-2 text-sm font-semibold text-inkt">Persoon {i + 2}</div>
                      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1.4fr]">
                        <Veld label="Naam" verplicht fout={fouten[`extra_persoon_${i + 1}_naam`]}>
                          <input value={p.naam} onChange={(e) => zetPersoon(i, "naam", e.target.value)} />
                        </Veld>
                        <Veld label="Geboortedatum" verplicht fout={fouten[`extra_persoon_${i + 1}_geboortedatum`]}>
                          <input type="date" value={p.geboortedatum} max={vandaag()} onChange={(e) => zetPersoon(i, "geboortedatum", e.target.value)} />
                        </Veld>
                        <Veld label="Geboorteplaats of -land" fout={fouten[`extra_persoon_${i + 1}_geboorteplaats`]}>
                          <input value={p.geboorteplaats} onChange={(e) => zetPersoon(i, "geboorteplaats", e.target.value)} />
                        </Veld>
                      </div>
                    </div>
                  ))}
                </div>
              </Sectie>
            )}

            <Sectie titel="In geval van nood waarschuwen" intro="Wie kunnen we bereiken als er tijdens je verblijf iets met je gebeurt?">
              <div className="grid gap-4 sm:grid-cols-2">
                <Veld label="Naam" verplicht fout={fouten.noodcontact_naam}>
                  <input value={f.noodcontact_naam} onChange={(e) => zet("noodcontact_naam", e.target.value)} />
                </Veld>
                <Veld label="E-mailadres" verplicht fout={fouten.noodcontact_email}>
                  <input type="email" value={f.noodcontact_email} onChange={(e) => zet("noodcontact_email", e.target.value)} />
                </Veld>
                <Veld label="Mobiel nummer" verplicht fout={fouten.noodcontact_telefoon_mobiel}>
                  <input type="tel" value={f.noodcontact_telefoon_mobiel} onChange={(e) => zet("noodcontact_telefoon_mobiel", e.target.value)} />
                </Veld>
                <Veld label="Vast nummer" fout={fouten.noodcontact_telefoon_vast}>
                  <input type="tel" value={f.noodcontact_telefoon_vast} onChange={(e) => zet("noodcontact_telefoon_vast", e.target.value)} />
                </Veld>
              </div>
            </Sectie>

            <Sectie titel="Vragen of opmerkingen">
              <Veld label="Type hier je bericht" fout={fouten.opmerkingen}>
                <textarea rows={4} value={f.opmerkingen} onChange={(e) => zet("opmerkingen", e.target.value)} />
              </Veld>
            </Sectie>

            {Object.keys(fouten).length > 0 && !algemeneFout && (
              <Melding soort="fout">Niet alle velden zijn goed ingevuld. Kijk de rood gemarkeerde velden na.</Melding>
            )}
            {algemeneFout && <Melding soort="fout">{algemeneFout}</Melding>}

            <div className="flex flex-col gap-4 border-t border-lijn pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zacht sm:max-w-md">
                We gebruiken je gegevens alleen voor je verblijf en de registratie bij Parc le Duc.
                Lees meer in onze <a href={`${config.apiUrl}/privacy`} target="_blank" rel="noreferrer">privacyverklaring</a>.
              </p>
              <button type="submit" className="knop px-8 py-3.5" disabled={bezig}>
                {bezig ? "Versturen…" : "Aanmelding versturen"}
              </button>
            </div>
          </form>
        )}
      </main>

      <footer className="border-t border-lijn bg-zand">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-6 text-sm text-zacht sm:flex-row sm:justify-between sm:px-8">
          <Merk />
          <a href={WEBSITE} className="text-zacht">vakantiehuis-ducdalf.nl</a>
        </div>
      </footer>
    </div>
  )
}

function Sectie({ titel, intro, children }: { titel: string; intro?: string; children: ReactNode }) {
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

function Veld({ label, verplicht, fout, hint, children }: { label: string; verplicht?: boolean; fout?: string; hint?: string; children: ReactNode }) {
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
