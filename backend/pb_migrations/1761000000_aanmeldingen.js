/// <reference path="../pb_data/types.d.ts" />

// Eigen aanmeldformulier: inzendingen komen rechtstreeks in de collectie
// `aanmeldingen` (zonder externe formulierdienst). Aanmaken kan alleen via de
// openbare route in pb_hooks/aanmelden.pb.js (die controleert en beperkt);
// lezen, bijwerken en verwijderen alleen door ingelogde gebruikers.
migrate(
  (app) => {
    const ALLEEN_INGELOGD = '@request.auth.id != "" && @request.auth.collectionName = "users"'
    const boekingen = app.findCollectionByNameOrId("boekingen")
    const collection = new Collection({
      type: "base",
      name: "aanmeldingen",
      listRule: ALLEEN_INGELOGD,
      viewRule: ALLEEN_INGELOGD,
      createRule: null,
      updateRule: ALLEEN_INGELOGD,
      deleteRule: ALLEEN_INGELOGD,
      fields: [
        // nieuw: wacht op controle · gekoppeld: automatisch verwerkt via de boekingscode
        // verwerkt: handmatig overgenomen
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["nieuw", "gekoppeld", "verwerkt"] },
        { name: "velden", type: "json", maxSize: 50000 },
        { name: "naam", type: "text", max: 200 },
        { name: "email", type: "text", max: 200 },
        { name: "aankomst", type: "text", max: 10 },
        { name: "vertrek", type: "text", max: 10 },
        { name: "boekingscode", type: "text", max: 40 },
        { name: "toelichting", type: "text", max: 500 },
        // Met de boeking verdwijnt ook de inzending (bijv. bij volledig verwijderen van een huurder).
        { name: "boeking", type: "relation", collectionId: boekingen.id, maxSelect: 1, cascadeDelete: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_aanmeldingen_status ON aanmeldingen (status)"],
    })
    app.save(collection)

    // Het openbare formulier krijgt een strengere limiet dan de rest van de API.
    const settings = app.settings()
    const regels = (settings.rateLimits.rules || []).filter((r) => String(r.label).indexOf("/api/ducdalf/aanmelden") === -1)
    regels.push({ label: "POST /api/ducdalf/aanmelden", maxRequests: 10, duration: 600, audience: "" })
    regels.push({ label: "GET /api/ducdalf/aanmelden/", maxRequests: 30, duration: 600, audience: "" })
    settings.rateLimits.rules = regels
    settings.rateLimits.enabled = true
    app.save(settings)

    // Het oude formulier op de website (FormSubmit) maakt plaats voor dat van de
    // app: een leeg adres betekent "het formulier van deze app".
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      if (/^https?:\/\/(www\.)?vakantiehuis-ducdalf\.nl\/aanmelden\/?$/.test(r.getString("aanmeldformulier_url"))) {
        r.set("aanmeldformulier_url", "")
        app.save(r)
      }
    }
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("aanmeldingen"))
    const settings = app.settings()
    settings.rateLimits.rules = (settings.rateLimits.rules || []).filter((r) => String(r.label).indexOf("/api/ducdalf/aanmelden") === -1)
    app.save(settings)
  },
)
