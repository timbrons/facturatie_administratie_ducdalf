/// <reference path="../pb_data/types.d.ts" />

// Workflow: nieuwe stap "Parkkosten betalen" na "Toeristenbelasting
// aangeven". Bij de boeking leggen we vast wat er werkelijk aan Parc le Duc
// (PLD) is betaald, wanneer, en de factuur van PLD.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("boekingen")
    c.fields.add(new NumberField({ name: "parkkosten_betaald_cent", onlyInt: true, min: 0 }))
    c.fields.add(new TextField({ name: "parkkosten_betaald_op", max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }))
    c.fields.add(new FileField({
      name: "parkkosten_factuur",
      maxSelect: 1,
      maxSize: 10 * 1024 * 1024,
      mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
      protected: true,
    }))
    app.save(c)

    const zoek = (sleutel) => {
      try {
        return app.findFirstRecordByFilter("workflow_stappen", "sleutel = {:s}", { s: sleutel })
      } catch (_) {
        return null
      }
    }
    if (!zoek("parkkosten_betaald")) {
      const voor = zoek("tb_aangegeven")
      const na = zoek("afgerond")
      const van = voor ? voor.getInt("volgorde") : 120
      const tot = na ? na.getInt("volgorde") : van + 10
      const midden = Math.floor((van + tot) / 2)
      const r = new Record(app.findCollectionByNameOrId("workflow_stappen"))
      r.set("sleutel", "parkkosten_betaald")
      r.set("label", "Parkkosten betaald")
      r.set("actie_label", "Parkkosten betalen")
      r.set("omschrijving", "De parkkosten zijn aan Parc le Duc betaald; het bedrag en de factuur van PLD zijn vastgelegd.")
      r.set("volgorde", midden > van ? midden : van + 1)
      r.set("overslaan_als", "")
      r.set("actief", true)
      app.save(r)
    }
  },
  (app) => {
    try {
      app.delete(app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'parkkosten_betaald'"))
    } catch (_) {}
    const c = app.findCollectionByNameOrId("boekingen")
    for (const n of ["parkkosten_betaald_cent", "parkkosten_betaald_op", "parkkosten_factuur"]) c.fields.removeByName(n)
    app.save(c)
  },
)
