/// <reference path="../pb_data/types.d.ts" />

// Toegang: alleen e-mailadressen uit DUCDALF_ALLOWED_EMAILS mogen inloggen.
// Dit wordt hier in de backend afgedwongen, niet alleen in de frontend.

onRecordAuthWithOAuth2Request((e) => {
  const config = require(`${__hooks}/config.js`)
  const email = (e.oAuth2User && e.oAuth2User.email) || (e.record && e.record.email()) || ""
  if (!config.isToegestaan(email)) {
    throw new ForbiddenError("Dit account heeft geen toegang tot het verhuurbeheer.")
  }
  e.next()
}, "users")

// Vangnet voor elke andere manier van inloggen (wachtwoord, OTP, token vernieuwen).
onRecordAuthRequest((e) => {
  const config = require(`${__hooks}/config.js`)
  if (!config.isToegestaan(e.record.email())) {
    throw new ForbiddenError("Dit account heeft geen toegang tot het verhuurbeheer.")
  }
  e.next()
}, "users")

onRecordAuthRefreshRequest((e) => {
  const config = require(`${__hooks}/config.js`)
  if (!config.isToegestaan(e.record.email())) {
    throw new ForbiddenError("Dit account heeft geen toegang tot het verhuurbeheer.")
  }
  e.next()
}, "users")

// Gebruikers kunnen alleen via Google OAuth2 ontstaan; nooit via de API.
// Bij de eerste Google-login maakt PocketBase het record aan met een interne
// aanvraag in de context "oauth2". De allowlist is dan al gecontroleerd door
// onRecordAuthWithOAuth2Request hierboven.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth() && e.requestInfo().context !== "oauth2") {
    throw new ForbiddenError("Registreren is niet mogelijk.")
  }
  e.next()
}, "users")
