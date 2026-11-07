/// <reference path="../pb_data/types.d.ts" />

// Betaalbevestigingen toeristenbelasting automatisch uit Gmail vastleggen:
// per uitgave de bron (de Gmail-mail, zodat die maar één keer wordt verwerkt)
// en of het bedrag nog gecontroleerd moet worden. Afzender en onderwerp van
// de mail staan in de instellingen.
migrate(
  (app) => {
    const u = app.findCollectionByNameOrId("uitgaven")
    u.fields.add(new TextField({ name: "bron", max: 200 }))
    u.fields.add(new BoolField({ name: "controleren" }))
    u.addIndex("idx_uitgaven_bron", true, "bron", "bron != ''")
    app.save(u)

    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new TextField({ name: "tb_betaalmail_onderwerp", max: 200 }))
    inst.fields.add(new TextField({ name: "tb_betaalmail_afzender", max: 200 }))
    app.save(inst)
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      if (!r.getString("tb_betaalmail_onderwerp")) r.set("tb_betaalmail_onderwerp", "Payment confirmation - Order reference")
      if (!r.getString("tb_betaalmail_afzender")) r.set("tb_betaalmail_afzender", "noreply-payfip@sips-services.com")
      app.save(r)
    }
  },
  (app) => {
    const u = app.findCollectionByNameOrId("uitgaven")
    u.removeIndex("idx_uitgaven_bron")
    u.fields.removeByName("bron")
    u.fields.removeByName("controleren")
    app.save(u)
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.removeByName("tb_betaalmail_onderwerp")
    inst.fields.removeByName("tb_betaalmail_afzender")
    app.save(inst)
  },
)
