/// <reference path="../pb_data/types.d.ts" />

// De actie van de stap "Toeristenbelasting aangegeven" heet voortaan
// "Toeristenbelasting aangeven" (was "Aangifte registreren"). Alleen als de
// tekst nog de standaardtekst is.
migrate(
  (app) => {
    try {
      const s = app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'tb_aangegeven'")
      if (s.getString("actie_label") === "Aangifte registreren") {
        s.set("actie_label", "Toeristenbelasting aangeven")
        app.save(s)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const s = app.findFirstRecordByFilter("workflow_stappen", "sleutel = 'tb_aangegeven'")
      if (s.getString("actie_label") === "Toeristenbelasting aangeven") {
        s.set("actie_label", "Aangifte registreren")
        app.save(s)
      }
    } catch (_) {}
  },
)
