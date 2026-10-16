/// <reference path="../pb_data/types.d.ts" />

// Kopie van de factuur van PLD (parkkosten) in Google Drive.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("boekingen")
    c.fields.add(new TextField({ name: "parkkosten_drive_id", max: 200 }))
    c.fields.add(new TextField({ name: "parkkosten_drive_link", max: 500 }))
    app.save(c)
  },
  (app) => {
    const c = app.findCollectionByNameOrId("boekingen")
    c.fields.removeByName("parkkosten_drive_id")
    c.fields.removeByName("parkkosten_drive_link")
    app.save(c)
  },
)
