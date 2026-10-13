// Vaste Google-koppeling (Gmail en Drive) met het afzenderaccount.
//
// Eenmalig koppelen: een ingelogde gebruiker start de koppeling; Google
// stuurt na toestemming een code naar /api/oauth2-redirect (state "dk_…").
// De server wisselt die code om voor een blijvende sleutel (refresh token) en
// bewaart die in de collectie google_koppeling (alleen op de NAS, zonder
// API-regels). Daarna krijgt elke ingelogde gebruiker via
// /api/ducdalf/google/token een kortlevende sleutel (± 1 uur), zonder
// Google-venster. De blijvende sleutel verlaat de NAS nooit.
//
// Client-ID en -geheim komen uit de Google-instellingen van de users-collectie
// (dezelfde als voor het inloggen). Staan daar eigen URL's (alleen bij testen),
// dan worden die gebruikt.

const RECORD_ID = "googlekoppeling"
const STATE_PREFIX = "dk_"
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.file",
  // Eigen verblijven in Google Agenda tonen, toevoegen en wijzigen (alleen afspraken)
  "https://www.googleapis.com/auth/calendar.events",
]

function provider() {
  const col = $app.findCollectionByNameOrId("users")
  const ps = col.oauth2.providers
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].name === "google") {
      return {
        clientId: ps[i].clientId,
        clientSecret: ps[i].clientSecret,
        authURL: ps[i].authURL || "https://accounts.google.com/o/oauth2/v2/auth",
        tokenURL: ps[i].tokenURL || "https://oauth2.googleapis.com/token",
        userInfoURL: ps[i].userInfoURL || "https://www.googleapis.com/oauth2/v3/userinfo",
      }
    }
  }
  throw new BadRequestError("Google-inloggen is niet ingesteld in PocketBase (users → OAuth2 → Google).")
}

function redirectUri() {
  const basis = String($app.settings().meta.appURL || "").replace(/\/+$/, "")
  return basis + "/api/oauth2-redirect"
}

function afzender() {
  try {
    return $app.findFirstRecordByFilter("instellingen", "id != ''").getString("afzender_email").trim().toLowerCase()
  } catch (_) {
    return ""
  }
}

function record() {
  try {
    return $app.findRecordById("google_koppeling", RECORD_ID)
  } catch (_) {
    const r = new Record($app.findCollectionByNameOrId("google_koppeling"))
    r.set("id", RECORD_ID)
    return r
  }
}

function form(waarden) {
  return Object.keys(waarden).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(waarden[k])).join("&")
}

function post(url, waarden) {
  return $http.send({
    url: url,
    method: "POST",
    body: form(waarden),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: 20,
  })
}

/** Start: maakt een eenmalige state aan en geeft de Google-URL terug. */
function start(gebruiker) {
  const p = provider()
  const r = record()
  const state = STATE_PREFIX + $security.randomString(40)
  r.set("state", state)
  r.set("state_verloopt", Date.now() + 10 * 60 * 1000)
  r.set("state_door", gebruiker)
  $app.save(r)
  const params = {
    client_id: p.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: state,
  }
  const hint = afzender()
  if (hint) params.login_hint = hint
  return p.authURL + "?" + form(params)
}

function isKoppelState(state) {
  return String(state || "").indexOf(STATE_PREFIX) === 0
}

/** Afronden na de redirect van Google. Geeft een foutmelding of "" terug. */
function afronden(state, code, fout) {
  const r = record()
  const verwacht = r.getString("state")
  if (!verwacht || verwacht !== state || r.getInt("state_verloopt") < Date.now()) {
    return "De koppeling is verlopen of ongeldig. Start hem opnieuw bij Instellingen."
  }
  const door = r.getString("state_door")
  r.set("state", "")
  r.set("state_verloopt", 0)
  $app.save(r)
  if (fout || !code) return "Google gaf geen toestemming (" + (fout || "geen code") + ")."

  const p = provider()
  const res = post(p.tokenURL, {
    code: code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  })
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) {
    return "Google weigerde de koppeling (" + ((res.json && (res.json.error_description || res.json.error)) || res.statusCode) + ")."
  }
  const t = res.json
  if (!t.refresh_token) {
    return "Google gaf geen blijvende sleutel. Verwijder de toegang van de app via myaccount.google.com/permissions en koppel opnieuw."
  }
  const info = $http.send({ url: p.userInfoURL, method: "GET", headers: { Authorization: "Bearer " + t.access_token }, timeout: 20 })
  const email = String((info.json && info.json.email) || "").toLowerCase()
  const verwachtEmail = afzender()
  if (!email) return "Kon het Google-account niet vaststellen."
  if (verwachtEmail && email !== verwachtEmail) {
    return "Je koos " + email + ", maar de afzender bij Instellingen is " + verwachtEmail + ". Koppel opnieuw en kies dat account."
  }
  r.set("email", email)
  r.set("scopes", String(t.scope || SCOPES.join(" ")))
  r.set("refresh_token", t.refresh_token)
  r.set("access_token", t.access_token)
  r.set("access_verloopt", Date.now() + (Number(t.expires_in) || 3600) * 1000)
  r.set("gekoppeld_op", new Date().toISOString())
  r.set("gekoppeld_door", door)
  $app.save(r)
  return ""
}

function status() {
  const r = record()
  return {
    gekoppeld: !!r.getString("refresh_token"),
    email: r.getString("email"),
    scopes: r.getString("scopes"),
    gekoppeld_op: r.getString("gekoppeld_op"),
    gekoppeld_door: r.getString("gekoppeld_door"),
  }
}

/** Kortlevende sleutel voor de app; vernieuwt zo nodig met de blijvende sleutel. */
function token() {
  const r = record()
  const refresh = r.getString("refresh_token")
  if (!refresh) return { status: 404, body: { message: "Google is nog niet vast gekoppeld (Instellingen → Google-account)." } }
  const scopes = r.getString("scopes")
  if (r.getString("access_token") && r.getInt("access_verloopt") > Date.now() + 5 * 60 * 1000) {
    return { status: 200, body: { access_token: r.getString("access_token"), verloopt: r.getInt("access_verloopt"), scope: scopes, email: r.getString("email") } }
  }
  const p = provider()
  const res = post(p.tokenURL, { client_id: p.clientId, client_secret: p.clientSecret, refresh_token: refresh, grant_type: "refresh_token" })
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) {
    if (res.json && res.json.error === "invalid_grant") {
      r.set("refresh_token", "")
      r.set("access_token", "")
      $app.save(r)
      return { status: 409, body: { message: "De vaste koppeling met Google is verlopen of ingetrokken. Koppel opnieuw bij Instellingen → Google-account." } }
    }
    return { status: 502, body: { message: "Google is niet bereikbaar. Probeer het zo opnieuw." } }
  }
  const verloopt = Date.now() + (Number(res.json.expires_in) || 3600) * 1000
  r.set("access_token", res.json.access_token)
  r.set("access_verloopt", verloopt)
  if (res.json.scope) r.set("scopes", res.json.scope)
  $app.save(r)
  return { status: 200, body: { access_token: res.json.access_token, verloopt: verloopt, scope: r.getString("scopes"), email: r.getString("email") } }
}

/** Koppeling verbreken: sleutel intrekken bij Google en wissen. */
function verbreken() {
  const r = record()
  const refresh = r.getString("refresh_token")
  if (refresh) {
    try {
      post("https://oauth2.googleapis.com/revoke", { token: refresh })
    } catch (_) {
      // Niet erg: de sleutel wordt hier hoe dan ook gewist.
    }
  }
  r.set("refresh_token", "")
  r.set("access_token", "")
  r.set("access_verloopt", 0)
  r.set("email", "")
  r.set("scopes", "")
  r.set("gekoppeld_op", "")
  r.set("gekoppeld_door", "")
  $app.save(r)
}

module.exports = { start, isKoppelState, afronden, status, token, verbreken }
