/// <reference path="../pb_data/types.d.ts" />

// Afronden van de Google-login in het pop-upvenster.
//
// PocketBase stuurt het venster na de login standaard door naar het
// beheerscherm (/_/#/auth/oauth2-redirect-success), dat het venster sluit.
// Het beheerscherm staat achter Cloudflare Access; dan verschijnt daar eerst
// de Cloudflare-code en daarna het inlogscherm voor de superuser. Deze
// middleware doet hetzelfde als PocketBase (de code via de realtime-verbinding
// aan de app geven, met dezelfde controles), maar toont een eigen pagina die
// het venster sluit. Alleen GET; andere aanvragen gaan naar PocketBase zelf.

routerUse((e) => {
  if (e.request.method !== "GET" || e.request.url.path !== "/api/oauth2-redirect") {
    return e.next()
  }

  const pagina = (gelukt) =>
    e.html(
      200,
      '<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Duc\'dalf verhuurbeheer</title></head>' +
        '<body style="font-family:sans-serif;padding:2rem;color:#3c362c;background:#faf7ef">' +
        "<p>" + (gelukt ? "Inloggen gelukt." : "Inloggen is niet gelukt. Probeer het in de app opnieuw.") +
        " Dit venster sluit vanzelf; gebeurt dat niet, dan kun je het sluiten.</p>" +
        "<script>window.close()</script></body></html>",
    )

  const query = e.request.url.query()
  const state = query.get("state")
  const code = query.get("code")
  const fout = query.get("error")
  if (!state) return pagina(false)

  // Vaste koppeling met het Google-account (Instellingen → Google-account).
  const google = require(`${__hooks}/google.js`)
  if (google.isKoppelState(state)) {
    const melding = google.afronden(state, code, fout)
    return e.html(
      200,
      '<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Duc\'dalf verhuurbeheer</title></head>' +
        '<body style="font-family:sans-serif;padding:2rem;color:#3c362c;background:#faf7ef">' +
        "<p>" + (melding ? String(melding).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "Google is vast gekoppeld. Dit venster sluit vanzelf.") + "</p>" +
        (melding ? "" : "<script>window.close()</script>") + "</body></html>",
    )
  }

  let client
  try {
    client = $app.subscriptionsBroker().clientById(state)
  } catch (_) {
    return pagina(false)
  }
  if (client.isDiscarded() || !client.hasSubscription("@oauth2")) return pagina(false)

  try {
    // Zelfde controle als PocketBase: de login moet afgerond worden vanaf
    // hetzelfde IP-adres als waar de app de verbinding opende.
    const ip = client.get("pbRealtimeClientIP")
    if (ip && ip !== e.realIP()) return pagina(false)

    const data = { state: state, code: code }
    if (fout) data.error = fout
    client.send(new SubscriptionMessage({ name: "@oauth2", data: JSON.stringify(data) }))
  } finally {
    client.unsubscribe("@oauth2")
  }

  return pagina(!fout && !!code)
})
