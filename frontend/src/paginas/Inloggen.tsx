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
    try {
      await pb.collection("users").authWithOAuth2({ provider: "google" })
    } catch (err) {
      setFout(foutmelding(err))
    } finally {
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
    <div className="flex min-h-screen flex-col bg-zand">
      <header className="px-6 py-6"><Merk /></header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-creme p-8 sm:p-10">
          <div className="wenkbrauw mb-3">Verhuurbeheer</div>
          <h1 className="mb-4">Welkom terug</h1>
          <p className="mb-8 text-zacht">Log in met het Google-account van Duc’dalf om boekingen, facturen en betalingen te beheren.</p>
          {fout && <div className="mb-4"><Melding soort="fout">{fout}</Melding></div>}
          <button type="button" className="knop w-full" onClick={metGoogle} disabled={bezig}>
            Inloggen met Google
          </button>
          {config.devLogin && (
            <form onSubmit={metWachtwoord} className="mt-8 flex flex-col gap-3 border-t border-lijn pt-6">
              <div className="text-xs text-zacht">Alleen voor lokaal ontwikkelen (testgebruiker uit de seed):</div>
              <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              <input type="password" placeholder="Wachtwoord" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" />
              <button type="submit" className="knop-rand" disabled={bezig}>Inloggen (ontwikkeling)</button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
