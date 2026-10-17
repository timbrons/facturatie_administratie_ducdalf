/// <reference path="../pb_data/types.d.ts" />

// Melding "nieuwe mail van huurder" op het overzicht: tot welk tijdstip de
// mails van een huurder als afgehandeld zijn gemarkeerd.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("huurders")
    c.fields.add(new TextField({ name: "mail_gezien_tot", max: 40 }))
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId("huurders")
    c.fields.removeByName("mail_gezien_tot")
    app.save(c)
  },
)
