/// <reference path="../pb_data/types.d.ts" />

// Het oude aanmeldformulier (FormSubmit, uitgelezen via Gmail) is vervangen
// door het eigen formulier; de Gmail-zoekopdracht is niet meer nodig.
migrate(
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    if (inst.fields.getByName("aanmelding_zoekopdracht")) {
      inst.fields.removeByName("aanmelding_zoekopdracht")
      app.save(inst)
    }
  },
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new TextField({ name: "aanmelding_zoekopdracht", max: 500 }))
    app.save(inst)
  },
)
