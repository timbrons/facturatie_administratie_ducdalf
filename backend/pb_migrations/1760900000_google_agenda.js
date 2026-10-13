/// <reference path="../pb_data/types.d.ts" />

// Eigen verblijven uit Google Agenda tonen in de kalender van de app.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("instellingen")
    c.fields.add(new BoolField({ name: "agenda_tonen" }))
    c.fields.add(new TextField({ name: "agenda_id", max: 300 }))
    c.fields.add(new TextField({ name: "agenda_filter", max: 300 }))
    app.save(c)
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      r.set("agenda_tonen", true)
      r.set("agenda_id", "primary")
      r.set("agenda_filter", "")
      app.save(r)
    }
  },
  (app) => {
    const c = app.findCollectionByNameOrId("instellingen")
    for (const n of ["agenda_tonen", "agenda_id", "agenda_filter"]) c.fields.removeByName(n)
    app.save(c)
  },
)
