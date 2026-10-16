/// <reference path="../pb_data/types.d.ts" />

// Een concept-factuur kan met de hand worden aangepast (regels, adres,
// betaaltekst). Dan volgt hij de boeking niet meer automatisch.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("facturen")
    c.fields.add(new BoolField({ name: "aangepast" }))
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId("facturen")
    c.fields.removeByName("aangepast")
    app.save(c)
  },
)
