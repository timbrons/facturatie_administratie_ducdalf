/// <reference path="../pb_data/types.d.ts" />

// Huurboekingen automatisch in Google Agenda (pb_hooks/agenda_sync.js).
// - instellingen.agenda_boekingen: aan/uit (standaard aan)
// - agenda_sync: per boeking wat er in de agenda staat (alleen voor de hooks,
//   geen API-regels), zodat alleen wijzigingen naar Google gaan.
migrate(
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new BoolField({ name: "agenda_boekingen" }))
    app.save(inst)
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      r.set("agenda_boekingen", true)
      app.save(r)
    }

    const sync = new Collection({
      type: "base",
      name: "agenda_sync",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "boeking_id", type: "text", required: true, max: 30 },
        { name: "agenda_id", type: "text", max: 300 },
        { name: "event_id", type: "text", max: 100 },
        { name: "kenmerk", type: "text", max: 100 },
        { name: "fout", type: "text", max: 500 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_agenda_sync_boeking ON agenda_sync (boeking_id)"],
    })
    app.save(sync)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("agenda_sync"))
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.removeByName("agenda_boekingen")
    app.save(inst)
  },
)
