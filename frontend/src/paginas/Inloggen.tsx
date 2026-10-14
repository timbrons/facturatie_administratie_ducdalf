import { useState } from "react"
import { config } from "../lib/config"
import { foutmelding, pb } from "../lib/pb"
import { Merk } from "../components/Layout"
import { Melding } from "../components/ui"

export function Inloggen() {
  const [fout, setFout] = useState("")
  const [bezig, setBezig] = useState(false)
  const [email, setEmail] = useState("")
  const [wachtwoord, setWachtwoord] = useState("")

  async function metGoogle() {
    setFout("")
    setBezig(true)
    // Het venster direct bij de klik openen, anders houdt de pop-upblokkering het tegen.
    const venster = openVenster()
    try {
      await pb.collection("users").authWithOAuth2({
        provider: "google",
        // Laat Google altijd de accountkeuze tonen, zodat je na een verkeerd account
        // (of in een browser met meerdere Google-accounts) het juiste kunt kiezen.
        urlCallback: (url) => {
          const u = new URL(url)
          u.searchParams.set("prompt", "select_account")
          if (venster && !venster.closed) venster.location.href = u.toString()
          else openVenster(u.toString())
        },
      })
    } catch (err) {
      setFout(foutmelding(err))
    } finally {
      venster?.close()
      setBezig(false)
    }
  }

  async function metWachtwoord(e: React.FormEvent) {
    e.preventDefault()
    setFout("")
    setBezig(true)
    try {
      await pb.collection("users").authWithPassword(email, wachtwoord)
    } catch (err) {
      setFout(foutmelding(err))
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-creme">
      {/* Foto van het huis: links op grote schermen, als smalle band bovenaan op de telefoon. */}
      <div className="relative hidden w-[46%] max-w-3xl shrink-0 lg:block">
        <img src={FOTO} alt="Vakantiehuis Duc’dalf in de Languedoc" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-inkt/25 via-inkt/0 to-inkt/35" />
        <div className="absolute left-10 top-9"><Merk licht /></div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative h-44 lg:hidden">
          <img src={FOTO} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_40%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-inkt/45 to-inkt/10" />
          <div className="absolute left-5 top-5"><Merk licht /></div>
        </div>

        <header className="flex justify-end px-6 pt-6 sm:px-10">
          <a href={WEBSITE} className="text-sm text-zacht no-underline hover:text-inkt">← Terug naar de website</a>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="wenkbrauw mb-3">Beheeromgeving</div>
            <h1 className="mb-4">Welkom terug</h1>
            <p className="mb-8 text-zacht">
              Hier beheren de eigenaren van Duc’dalf boekingen, facturen en betalingen. Log in met je Google-account.
            </p>
            {config.apiUrlOntbreekt && (
              <div className="mb-4">
                <Melding soort="fout">
                  Deze versie van de app weet niet waar de server staat: de repository-variabele <strong>VITE_API_URL</strong> was leeg bij het publiceren.
                  Stel hem in op GitHub (Settings → Secrets and variables → Actions → Variables) en publiceer opnieuw.
                </Melding>
              </div>
            )}
            {fout && <div className="mb-4"><Melding soort="fout">{fout}</Melding></div>}
            <button type="button" className="knop w-full py-3.5" onClick={metGoogle} disabled={bezig || config.apiUrlOntbreekt}>
              <GoogleLogo />
              {bezig ? "Bezig met inloggen…" : "Inloggen met Google"}
            </button>
            {config.devLogin && (
              <form onSubmit={metWachtwoord} className="mt-8 flex flex-col gap-3 border-t border-lijn pt-6">
                <div className="text-xs text-zacht">Alleen voor lokaal ontwikkelen (testgebruiker uit de seed):</div>
                <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                <input type="password" placeholder="Wachtwoord" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" />
                <button type="submit" className="knop-rand" disabled={bezig}>Inloggen (ontwikkeling)</button>
              </form>
            )}

            <div className="mt-10 border-t border-lijn pt-6 text-sm text-zacht">
              Ben je gast en wil je een verblijf boeken? Kijk dan op{" "}
              <a href={WEBSITE}>vakantiehuis-ducdalf.nl</a>.
            </div>
          </div>
        </main>

        <footer className="px-6 pb-6 text-xs text-zacht sm:px-10">
          <a href={`${config.apiUrl}/privacy`} className="text-zacht">Privacyverklaring</a>
        </footer>
      </div>
    </div>
  )
}

const WEBSITE = "https://vakantiehuis-ducdalf.nl"
const FOTO = `${import.meta.env.BASE_URL}inloggen.jpg`

function GoogleLogo() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-3.5 w-3.5">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
        <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
    </span>
  )
}

function openVenster(url = ""): Window | null {
  const b = Math.min(1024, window.innerWidth)
  const h = Math.min(768, window.innerHeight)
  const links = window.innerWidth / 2 - b / 2
  const boven = window.innerHeight / 2 - h / 2
  return window.open(url, "google_inloggen", `width=${b},height=${h},top=${boven},left=${links},resizable,menubar=no`)
}
