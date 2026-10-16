/// <reference path="../pb_data/types.d.ts" />

// Huurboekingen in Google Agenda bijhouden (zie agenda_sync.js).

onRecordAfterCreateSuccess((e) => {
  e.next()
  require(`${__hooks}/agenda_sync.js`).naWijziging(e.app, e.record.id)
}, "boekingen")

onRecordAfterUpdateSuccess((e) => {
  e.next()
  require(`${__hooks}/agenda_sync.js`).naWijziging(e.app, e.record.id)
}, "boekingen")

onRecordAfterDeleteSuccess((e) => {
  e.next()
  require(`${__hooks}/agenda_sync.js`).naWijziging(e.app, e.record.id)
}, "boekingen")

// Naam van de huurder gewijzigd: de afspraken van die huurder bijwerken.
onRecordAfterUpdateSuccess((e) => {
  e.next()
  const sync = require(`${__hooks}/agenda_sync.js`)
  for (const b of e.app.findRecordsByFilter("boekingen", "huurder = {:h}", "", 0, 0, { h: e.record.id })) {
    sync.naWijziging(e.app, b.id)
  }
}, "huurders")

// Vangnet: elke 10 minuten alles nalopen (ook oude boekingen en wijzigingen
// tijdens een storing bij Google).
cronAdd("ducdalf_agenda_boekingen", "*/10 * * * *", () => {
  try {
    const t = require(`${__hooks}/agenda_sync.js`).alles($app)
    if (t.fouten) $app.logger().warn("Agenda-synchronisatie met fouten", "fouten", t.fouten)
  } catch (err) {
    $app.logger().warn("Agenda-synchronisatie mislukt", "fout", String(err))
  }
})

// Handmatig vanuit Instellingen: nu alles bijwerken.
routerAdd("POST", "/api/ducdalf/agenda/boekingen", (e) => {
  const t = require(`${__hooks}/agenda_sync.js`).alles(e.app)
  return e.json(200, t)
}, $apis.requireAuth("users"))
