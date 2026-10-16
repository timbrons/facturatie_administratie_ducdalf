/// <reference path="../pb_data/types.d.ts" />

// Gezinnen voor een eigen verblijf (één per regel). Bij een eigen verblijf
// kies je voor wie het is; dat komt in de titel en de kleur in Google Agenda.
// De namen staan alleen in de database, niet in de code.
migrate(
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new TextField({ name: "eigen_verblijf_groepen", max: 1000 }))
    app.save(inst)
  },
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.removeByName("eigen_verblijf_groepen")
    app.save(inst)
  },
)
