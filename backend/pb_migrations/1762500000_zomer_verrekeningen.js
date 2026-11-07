/// <reference path="../pb_data/types.d.ts" />

// Financieel → Zomerverdeling: bedragen die de gezinnen al tussentijds met
// elkaar hebben verrekend (bijv. de helft van de huur van een ander huis),
// zodat na de zomer alleen het nog openstaande bedrag overblijft.
migrate(
  (app) => {
    const ALLEEN_INGELOGD = '@request.auth.id != "" && @request.auth.collectionName = "users"'
    app.save(new Collection({
      type: "base",
      name: "zomer_verrekeningen",
      listRule: ALLEEN_INGELOGD,
      viewRule: ALLEEN_INGELOGD,
      createRule: ALLEEN_INGELOGD,
      updateRule: ALLEEN_INGELOGD,
      deleteRule: ALLEEN_INGELOGD,
      fields: [
        // Over welke zomer
        { name: "jaar", type: "number", required: true, onlyInt: true, min: 2000, max: 2100 },
        { name: "datum", type: "text", max: 10, pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" },
        // Gezin dat betaalde en gezin dat ontving
        { name: "van", type: "text", required: true, max: 200 },
        { name: "aan", type: "text", required: true, max: 200 },
        { name: "bedrag_cent", type: "number", onlyInt: true, min: 0 },
        { name: "omschrijving", type: "text", max: 300 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_zomer_verrekeningen_jaar ON zomer_verrekeningen (jaar)"],
    }))
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("zomer_verrekeningen"))
  },
)
