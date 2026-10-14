import { useEffect, useRef, useState } from "react"
import { ClientResponseError } from "pocketbase"
import { config } from "../lib/config"
import { pb } from "../lib/pb"
import { Melding } from "../components/ui"
import { naarEersteFout, OpenbarePagina, Sectie, Valkuil, Veld, WEBSITE } from "../components/Openbaar"
import { Beschikbaarheid } from "../components/Beschikbaarheid"
import { dagenTussen, formatLang, formatMiddel, vandaag } from "../domein/datum"
import { controleer, LEGE_AANVRAAG, minNachtenVanaf, type Aanvraag, type Periode, type Regels } from "../domein/boekingsformulier"

// Openbaar boekingsformulier (zonder inloggen). Te bereiken via <app>/boeken/
// of <app>/#/boeken. Een aanvraag wordt in de app direct een boeking met
// status "Aanvraag"; de gast krijgt geen automatische mail.

export function Boeken() {
  const [a, setA] = useState<Aanvraag>(LEGE_AANVRAAG)
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [bezet, setBezet] = useState<Periode[] | null>(null)
  const [regels, setRegels] = useState<Regels | null>(null)
  const [laadFout, setLaadFout] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [algemeneFout, setAlgemeneFout] = useState("")
  const [klaar, setKlaar] = useState(false)
  const [website, setWebsite] = useState("")
  const geopend = useRef(Date.now())
  const formRef = useRef<HTMLFormElement>(null)

  function laad() {
    return pb.send<{ bezet: Periode[]; regels: Regels }>("/api/ducdalf/boeken/beschikbaarheid", { requestKey: null })
      .then((r) => {
        setBezet(r.bezet)
        setRegels(r.regels)
        setLaadFout(false)
      })
      .catch(() => setLaadFout(true))
  }

  useEffect(() => {
    document.title = "Boeken — Duc’dalf"
    laad()
  }, [])

  function zet<K extends keyof Aanvraag>(veld: K, waarde: Aanvraag[K]) {
    setA((oud) => ({ ...oud, [veld]: waarde }))
    if (fouten[veld]) setFouten(({ [veld]: _weg, ...rest }) => rest)
  }

  function kiesData(aankomst: string, vertrek: string) {
    setA((oud) => ({ ...oud, aankomst, vertrek }))
    setFouten(({ aankomst: _a, vertrek: _v, ...rest }) => rest)
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault()
    setAlgemeneFout("")
    if (!regels || !bezet) return
    const nieuw = controleer(a, regels, bezet, vandaag())
    if (Object.keys(nieuw).length) {
      setFouten(nieuw)
      naarEersteFout(formRef.current)
      return
    }
    setBezig(true)
    try {
      await pb.send("/api/ducdalf/boeken", {
        method: "POST",
        body: {
          ...Object.fromEntries(Object.entries(a).map(([k, w]) => [k, w.trim()])),
          volwassenen: Number(a.volwassenen),
          kinderen: Number(a.kinderen || 0),
          invultijd: Date.now() - geopend.current,
          website,
        },
        requestKey: null,
      })
      setKlaar(true)
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 400 && err.response?.fouten) {
        setFouten(err.response.fouten as Record<string, string>)
        naarEersteFout(formRef.current)
        // Misschien is de periode net door iemand anders geboekt: beschikbaarheid verversen.
        if (err.response.fouten.aankomst) laad()
      } else if (err instanceof ClientResponseError && err.status === 429) {
        setAlgemeneFout("Er zijn vanaf je verbinding te veel aanvragen verstuurd. Probeer het over tien minuten opnieuw.")
      } else {
        setAlgemeneFout("Het versturen is niet gelukt. Controleer je internetverbinding en probeer het opnieuw. Lukt het niet, mail ons dan.")
      }
    } finally {
      setBezig(false)
    }
  }

  const nachten = a.aankomst && a.vertrek ? dagenTussen(a.aankomst, a.vertrek) : 0
  const maxPersonen = regels?.max_personen ?? 6

  return (
    <OpenbarePagina titel="Boekingsaanvraag" breed>
      {klaar ? (
        <div className="mx-auto max-w-3xl kaart">
          <div className="wenkbrauw mb-3">Ontvangen</div>
          <h2 className="mb-3 text-3xl">Bedankt{a.voornaam ? `, ${a.voornaam.trim()}` : ""}!</h2>
          <p className="mb-6">
            We hebben je aanvraag voor {formatLang(a.aankomst)} tot {formatLang(a.vertrek)} goed ontvangen. We nemen zo snel mogelijk
            contact met je op om de boeking verder af te stemmen.
          </p>
          <a href={WEBSITE} className="knop">Naar de website</a>
        </div>
      ) : (
        <form ref={formRef} onSubmit={verstuur} noValidate className="flex flex-col gap-8">
          <div className="flex flex-col gap-3 text-tekst">
            <p>
              Kies in de kalender je aankomst- en vertrekdatum en vul je gegevens in. Je aanvraag is nog geen definitieve boeking:
              we nemen zo snel mogelijk contact met je op om alles af te stemmen.
            </p>
            <p>Velden met een <span className="text-rood">*</span> zijn verplicht.</p>
          </div>

          <Valkuil waarde={website} zet={setWebsite} />

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            {/* Links de invulvelden, rechts de kalender (op de telefoon de kalender eerst). */}
            <div className="flex flex-col gap-8 lg:order-1 order-2">
              <Sectie titel="Gegevens">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Veld label="Voornaam" verplicht fout={fouten.voornaam}>
                    <input value={a.voornaam} autoComplete="given-name" onChange={(e) => zet("voornaam", e.target.value)} />
                  </Veld>
                  <Veld label="Achternaam" verplicht fout={fouten.achternaam}>
                    <input value={a.achternaam} autoComplete="family-name" onChange={(e) => zet("achternaam", e.target.value)} />
                  </Veld>
                  <Veld label="E-mailadres" verplicht fout={fouten.email}>
                    <input type="email" value={a.email} autoComplete="email" onChange={(e) => zet("email", e.target.value)} />
                  </Veld>
                  <Veld label="Telefoonnummer" fout={fouten.telefoon}>
                    <input type="tel" value={a.telefoon} autoComplete="tel" onChange={(e) => zet("telefoon", e.target.value)} />
                  </Veld>
                </div>
              </Sectie>
              <Sectie titel="Gezelschap">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Veld label="Volwassenen" verplicht fout={fouten.volwassenen} hint="18 jaar en ouder">
                    <select value={a.volwassenen} onChange={(e) => zet("volwassenen", e.target.value)}>
                      {Array.from({ length: maxPersonen }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
                    </select>
                  </Veld>
                  <Veld label="Kinderen" fout={fouten.kinderen} hint="Jonger dan 18 jaar">
                    <select value={a.kinderen} onChange={(e) => zet("kinderen", e.target.value)}>
                      {Array.from({ length: maxPersonen }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
                    </select>
                  </Veld>
                </div>
                <p className="text-xs text-zacht">Het huis is geschikt voor maximaal {maxPersonen} personen.</p>
              </Sectie>
              <Sectie titel="Vragen of opmerkingen">
                <Veld label="Type hier je bericht" fout={fouten.opmerkingen}>
                  <textarea rows={4} value={a.opmerkingen} onChange={(e) => zet("opmerkingen", e.target.value)} />
                </Veld>
              </Sectie>

              {Object.keys(fouten).length > 0 && !algemeneFout && (
                <Melding soort="fout">Niet alles is goed ingevuld. Kijk de rood gemarkeerde onderdelen na.</Melding>
              )}
              {algemeneFout && <Melding soort="fout">{algemeneFout}</Melding>}

              <div className="flex flex-col gap-4 border-t border-lijn pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zacht sm:max-w-md">
                  We gebruiken je gegevens alleen om je aanvraag af te handelen. Lees meer in onze{" "}
                  <a href={`${config.apiUrl}/privacy`} target="_blank" rel="noreferrer">privacyverklaring</a>.
                </p>
                <button type="submit" className="knop px-8 py-3.5" disabled={bezig || !regels}>
                  {bezig ? "Versturen…" : "Aanvraag versturen"}
                </button>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <Sectie titel="Beschikbaarheid" intro={regels?.min_nachten ? `Minimaal ${regels.min_nachten} nachten.` : undefined}>
                {laadFout ? (
                  <Melding soort="fout">
                    De beschikbaarheid kon niet worden geladen.{" "}
                    <button type="button" className="underline" onClick={laad}>Opnieuw proberen</button>
                  </Melding>
                ) : !bezet || !regels ? (
                  <p className="text-sm text-zacht">Beschikbaarheid laden…</p>
                ) : (
                  <Beschikbaarheid bezet={bezet} regels={regels} aankomst={a.aankomst} vertrek={a.vertrek} kies={kiesData} maanden={1} />
                )}
                <div className={`grid gap-4 border-t border-lijn pt-4 grid-cols-3 ${fouten.aankomst || fouten.vertrek ? "veld-fout" : ""}`}>
                  <div>
                    <div className="text-sm text-tekst">Aankomst <span className="text-rood">*</span></div>
                    <div className="font-serif text-base text-inkt sm:text-xl">{a.aankomst ? formatMiddel(a.aankomst) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-tekst">Vertrek <span className="text-rood">*</span></div>
                    <div className="font-serif text-base text-inkt sm:text-xl">{a.vertrek ? formatMiddel(a.vertrek) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-tekst">Nachten</div>
                    <div className="font-serif text-base text-inkt sm:text-xl">{nachten || "—"}</div>
                  </div>
                  {(fouten.aankomst || fouten.vertrek) && <div className="text-xs text-rood col-span-3">{fouten.aankomst || fouten.vertrek}</div>}
                  {a.aankomst && !a.vertrek && regels && !fouten.vertrek && (
                    <div className="text-xs text-zacht col-span-3">Vanaf deze datum verhuren we minimaal {minNachtenVanaf(a.aankomst, regels)} nachten.</div>
                  )}
                </div>
              </Sectie>
            </div>
          </div>
        </form>
      )}
    </OpenbarePagina>
  )
}
