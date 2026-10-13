/// <reference path="../pb_data/types.d.ts" />

// Vaste koppeling met het Google-account van de afzender (Gmail en Drive).
// De blijvende sleutel (refresh token) staat alleen hier op de NAS. Er zijn
// geen API-regels: alleen de hooks in pb_hooks/google.pb.js lezen en
// schrijven deze collectie; de app krijgt alleen kortlevende sleutels.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "google_koppeling",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "email", type: "text", max: 200 },
        { name: "scopes", type: "text", max: 2000 },
        { name: "refresh_token", type: "text", max: 2000, hidden: true },
        { name: "access_token", type: "text", max: 4000, hidden: true },
        { name: "access_verloopt", type: "number", onlyInt: true },
        { name: "gekoppeld_op", type: "text", max: 40 },
        { name: "gekoppeld_door", type: "text", max: 200 },
        { name: "state", type: "text", max: 100, hidden: true },
        { name: "state_verloopt", type: "number", onlyInt: true },
        { name: "state_door", type: "text", max: 200 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    app.save(collection)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("google_koppeling"))
  },
)
