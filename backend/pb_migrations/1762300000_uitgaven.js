/// <reference path="../pb_data/types.d.ts" />

// Uitgaven die we zelf betalen (van de gezamenlijke rekening): de afdracht
// toeristenbelasting aan Grand Pic Saint-Loup en het Starlink-abonnement
// (per maand: actief of gepauzeerd). De standaardbedragen voor Starlink staan
// in de instellingen. Bestaande afdrachten bij een maandaangifte gaan mee.
migrate(
  (app) => {
    const ALLEEN_INGELOGD = '@request.auth.id != "" && @request.auth.collectionName = "users"'
    const collection = new Collection({
      type: "base",
      name: "uitgaven",
      listRule: ALLEEN_INGELOGD,
      viewRule: ALLEEN_INGELOGD,
      createRule: ALLEEN_INGELOGD,
      updateRule: ALLEEN_INGELOGD,
      deleteRule: ALLEEN_INGELOGD,
      fields: [
        { name: "soort", type: "select", required: true, maxSelect: 1, values: ["toeristenbelasting", "starlink", "overig"] },
        // Afgeschreven op (JJJJ-MM-DD)
        { name: "datum", type: "text", max: 10, pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" },
        // Over welke maand (JJJJ-MM), bijv. de abonnementsmaand of de aangifteperiode
        { name: "periode", type: "text", max: 7, pattern: "^(\\d{4}-\\d{2})?$" },
        { name: "bedrag_cent", type: "number", onlyInt: true, min: 0 },
        // Alleen Starlink: actief of gepauzeerd
        { name: "status", type: "select", maxSelect: 1, values: ["actief", "gepauzeerd"] },
        { name: "omschrijving", type: "text", max: 300 },
        {
          name: "bewijs",
          type: "file",
          maxSelect: 5,
          maxSize: 10 * 1024 * 1024,
          mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
          protected: true,
        },
        { name: "notities", type: "text", max: 5000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_uitgaven_soort_periode ON uitgaven (soort, periode)"],
    })
    app.save(collection)

    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new NumberField({ name: "starlink_actief_cent", onlyInt: true, min: 0 }))
    inst.fields.add(new NumberField({ name: "starlink_pauze_cent", onlyInt: true, min: 0 }))
    app.save(inst)
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      if (!r.getInt("starlink_actief_cent")) r.set("starlink_actief_cent", 3500)
      if (!r.getInt("starlink_pauze_cent")) r.set("starlink_pauze_cent", 1000)
      app.save(r)
    }

    // Afdrachten die al bij een maandaangifte stonden, als betaling overnemen.
    const uitgaven = app.findCollectionByNameOrId("uitgaven")
    for (const a of app.findRecordsByFilter("tb_aangiften", "afgedragen_op != ''", "", 0, 0)) {
      const u = new Record(uitgaven)
      u.set("soort", "toeristenbelasting")
      u.set("datum", a.getString("afgedragen_op"))
      u.set("periode", a.getString("periode"))
      u.set("bedrag_cent", a.getInt("afgedragen_cent"))
      u.set("omschrijving", "Toeristenbelasting " + a.getString("periode"))
      app.save(u)
    }
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("uitgaven"))
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.removeByName("starlink_actief_cent")
    inst.fields.removeByName("starlink_pauze_cent")
    app.save(inst)
  },
)
