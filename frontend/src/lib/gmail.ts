import { useSyncExternalStore } from "react"
import { config } from "./config"
import { pb } from "./pb"

// Google-koppeling vanuit de browser met Google Identity Services (OAuth 2.0
// token model). Het access token staat ALLEEN in het geheugen van deze
// pagina en is ± 1 uur geldig. Er worden geen wachtwoorden, secrets of
// refresh tokens opgeslagen.
//
// Koppelen gaat zoveel mogelijk vanzelf:
//  - bij "Inloggen met Google" vraagt de app de rechten meteen mee en
//    bewaart het access token uit die login (zetToken);
//  - is het token verlopen of de pagina herladen, dan vraagt zorgVoorGoogle()
//    bij de eerstvolgende actie die Google nodig heeft (versturen, Drive,
//    aanmeldingen ophalen) een nieuw token. Google toont dan kort een venster
//    dat zichzelf sluit; toestemming is al eerder gegeven.
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
// Het e-mailadres van het gekoppelde account hebben we nodig om te controleren
// dat het het afzenderaccount is (zie controleerAccount).
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
const SCOPE = [...Object.values(SCOPES), EMAIL_SCOPE].join(" ")
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

// Het Google-account waarmee gekoppeld moet worden: de afzender uit Instellingen.
// Wie met een ander (eigen) account in de app inlogt, mag niet per ongeluk
// mails versturen of Drive-kopieën maken vanuit dat eigen account.
let afzender = ""
export function stelAfzenderIn(email: string | undefined): void {
  afzender = (email ?? "").trim().toLowerCase()
}
async function verwachteAfzender(): Promise<string> {
  if (!afzender) {
    try {
      stelAfzenderIn((await pb.collection("instellingen").getFirstListItem<{ afzender_email: string }>("")).afzender_email)
    } catch {
      // Geen instellingen: dan geen controle.
    }
  }
  return afzender
}

interface TokenInfo { email: string; scopes: string[]; verlooptOp: number }

/** Vraagt bij Google op voor welk account en welke rechten een token geldt. */
async function tokenInfo(accessToken: string): Promise<TokenInfo | null> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
  if (!res.ok) return null
  const info = await res.json()
  if (config.googleClientId && info.aud !== config.googleClientId) return null
  return {
    email: String(info.email ?? "").toLowerCase(),
    scopes: String(info.scope ?? "").split(" "),
    verlooptOp: Date.now() + Number(info.expires_in ?? 0) * 1000,
  }
}

/** Foutmelding als het token van een ander account is dan de afzender, anders null. */
async function controleerAccount(info: TokenInfo): Promise<string | null> {
  const verwacht = await verwachteAfzender()
  if (!verwacht || !info.email || info.email === verwacht) return null
  return `Google is gekoppeld met ${info.email}, maar mails en Drive-kopieën horen bij ${verwacht} (de afzender bij Instellingen). Kies in het Google-venster het account ${verwacht}.`
}

/** Laadt de Google-component alvast, zodat koppelen later direct bij een klik kan. */
export function voorladenGoogle(): void {
  if (config.googleClientId) laadGis().catch(() => {})
}

/** Zet een access token (bijv. uit "Inloggen met Google") in het geheugen. */
export function zetToken(waarde: string, verlooptOp: number, scopes: string[]): void {
  token = { waarde, verlooptOp, scopes }
  meld()
}

/**
 * Bewaart het Google-token uit de app-login, als die de rechten voor Gmail en
 * Drive heeft meegekregen. Google laat toe om rechten uit te vinken; daarom
 * vragen we op welke rechten het token echt heeft.
 */
export async function neemLoginTokenOver(email: string | undefined, accessToken: string | undefined, verloopt: string | undefined): Promise<void> {
  if (!config.googleClientId) return
  // Onthouden of in deze browser met het afzenderaccount wordt ingelogd; alleen
  // dan vraagt de volgende login meteen de rechten voor Gmail en Drive mee.
  // Wie met een eigen account inlogt, krijgt die vraag dus niet.
  const verwacht = await verwachteAfzender()
  const isAfzender = !!email && !!verwacht && email.trim().toLowerCase() === verwacht
  try {
    if (isAfzender) localStorage.setItem(LOGIN_RECHTEN_SLEUTEL, "1")
    else localStorage.removeItem(LOGIN_RECHTEN_SLEUTEL)
  } catch {
    // Geen opslag beschikbaar: dan koppelt de app bij de eerste actie.
  }
  if (!accessToken) return
  try {
    const info = await tokenInfo(accessToken)
    if (!info || !Object.values(SCOPES).some((s) => info.scopes.includes(s))) return
    // Ingelogd met een ander account dan de afzender (bijv. een eigen account):
    // dat token niet gebruiken; bij de eerste actie koppelt de app met de afzender.
    if (await controleerAccount(info)) return
    const verlooptOp = verloopt ? Date.parse(verloopt.replace(" ", "T")) : info.verlooptOp
    zetToken(accessToken, Number.isFinite(verlooptOp) ? verlooptOp : info.verlooptOp, info.scopes)
  } catch {
    // Niet erg: dan wordt bij de eerste actie met Google opnieuw gekoppeld.
  }
}

const LOGIN_RECHTEN_SLEUTEL = "ducdalf_login_met_google_rechten"

/** Moet "Inloggen met Google" de rechten voor Gmail en Drive meevragen? */
export function loginVraagtGoogleRechten(): boolean {
  if (!config.googleClientId) return false
  try {
    return localStorage.getItem(LOGIN_RECHTEN_SLEUTEL) === "1"
  } catch {
    return false
  }
}

/** Vraagt toestemming (pop-up van Google) en bewaart het token in het geheugen. */
export async function koppelGmail(loginHint?: string): Promise<void> {
  if (!config.googleClientId) throw new Error("Er is geen Google Client-ID ingesteld (VITE_GOOGLE_CLIENT_ID).")
  // Al geladen: direct (binnen de klik) het venster openen, anders houdt de
  // pop-upblokkering het tegen.
  if (!window.google?.accounts?.oauth2) await laadGis()
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: SCOPE,
      callback: async (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || "Koppelen mislukt."))
        const info = await tokenInfo(r.access_token).catch(() => null)
        const fout = info ? await controleerAccount(info) : null
        if (fout) return reject(new Error(fout))
        zetToken(r.access_token, Date.now() + (r.expires_in ?? 3600) * 1000, (r.scope ?? SCOPE).split(" "))
        resolve()
      },
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "Het Google-venster is gesloten." : e.message || "Koppelen mislukt.")),
    })
    // Geen geforceerd toestemmingsscherm: Google vraagt alleen wat nog niet is gegeven.
    client.requestAccessToken({ prompt: "", login_hint: loginHint || afzender || undefined })
  })
}

/**
 * Zorgt dat er een geldig token is voordat een actie Google gebruikt. Roep dit
 * aan als eerste stap in de klik-handler (vóór andere await's), zodat het
 * Google-venster niet door de pop-upblokkering wordt tegengehouden.
 */
export async function zorgVoorGoogle(loginHint?: string, nodig?: string): Promise<void> {
  if (!gmailBeschikbaar()) return
  if (token && token.verlooptOp > Date.now() + 5 * 60_000 && (!nodig || token.scopes.includes(nodig))) return
  await koppelGmail(loginHint)
}

/** Heeft de gebruiker dit recht gegeven? (Google laat toe om rechten uit te vinken.) */
export function heeftRecht(scope: string): boolean {
  return isGekoppeld() && token!.scopes.includes(scope)
}

/** Geautoriseerd verzoek naar een Google-API. */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isGekoppeld()) throw new Error("Google is niet (meer) gekoppeld. Probeer het opnieuw; de app koppelt dan opnieuw met Google.")
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token!.waarde}` } })
  if (res.status === 401) {
    ontkoppelGmail()
    throw new Error("De Google-koppeling is verlopen. Probeer het nog een keer; de app koppelt dan opnieuw.")
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
