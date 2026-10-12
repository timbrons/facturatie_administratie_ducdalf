import { useSyncExternalStore } from "react"
import { config } from "./config"

// Google-koppeling vanuit de browser met Google Identity Services (OAuth 2.0
// token model). Het access token staat ALLEEN in het geheugen van deze
// pagina: na herladen of na ± 1 uur opnieuw koppelen. Er worden geen
// wachtwoorden, secrets of refresh tokens opgeslagen.
//
// Rechten:
//  - gmail.send      mails versturen (fase 3)
//  - gmail.readonly  inzendingen van het aanmeldformulier lezen (fase 4)
//  - drive.file      kopieën van facturen in Drive zetten; de app ziet alleen
//                    de bestanden en mappen die hij zelf heeft gemaakt

export const SCOPES = {
  verzenden: "https://www.googleapis.com/auth/gmail.send",
  lezen: "https://www.googleapis.com/auth/gmail.readonly",
  drive: "https://www.googleapis.com/auth/drive.file",
}
const SCOPE = Object.values(SCOPES).join(" ")
const GIS_URL = "https://accounts.google.com/gsi/client"

interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (opts?: { prompt?: string; login_hint?: string }) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } } }
  }
}

let token: { waarde: string; verlooptOp: number; scopes: string[] } | null = null
const luisteraars = new Set<() => void>()
function meld() { for (const l of luisteraars) l() }

let laden: Promise<void> | null = null
function laadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  laden ??= new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = GIS_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { laden = null; reject(new Error("Kon de Google-inlogcomponent niet laden. Controleer je internetverbinding.")) }
    document.head.appendChild(s)
  })
  return laden
}

export function gmailBeschikbaar(): boolean {
  return !!config.googleClientId
}

export function isGekoppeld(): boolean {
  return !!token && token.verlooptOp > Date.now() + 30_000
}

/** React-hook: is Gmail op dit moment gekoppeld? */
export function useGmailGekoppeld(): boolean {
  return useSyncExternalStore(
    (l) => { luisteraars.add(l); const t = window.setInterval(l, 30_000); return () => { luisteraars.delete(l); window.clearInterval(t) } },
    isGekoppeld,
  )
}

/** Vraagt toestemming (pop-up van Google) en bewaart het token in het geheugen. */
export async function koppelGmail(loginHint?: string): Promise<void> {
  if (!config.googleClientId) throw new Error("Er is geen Google Client-ID ingesteld (VITE_GOOGLE_CLIENT_ID).")
  await laadGis()
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || "Koppelen mislukt."))
        token = { waarde: r.access_token, verlooptOp: Date.now() + (r.expires_in ?? 3600) * 1000, scopes: (r.scope ?? SCOPE).split(" ") }
        meld()
        resolve()
      },
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "Het Google-venster is gesloten." : e.message || "Koppelen mislukt.")),
    })
    client.requestAccessToken({ prompt: token ? "" : "consent", login_hint: loginHint })
  })
}

/** Heeft de gebruiker dit recht gegeven? (Google laat toe om rechten uit te vinken.) */
export function heeftRecht(scope: string): boolean {
  return isGekoppeld() && token!.scopes.includes(scope)
}

/** Geautoriseerd verzoek naar een Google-API. */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isGekoppeld()) throw new Error("Google is niet (meer) gekoppeld. Klik op ‘Koppel Google’ en probeer het opnieuw.")
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token!.waarde}` } })
  if (res.status === 401) {
    ontkoppelGmail()
    throw new Error("De Google-koppeling is verlopen. Koppel opnieuw en probeer het nog een keer.")
  }
  if (res.status === 403) {
    const data = await res.clone().json().catch(() => ({}))
    throw new Error(`Google weigert dit verzoek: ${data?.error?.message ?? "geen toestemming"}. Koppel Google opnieuw en vink alle gevraagde rechten aan.`)
  }
  return res
}

export function ontkoppelGmail(): void {
  token = null
  meld()
}

export interface Verzonden { id: string; threadId: string }

/** Verstuurt een mail (raw = base64url MIME). Bij een verlopen token eerst opnieuw koppelen. */
export async function verstuurViaGmail(raw: string, threadId?: string): Promise<Verzonden> {
  const res = await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Een threadId dat niet (meer) bestaat: zonder thread opnieuw proberen.
    if (threadId && res.status === 404) return verstuurViaGmail(raw)
    throw new Error(`Gmail weigerde de mail: ${data?.error?.message ?? res.statusText}`)
  }
  return { id: data.id, threadId: data.threadId }
}
