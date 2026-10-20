/// <reference path="../pb_data/types.d.ts" />

// Financieel → Zomerverdeling: een afwijkende zomerperiode per jaar
// ({ "2026": { "van": "2026-07-04", "tot": "2026-08-30" } }). Leeg = de
// schoolvakanties uit de app.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("instellingen")
    c.fields.add(new JSONField({ name: "zomerperiodes", maxSize: 5000 }))
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId("instellingen")
    c.fields.removeByName("zomerperiodes")
    app.save(c)
  },
)
