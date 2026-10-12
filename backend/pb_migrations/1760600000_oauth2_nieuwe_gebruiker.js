/// <reference path="../pb_data/types.d.ts" />

// Bij de eerste keer inloggen met Google maakt PocketBase zelf het
// users-record aan. Met createRule = null weigert PocketBase dat
// ("Only superusers can perform this action."). Daarom staat de regel open;
// de hooks in pb_hooks/toegang.pb.js bewaken de toegang:
// - inloggen met Google alleen voor e-mailadressen uit DUCDALF_ALLOWED_EMAILS;
// - aanmaken via de gewone API (registreren) blijft geweigerd.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users")
    users.createRule = ""
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users")
    users.createRule = null
    app.save(users)
  },
)
