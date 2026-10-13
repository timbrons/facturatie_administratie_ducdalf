/// <reference path="../pb_data/types.d.ts" />

// Routes voor de vaste Google-koppeling; zie google.js. Alleen voor
// ingelogde gebruikers (de allowlist geldt al bij het inloggen).

routerAdd("GET", "/api/ducdalf/google/status", (e) => {
  const google = require(`${__hooks}/google.js`)
  return e.json(200, google.status())
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/ducdalf/google/koppelen", (e) => {
  const google = require(`${__hooks}/google.js`)
  return e.json(200, { url: google.start(e.auth.email()) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/ducdalf/google/token", (e) => {
  const google = require(`${__hooks}/google.js`)
  const r = google.token()
  return e.json(r.status, r.body)
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/ducdalf/google/koppeling", (e) => {
  const google = require(`${__hooks}/google.js`)
  google.verbreken()
  return e.json(200, { gekoppeld: false })
}, $apis.requireAuth("users"))
