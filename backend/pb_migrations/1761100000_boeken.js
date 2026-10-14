/// <reference path="../pb_data/types.d.ts" />

// Openbaar boekingsformulier: eigen limieten voor de routes in
// pb_hooks/boeken.pb.js (bovenop de algemene limieten).
migrate(
  (app) => {
    const settings = app.settings()
    const regels = (settings.rateLimits.rules || []).filter((r) => String(r.label).indexOf("/api/ducdalf/boeken") === -1)
    regels.push({ label: "POST /api/ducdalf/boeken", maxRequests: 10, duration: 600, audience: "" })
    regels.push({ label: "GET /api/ducdalf/boeken/", maxRequests: 60, duration: 600, audience: "" })
    settings.rateLimits.rules = regels
    settings.rateLimits.enabled = true
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.rateLimits.rules = (settings.rateLimits.rules || []).filter((r) => String(r.label).indexOf("/api/ducdalf/boeken") === -1)
    app.save(settings)
  },
)
