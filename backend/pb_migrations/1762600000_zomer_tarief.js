/// <reference path="../pb_data/types.d.ts" />

// Financieel → Zomerverdeling: een afwijkend nachttarief per boeking voor de
// zomerverrekening (bijv. als de huurder een ander tarief betaalde dan het
// hoogseizoentarief uit de prijzen). 0 = het hoogseizoentarief gebruiken.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("boekingen")
    c.fields.add(new NumberField({ name: "zomer_tarief_cent", onlyInt: true, min: 0 }))
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId("boekingen")
    c.fields.removeByName("zomer_tarief_cent")
    app.save(c)
  },
)
