/// <reference path="../pb_data/types.d.ts" />

// Fase 4: kopie naar Google Drive, aanmeldformulier uit Gmail en AVG.

migrate((app) => {
  const facturen = app.findCollectionByNameOrId("facturen")
  facturen.fields.add(new TextField({ name: "drive_id", max: 200 }))
  facturen.fields.add(new URLField({ name: "drive_link" }))
  app.save(facturen)

  const inst = app.findCollectionByNameOrId("instellingen")
  inst.fields.add(new BoolField({ name: "drive_kopie" }))
  inst.fields.add(new TextField({ name: "drive_map", max: 200 }))
  inst.fields.add(new TextField({ name: "aanmelding_zoekopdracht", max: 500 }))
  app.save(inst)

  const boekingen = app.findCollectionByNameOrId("boekingen")
  boekingen.fields.add(new DateField({ name: "aanmelding_op" }))
  app.save(boekingen)

  // Het maillog mag alleen worden geanonimiseerd (zie pb_hooks/avg.pb.js).
  const log = app.findCollectionByNameOrId("mail_log")
  log.updateRule = '@request.auth.id != "" && @request.auth.collectionName = "users"'
  app.save(log)

  for (const r of app.findAllRecords("instellingen")) {
    r.set("drive_kopie", true)
    r.set("drive_map", "Duc'dalf verhuurbeheer")
    r.set("aanmelding_zoekopdracht", "from:formsubmit.co aanmelding")
    app.save(r)
  }
}, (app) => {
  const facturen = app.findCollectionByNameOrId("facturen")
  facturen.fields.removeByName("drive_id")
  facturen.fields.removeByName("drive_link")
  app.save(facturen)
  const inst = app.findCollectionByNameOrId("instellingen")
  for (const n of ["drive_kopie", "drive_map", "aanmelding_zoekopdracht"]) inst.fields.removeByName(n)
  app.save(inst)
  const boekingen = app.findCollectionByNameOrId("boekingen")
  boekingen.fields.removeByName("aanmelding_op")
  app.save(boekingen)
  const log = app.findCollectionByNameOrId("mail_log")
  log.updateRule = null
  app.save(log)
})
