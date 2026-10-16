/// <reference path="../pb_data/types.d.ts" />

// Link naar het portaal van Parc le Duc (PLD) voor de stap "Aanmelden in het
// PLD-portaal", en die stap krijgt de kortere naam.
migrate(
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.add(new URLField({ name: "pld_portaal_url" }))
    app.save(inst)
    for (const r of app.findRecordsByFilter("instellingen", "id != ''", "", 0, 0)) {
      r.set("pld_portaal_url", "https://mijn.parcleduc.nl/privaat")
      app.save(r)
    }
    try {
      const s = app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'le_duc_aangemeld'")
      if (s.getString("label") === "Aangemeld in het Le Duc Portaal") s.set("label", "Aangemeld in het PLD-portaal")
      if (s.getString("actie_label") === "Aanmelden in het Le Duc Portaal") s.set("actie_label", "Aanmelden in het PLD-portaal")
      if (s.getString("omschrijving").indexOf("portaal van Parc le Duc") !== -1) {
        s.set("omschrijving", "De huurder en de meereizenden zijn aangemeld in het portaal van Parc le Duc (PLD).")
      }
      app.save(s)
    } catch (_) {}
  },
  (app) => {
    const inst = app.findCollectionByNameOrId("instellingen")
    inst.fields.removeByName("pld_portaal_url")
    app.save(inst)
  },
)
