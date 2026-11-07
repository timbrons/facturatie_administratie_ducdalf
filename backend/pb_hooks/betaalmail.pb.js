/// <reference path="../pb_data/types.d.ts" />

// Betaalbevestigingen toeristenbelasting uit Gmail vastleggen (zie betaalmail.js).

cronAdd("ducdalf_betaalmails", "*/30 * * * *", () => {
  try {
    const r = require(`${__hooks}/betaalmail.js`).ophalen($app)
    if (r.nieuw) $app.logger().info("Betaalbevestigingen toeristenbelasting vastgelegd", "nieuw", r.nieuw)
  } catch (err) {
    $app.logger().warn("Betaalbevestigingen ophalen mislukt", "fout", String(err))
  }
})

// Handmatig vanuit Financieel → Toeristenbelasting: nu ophalen.
routerAdd("POST", "/api/ducdalf/uitgaven/betaalmails", (e) => {
  try {
    return e.json(200, require(`${__hooks}/betaalmail.js`).ophalen(e.app))
  } catch (err) {
    return e.json(502, { nieuw: 0, melding: "Ophalen uit Gmail mislukt: " + String(err) })
  }
}, $apis.requireAuth("users"))
