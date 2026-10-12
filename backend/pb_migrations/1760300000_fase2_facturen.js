/// <reference path="../pb_data/types.d.ts" />

// Fase 2: facturen en import. Een factuur krijgt pas een nummer als hij
// definitief wordt gemaakt (route /api/ducdalf/facturen/{id}/nummeren), zodat
// de nummering per jaar doorlopend blijft zonder gaten.

migrate((app) => {
  for (const naam of ["facturen", "boekingen", "betalingen"]) {
    const c = app.findCollectionByNameOrId(naam)
    c.fields.add(new BoolField({ name: "geimporteerd" }))
    app.save(c)
  }
}, (app) => {
  for (const naam of ["facturen", "boekingen", "betalingen"]) {
    const c = app.findCollectionByNameOrId(naam)
    c.fields.removeByName("geimporteerd")
    app.save(c)
  }
})
