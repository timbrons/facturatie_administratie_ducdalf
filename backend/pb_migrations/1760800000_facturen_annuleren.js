/// <reference path="../pb_data/types.d.ts" />

// Geen creditfacturen meer: een factuur wordt voortaan geannuleerd
// (geannuleerd_op). Hij blijft bewaard met zijn nummer, maar telt niet meer
// mee. Een terugbetaling wordt met de huurder afgesproken en als negatieve
// betaling geregistreerd.
//
// Bestaande creditfacturen worden omgezet: de factuur waar ze naar verwezen
// krijgt de datum van de creditfactuur als annuleringsdatum, en de
// creditfactuur verdwijnt. Waren de creditfacturen de laatste nummers van
// hun jaar, dan schuift de nummerreeks terug, zodat er geen gat ontstaat.
migrate(
  (app) => {
    const facturen = app.findCollectionByNameOrId("facturen")
    facturen.fields.add(new TextField({ name: "geannuleerd_op", max: 10, pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" }))
    app.save(facturen)

    const verwijderd = {}
    for (const c of app.findRecordsByFilter("facturen", "soort = 'credit'", "", 0, 0)) {
      const origineelId = c.getString("verwijst_naar")
      if (origineelId) {
        try {
          const o = app.findRecordById("facturen", origineelId)
          if (!o.getString("geannuleerd_op")) {
            o.set("geannuleerd_op", c.getString("factuurdatum"))
            app.save(o)
          }
        } catch (_) {}
      }
      const m = /^(\d{4})-(\d{3,})$/.exec(c.getString("nummer"))
      if (m) {
        verwijderd[m[1]] = verwijderd[m[1]] || {}
        verwijderd[m[1]][parseInt(m[2], 10)] = true
      }
      app.delete(c)
    }

    for (const jaar of Object.keys(verwijderd)) {
      let reeks
      try {
        reeks = app.findFirstRecordByFilter("nummerreeksen", "jaar = {:j}", { j: parseInt(jaar, 10) })
      } catch (_) {
        continue
      }
      let laatste = reeks.getInt("laatste")
      while (laatste > 0 && verwijderd[jaar][laatste]) laatste--
      if (laatste !== reeks.getInt("laatste")) {
        reeks.set("laatste", laatste)
        app.save(reeks)
      }
    }
  },
  (app) => {
    const facturen = app.findCollectionByNameOrId("facturen")
    facturen.fields.removeByName("geannuleerd_op")
    app.save(facturen)
  },
)
