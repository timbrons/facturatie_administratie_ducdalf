/// <reference path="../pb_data/types.d.ts" />

// Workflow:
// - nieuwe stap "Aanmelden in het Le Duc Portaal" tussen "Aanbetaling
//   ontvangen" en "Volledig betaald";
// - stap 2 heet voortaan "Afstemming met huurder".
migrate(
  (app) => {
    const zoek = (sleutel) => {
      try {
        return app.findFirstRecordByFilter("workflow_stappen", "sleutel = {:s}", { s: sleutel })
      } catch (_) {
        return null
      }
    }

    const afstemming = zoek("in_afstemming")
    if (afstemming) {
      afstemming.set("label", "Afstemming met huurder")
      app.save(afstemming)
    }

    if (!zoek("le_duc_aangemeld")) {
      const voor = zoek("aanbetaling_ontvangen")
      const na = zoek("volledig_betaald")
      const van = voor ? voor.getInt("volgorde") : 90
      const tot = na ? na.getInt("volgorde") : van + 10
      const r = new Record(app.findCollectionByNameOrId("workflow_stappen"))
      r.set("sleutel", "le_duc_aangemeld")
      r.set("label", "Aangemeld in het Le Duc Portaal")
      r.set("actie_label", "Aanmelden in het Le Duc Portaal")
      r.set("omschrijving", "De huurder en de meereizenden zijn aangemeld in het portaal van Parc le Duc.")
      r.set("volgorde", Math.floor((van + tot) / 2) > van ? Math.floor((van + tot) / 2) : van + 1)
      r.set("overslaan_als", "")
      r.set("actief", true)
      app.save(r)
    }
  },
  (app) => {
    try {
      app.delete(app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'le_duc_aangemeld'"))
    } catch (_) {}
    try {
      const r = app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'in_afstemming'")
      r.set("label", "In afstemming")
      app.save(r)
    } catch (_) {}
  },
)
